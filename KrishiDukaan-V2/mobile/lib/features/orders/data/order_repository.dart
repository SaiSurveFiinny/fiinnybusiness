import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/models/order_model.dart';

class OrderRepository {
  final _db = FirebaseFirestore.instance;

  /// Last-resort owner lookup for a cart item that carries no sellerPhone.
  ///
  /// Prefers a phone (the security rule reads `sellerPhone == myPhone()`) and
  /// falls back to the owner UID, matching how web-created orders are keyed.
  /// Returns '' only if the product doc is gone — never throws, because the
  /// payment has already succeeded by the time this runs and losing the order
  /// would be far worse than an imperfect key.
  Future<String> _resolveSellerKeyFromProduct(CartItemModel item) async {
    try {
      final snap = await _db.collection('products').doc(item.catalogId).get();
      final d = snap.data();
      if (d == null) return '';

      // 1. The ordered doc owns itself.
      final own = _ownerOf(d);
      if (own.isNotEmpty) return own;

      // 2. Ownerless CANONICAL catalog doc (source: 'admin', flagged
      //    online_delivery but carrying no retailer*/owner* fields at all).
      //    The real seller lives on a separate copy doc that the marketplace
      //    merges in by name — see CatalogRepository.fetchAllMergedProducts.
      //    Only trust it when a single seller stocks the product; if two do,
      //    guessing would credit one seller with another's order.
      final name = (d['name'] as String?)?.trim() ?? '';
      if (name.isEmpty) return '';

      final siblings =
          await _db.collection('products').where('name', isEqualTo: name).get();
      final owners = siblings.docs
          .map((s) => s.data())
          .where((s) => _copySources.contains(s['source'] as String? ?? ''))
          .map(_ownerOf)
          .where((o) => o.isNotEmpty)
          .toSet();

      if (owners.length == 1) return owners.first;
    } catch (_) {
      // Fall through — an unkeyed order still beats a dropped paid order.
      // backfillOrderSeller repairs whatever reaches Firestore unkeyed.
    }
    return '';
  }

  /// Sources marking a doc as a seller's copy of a canonical catalog product.
  static const _copySources = {
    'admin_assigned',
    'manufacturer_assigned',
    'retailer_inventory_copy',
  };

  /// First non-empty ownership field on a product doc, phone-first, or ''.
  static String _ownerOf(Map<String, dynamic> d) {
    for (final field in ['retailerPhone', 'ownerPhone', 'retailerId', 'ownerId']) {
      final v = (d[field] as String?)?.trim();
      if (v != null && v.isNotEmpty) return v;
    }
    return '';
  }

  /// Creates one order doc per unique seller after successful payment.
  Future<void> createOrdersAfterPayment({
    required List<CartItemModel> items,
    required String customerName,
    required String customerPhone,
    required Map<String, dynamic> customerAddress,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required Map<String, double> deliveryChargesBySeller,
  }) async {
    final user = FirebaseAuth.instance.currentUser!;

    // Group cart items by seller. A cart item whose sellerPhone is empty (the
    // product carried no resolvable owner field) must NOT be grouped under ''
    // — that writes a paid order with no seller key, which no dashboard query
    // can ever match. Recover the owner from the product doc instead.
    final Map<String, List<CartItemModel>> bySeller = {};
    for (final item in items) {
      var key = item.sellerPhone.trim();
      if (key.isEmpty) key = await _resolveSellerKeyFromProduct(item);
      bySeller.putIfAbsent(key, () => []).add(item);
    }

    final batch = _db.batch();

    for (final entry in bySeller.entries) {
      final sellerPhone = entry.key;
      final sellerItems = entry.value;
      final sellerName = sellerItems.first.sellerName;

      final subtotal = sellerItems.fold(
          0.0, (acc, i) => acc + i.price * i.quantity);
      final sellerGst = sellerItems.fold(
          0.0, (acc, i) => acc + i.lineGst);
      final deliveryCharge = deliveryChargesBySeller[sellerPhone] ?? 0.0;
      final grandTotal = subtotal + sellerGst + deliveryCharge;

      final orderRef = _db.collection('orders').doc();
      batch.set(orderRef, {
        'customerId': user.uid,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'customerAddress': customerAddress,
        // sellerId kept as phone for legacy query compatibility. May also be
        // an owner UID when the product carried no phone — web-created orders
        // are keyed that way too, so the dashboard matches either.
        'sellerId': sellerPhone,
        // sellerPhone backs the security rule `sellerPhone == myPhone()`, so
        // only write it when the key really is a phone — a UID here would make
        // the rule silently unsatisfiable for the seller.
        'sellerPhone':
            RegExp(r'^\+?[0-9]{10,13}$').hasMatch(sellerPhone) ? sellerPhone : '',
        'sellerName': sellerName,
        'sellerType': 'retailer',
        'items': sellerItems
            .map((i) => {
                  'catalogId': i.catalogId,
                  'name': i.catalogName,
                  if (i.catalogImage != null) 'image': i.catalogImage,
                  'price': i.price,
                  'quantity': i.quantity,
                  if (i.variantLabel != null) 'variantLabel': i.variantLabel,
                  'listingId': i.listingId,
                  'gstApplicable': i.gstApplicable,
                  'gstRate': i.gstRate,
                  'gstAmount': i.unitGst,
                })
            .toList(),
        'subtotal': subtotal,
        'totalGst': sellerGst,
        'deliveryCharge': deliveryCharge,
        'total': grandTotal,
        // Rules require status == 'placed' on order create
        'status': 'placed',
        'payment': {
          'razorpayOrderId': razorpayOrderId,
          'razorpayPaymentId': razorpayPaymentId,
          'status': 'paid',
          'amount': grandTotal,
        },
        'createdAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /// Streams all orders for the current user — as buyer and as seller.
  /// Runs three separate queries so a permission denial on any one (e.g. phone
  /// queries when myPhone() fails in rules) never kills the other results.
  Stream<List<OrderModel>> watchCustomerOrders() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return Stream.value([]);

    final phone = user.phoneNumber ?? '';

    final controller = StreamController<List<OrderModel>>();
    List<DocumentSnapshot> uidDocs    = [];
    List<DocumentSnapshot> buyerDocs  = [];
    List<DocumentSnapshot> sellerDocs = [];

    void emit() {
      final seen = <String>{};
      final orders = [...uidDocs, ...buyerDocs, ...sellerDocs]
          .where((d) => seen.add(d.id))
          .map((d) {
            try { return OrderModel.fromFirestore(d); } catch (_) { return null; }
          })
          .whereType<OrderModel>()
          .toList()
        ..sort((a, b) =>
            (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
      if (!controller.isClosed) controller.add(orders);
    }

    // Query 1: by Firebase Auth UID — always allowed by security rules
    final sub1 = _db.collection('orders')
        .where('customerId', isEqualTo: user.uid)
        .snapshots()
        .listen((s) { uidDocs = s.docs; emit(); }, onError: (_) {});

    // Queries 2 & 3: by phone — may be denied if myPhone() fails in rules; silenced
    StreamSubscription? sub2;
    StreamSubscription? sub3;
    if (phone.isNotEmpty) {
      sub2 = _db.collection('orders')
          .where('customerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { buyerDocs = s.docs; emit(); }, onError: (_) {});
      sub3 = _db.collection('orders')
          .where('sellerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { sellerDocs = s.docs; emit(); }, onError: (_) {});
    }

    controller.onCancel = () {
      sub1.cancel();
      sub2?.cancel();
      sub3?.cancel();
    };
    return controller.stream;
  }

  Future<OrderModel?> fetchById(String orderId) async {
    final doc = await _db.collection('orders').doc(orderId).get();
    if (!doc.exists) return null;
    return OrderModel.fromFirestore(doc);
  }
}
