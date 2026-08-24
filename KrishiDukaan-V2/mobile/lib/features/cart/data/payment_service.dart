import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../../../core/constants/app_config.dart';
import '../../../core/models/cart_model.dart';

/// Result of asking Razorpay directly whether an order actually has a
/// captured payment. See [PaymentService.checkOrderStatus].
class PaymentReconciliation {
  /// True only when Razorpay confirms the money was actually taken.
  final bool captured;

  /// Populated whenever Razorpay found a payment attempt against the order,
  /// captured or not — useful for support/debugging even when [captured] is
  /// false.
  final String? paymentId;

  /// True only when the reconciliation call itself could not be completed
  /// (network/server error). The customer's actual payment status is
  /// UNKNOWN in that case, which the UI must word differently from a
  /// confirmed failure.
  final bool checkFailed;

  /// The Razorpay order's own `notes` (seatCount, durationMonths, etc.) when
  /// [captured] is true — the same trusted, server-computed values
  /// /api/payment/verify reads for a normal success. Lets a reconciled
  /// subscription purchase (see subscription_screen.dart) recover the seat
  /// count it paid for without a second round-trip that would need a
  /// signature this path doesn't have.
  final Map<String, dynamic>? notes;

  const PaymentReconciliation({
    required this.captured,
    this.paymentId,
    required this.checkFailed,
    this.notes,
  });
}

class PaymentService {
  /// Creates a Razorpay order via the existing Next.js API.
  ///
  /// The web API `/api/payment/create-cart-order` expects:
  ///   items[].productId  – the listing / inventory doc ID
  ///   items[].sellerId   – seller phone (used for inventory lookup)
  ///   items[].sellerPhone – seller phone (redundant but accepted)
  ///   items[].qty        – quantity
  ///   userId             – Firebase Auth UID of the buyer
  ///   clientSubtotal     – rupee subtotal computed client-side
  ///   clientDelivery     – extra charges on top of the subtotal
  ///   clientGrandTotal   – clientSubtotal + clientDelivery
  ///
  /// IMPORTANT — amount contract: the server charges
  /// `serverSubtotal + clientDelivery` and has no GST field, so GST must be
  /// folded into `clientDelivery`. This mirrors the web client, which sends
  /// `clientDelivery = grandTotal - subtotal` (delivery + GST combined).
  /// Do NOT add a separate gst field here without also changing the server,
  /// or the buyer would be double-charged.
  ///
  /// Returns the full Razorpay order object. Use `result['id']` as the
  /// Razorpay order_id (NOT `result['orderId']` – that field doesn't exist).
  Future<Map<String, dynamic>> createCartOrder({
    required List<CartItemModel> items,
    required String userId,
    required double clientDelivery,
    required double clientGst,
  }) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final clientSubtotal =
        items.fold<double>(0.0, (sum, i) => sum + i.price * i.quantity);
    // Fold GST into the delivery figure — see the amount contract above.
    final deliveryPlusGst = clientDelivery + clientGst;
    final clientGrandTotal = clientSubtotal + deliveryPlusGst;

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-cart-order'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        // Map mobile cart fields → web API contract
        'items': items.map((i) => {
          // catalogId is the canonical product doc ID; the server uses it to
          // find the seller's product copy or read availability[] pricing.
          'productId': i.catalogId,
          // sellerId and sellerPhone both carry the seller phone so the
          // server-side inventory lookup succeeds on either field
          'sellerId': i.sellerPhone,
          'sellerPhone': i.sellerPhone,
          'qty': i.quantity,
        }).toList(),
        'userId': userId,
        'clientSubtotal': clientSubtotal,
        'clientDelivery': deliveryPlusGst,
        'clientGrandTotal': clientGrandTotal,
        'note': 'Mobile Cart Order',
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to create order: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Confirms whether a Razorpay order actually has a captured payment,
  /// straight from Razorpay's own records — independent of what the checkout
  /// SDK told the app.
  ///
  /// This exists because the native checkout SDK gives up waiting for a
  /// payment after its own internal timeout and reports PAYMENT_ERROR with
  /// "you could not complete it in time" the moment that happens — even when
  /// the customer's bank/UPI app goes on to approve the payment a few seconds
  /// later and Razorpay captures it. The app must never take the SDK's local
  /// timeout as proof the customer wasn't charged; it asks the server (which
  /// asks Razorpay directly) before showing a failure the customer didn't
  /// actually experience.
  Future<PaymentReconciliation> checkOrderStatus(String razorpayOrderId) async {
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (token == null) {
        return const PaymentReconciliation(captured: false, checkFailed: true);
      }

      final response = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/payment/order-status'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'razorpay_order_id': razorpayOrderId}),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        return const PaymentReconciliation(captured: false, checkFailed: true);
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final status = data['status'] as String?;
      return PaymentReconciliation(
        captured: status == 'captured',
        paymentId: data['paymentId'] as String?,
        checkFailed: false,
        notes: (data['notes'] as Map<String, dynamic>?),
      );
    } catch (_) {
      return const PaymentReconciliation(captured: false, checkFailed: true);
    }
  }

  /// Records a genuine payment failure to the `failedPayments` collection so
  /// it shows up in the admin dashboard's Failed Payments tab — mirrors
  /// `logFailedPayment` in app/firebase.ts (web). Previously nothing on
  /// mobile ever wrote here, so admin had to check Razorpay's own dashboard
  /// directly for any failure a mobile customer hit.
  ///
  /// Call this only for a CONFIRMED failure (i.e. after [checkOrderStatus]
  /// shows the payment was not captured) — never for the SDK's own timeout
  /// signal alone, which does not mean the payment actually failed.
  /// [amount] is in PAISE (Razorpay's own unit), matching what web's
  /// logFailedPayment stores and what the admin Failed Payments card renders
  /// (it divides by 100).
  Future<void> logFailedPayment(
    String message, {
    String? orderId,
    int? amount,
  }) async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;
      final db = FirebaseFirestore.instance;

      String? phone;
      try {
        final idx = await db.collection('uidIndex').doc(user.uid).get();
        phone = idx.data()?['phone'] as String?;
      } catch (_) {}

      await db.collection('failedPayments').add({
        'userId': user.uid,
        'userPhone': phone ?? user.uid,
        'userUid': user.uid,
        'error': {
          'reason': null,
          'description': message,
          'code': null,
          'source': null,
          'step': null,
          'metadata': null,
        },
        'orderId': orderId,
        'amount': amount,
        'seatCount': null,
        'durationMonths': null,
        'timestamp': FieldValue.serverTimestamp(),
        'status': 'failed',
      });
    } catch (_) {
      // Best-effort — never block the failure UI on a logging error.
    }
  }

  /// Verifies Razorpay payment signature via the existing Next.js API.
  Future<bool> verifyPayment({
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/payment/verify'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'razorpay_order_id': razorpayOrderId,
        'razorpay_payment_id': razorpayPaymentId,
        'razorpay_signature': razorpaySignature,
      }),
    );

    return response.statusCode == 200;
  }
}
