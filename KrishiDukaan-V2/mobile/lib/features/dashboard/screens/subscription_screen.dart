import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import '../../../core/payments/app_razorpay.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../cart/data/payment_service.dart' show PaymentService;
import '../providers/dashboard_provider.dart';

// Server-side price per seat (matches API: PRICE_PER_SEAT in create-order/route.ts)
const _pricePerSeat = {1: 21, 3: 54, 6: 90, 12: 144};

/// Seats are sold in blocks of this size, and this is also the minimum buy.
/// Must stay in sync with SEAT_STEP in app/lib/pricing.ts, which
/// /api/payment/create-order enforces server-side.
const _seatStep = 10;

/// One-tap seat quantities offered under the input.
const _seatPresets = [10, 100, 500];

/// Snaps a requested seat count to the sale rule: at least [_seatStep], and
/// always a whole multiple of it. Rounds UP rather than to nearest so a seller
/// who needs 15 slots gets 20 and never ends up with fewer than they asked for.
/// Mirrors normalizeSeatCount in app/lib/pricing.ts — the server runs the same
/// rule, so the seat count priced here is the one actually charged.
int _normalizeSeats(int raw) {
  if (raw <= _seatStep) return _seatStep;
  return ((raw + _seatStep - 1) ~/ _seatStep) * _seatStep;
}

const _durations = [
  _Duration(months: 1, label: '1 Month'),
  _Duration(months: 3, label: '3 Months', badge: 'SAVE 14%'),
  _Duration(months: 6, label: '6 Months', badge: 'SAVE 29%'),
  _Duration(months: 12, label: '1 Year', badge: 'BEST VALUE'),
];

class _Duration {
  final int months;
  final String label;
  final String? badge;
  const _Duration({required this.months, required this.label, this.badge});
  int totalPrice(int seats) => seats * (_pricePerSeat[months] ?? months * 21);
}

class SubscriptionScreen extends ConsumerStatefulWidget {
  /// 'new_account' → just signed up; 'paywall' → bounced off the dashboard;
  /// 'renewal' → opened from a subscription_expiry notification.
  final String? reason;

  /// Seats and plan length from the user's expiring subscription, passed by a
  /// subscription_expiry notification so renewal comes up pre-configured and
  /// the user only has to pay. Null when the screen is opened any other way.
  final int? initialSeats;
  final int? initialMonths;

  const SubscriptionScreen({
    super.key,
    this.reason,
    this.initialSeats,
    this.initialMonths,
  });

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  late final AppRazorpay _razorpay;
  int _seats = _seatStep;
  late final TextEditingController _seatCtrl;
  _Duration _duration = _durations[0];
  bool _loading = false;
  String? _error;
  String? _razorpayOrderId;
  /// Order amount in PAISE — see checkout_screen for why this is retained.
  int? _razorpayAmount;

  @override
  void initState() {
    super.initState();
    _razorpay = AppRazorpay(onSuccess: _onSuccess, onError: _onError);

    // Preselect the expiring plan on a renewal. An unrecognised month count
    // (an old or admin-set plan length) falls back to the default rather than
    // leaving the screen with no duration selected.
    //
    // A legacy subscription may carry a seat count from before the 10-seat
    // blocks rule (e.g. 1 or 5), so it is normalized too — otherwise renewal
    // would show a price the server won't honour.
    final seats = widget.initialSeats;
    if (seats != null && seats > 0) _seats = _normalizeSeats(seats);
    _seatCtrl = TextEditingController(text: '$_seats');

    final months = widget.initialMonths;
    if (months != null) {
      for (final d in _durations) {
        if (d.months == months) {
          _duration = d;
          break;
        }
      }
    }
  }

  @override
  void dispose() {
    _razorpay.clear();
    _seatCtrl.dispose();
    super.dispose();
  }

  /// Applies a new seat count and keeps the text field in step with it.
  void _setSeats(int raw) {
    final next = _normalizeSeats(raw);
    setState(() => _seats = next);
    if (_seatCtrl.text != '$next') {
      _seatCtrl.text = '$next';
      _seatCtrl.selection =
          TextSelection.collapsed(offset: _seatCtrl.text.length);
    }
  }

  Future<void> _startPayment() async {
    final user = ref.read(currentUserProvider).value;
    if (user == null) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // Create Razorpay order server-side so amount is tamper-proof.
      final res = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-order'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'seatCount': _seats,
              'durationMonths': _duration.months,
              'userId': user.uid,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (res.statusCode != 200) {
        throw Exception('Payment server error (${res.statusCode}). '
            'Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set '
            'in your production environment.');
      }

      final order = jsonDecode(res.body) as Map<String, dynamic>;
      if (order['error'] != null) throw Exception(order['error']);

      // Use the key the backend used to create the order so they always match.
      final razorpayKey = order['key_id'] as String? ?? AppConfig.razorpayKeyId;
      _razorpayOrderId = order['id'] as String?;
      _razorpayAmount = (order['amount'] as num?)?.toInt();

      _razorpay.open({
        'key': razorpayKey,
        'amount': order['amount'],
        'currency': order['currency'] ?? 'INR',
        'order_id': _razorpayOrderId,
        'name': 'KrishiDukan',
        'description':
            '$_seats seat${_seats != 1 ? 's' : ''} · ${_duration.label}',
        'prefill': {
          'contact': user.phone,
          'name': user.name,
          if (user.email != null) 'email': user.email,
        },
        'theme': {'color': '#2E7D32'},
        // See checkout_screen.dart's identical option for the full story:
        // the checkout SDK's own completion wait (default 3 minutes) is
        // tight for a UPI collect approval, and giving up on that wait is
        // not the same as Razorpay not having captured the payment.
        // _onError still reconciles against Razorpay directly for whatever
        // slips past this wider window.
        'timeout': 300,
      });
    } catch (e) {
      setState(() {
        _error = 'Could not start payment: $e';
        _loading = false;
      });
    }
  }

  void _onSuccess(AppPaymentSuccess response) async {
    setState(() => _loading = true);

    try {
      // Verify payment signature with backend API
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      final verifyRes = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/payment/verify'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'razorpay_order_id': response.orderId,
          'razorpay_payment_id': response.paymentId,
          'razorpay_signature': response.signature,
        }),
      );

      if (verifyRes.statusCode != 200) {
        throw Exception('Payment verification failed');
      }

      final verifyData = jsonDecode(verifyRes.body) as Map<String, dynamic>;
      if (verifyData['status'] != 'ok') {
        throw Exception('Payment verification failed');
      }

      final verifiedSeatCount = (verifyData['seatCount'] as num?)?.toInt() ?? _seats;

      await _activateSubscription(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        seatCount: verifiedSeatCount,
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Payment verification or DB update failed: $e';
        });
      }
    }
  }

  /// Writes the subscription to Firestore, shared by the normal success
  /// callback and [_onError]'s reconciliation path. [seatCount] comes from
  /// the order's own server-set `notes` either way — via /verify on success,
  /// or via /api/payment/order-status when reconciling a payment the
  /// checkout SDK reported as failed but Razorpay actually captured.
  Future<void> _activateSubscription({
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required int seatCount,
  }) async {
    final user = ref.read(currentUserProvider).value!;
    final firebaseUser = FirebaseAuth.instance.currentUser!;

    final userDocRef = FirebaseFirestore.instance.collection('users').doc(user.phone);
    final currentSeats = user.totalSeats;
    final seatsToAdd = seatCount;

    final batch = FirebaseFirestore.instance.batch();

    // If user is still 'consumer', upgrade to 'retailer' so canAccessDashboard
    // returns true after payment (consumers who pay should get seller access).
    final roleUpdate = user.role == 'consumer' ? {'role': 'retailer'} : <String, dynamic>{};
    batch.update(userDocRef, {
      'isPaid': true,
      'subscriptionStatus': 'paid',
      'paymentDetails': {
        'orderId': razorpayOrderId,
        'paymentId': razorpayPaymentId,
      },
      'totalSeats': currentSeats + seatsToAdd,
      'updatedAt': FieldValue.serverTimestamp(),
      ...roleUpdate,
    });

    final pricePerSeat = _pricePerSeat[_duration.months] ?? 21;
    final totalAmount = seatsToAdd * pricePerSeat;

    final now = DateTime.now();
    final expiry = DateTime.now().add(Duration(days: _duration.months * 30));

    final paymentRef = FirebaseFirestore.instance.collection('payments').doc();
    batch.set(paymentRef, {
      'userId': firebaseUser.uid,
      'userPhone': user.phone,
      'amount': totalAmount,
      'seatCount': seatsToAdd,
      'durationMonths': _duration.months,
      'currency': 'INR',
      'razorpayOrderId': razorpayOrderId,
      'razorpayPaymentId': razorpayPaymentId,
      'timestamp': FieldValue.serverTimestamp(),
      'status': 'success',
    });

    final subRef = FirebaseFirestore.instance.collection('subscriptions').doc();
    batch.set(subRef, {
      'ownerId': firebaseUser.uid,
      'ownerPhone': user.phone,
      'ownerType': user.role == 'manufacturer' ? 'manufacturer' : 'retailer',
      'planName': 'Standard',
      'seatsPurchased': seatsToAdd,
      'durationMonths': _duration.months,
      'amountPaid': totalAmount,
      'currency': 'INR',
      'razorpayOrderId': razorpayOrderId,
      'razorpayPaymentId': razorpayPaymentId,
      'subscriptionStatus': 'active',
      'startDate': Timestamp.fromDate(now),
      'expiryDate': Timestamp.fromDate(expiry),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Refresh the user state so changes propagate to dashboard and shell
    ref.invalidate(currentUserProvider);
    // Refresh seat counts so "X left · used/total" updates immediately.
    ref.invalidate(seatStatsProvider);

    setState(() => _loading = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Subscription activated!'),
          backgroundColor: AppColors.success,
        ),
      );
      // New sellers complete their shop profile before landing on the
      // dashboard; existing users buying more seats go straight back.
      context.go(widget.reason == 'new_account'
          ? '/profile/edit?reason=new_account'
          : '/dashboard');
    }
  }

  /// Fires on both a genuine failure AND on the checkout SDK simply giving up
  /// waiting ("...could not complete it in time") — not the same thing as
  /// Razorpay not having captured the payment. Before telling the seller
  /// their purchase failed, this checks Razorpay's own records for the
  /// order; if it actually went through, the subscription is activated
  /// exactly as it would be on success instead of stranding a charged seller
  /// with no seats. See PaymentService.checkOrderStatus for the full story.
  void _onError(AppPaymentError r) async {
    final orderId = _razorpayOrderId;
    if (orderId == null) {
      setState(() {
        _loading = false;
        _error = r.message;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final reconciliation = await PaymentService().checkOrderStatus(orderId);

    if (reconciliation.captured && reconciliation.paymentId != null) {
      final seatCount =
          (reconciliation.notes?['seatCount'] as num?)?.toInt() ?? _seats;
      try {
        await _activateSubscription(
          razorpayOrderId: orderId,
          razorpayPaymentId: reconciliation.paymentId!,
          seatCount: seatCount,
        );
        return; // _activateSubscription already navigated away on success.
      } catch (e) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = 'Payment verification or DB update failed: $e';
          });
        }
        return;
      }
    }

    // Log only a CONFIRMED failure so the admin's Failed Payments tab
    // reflects reality — never log when checkFailed is true, since that
    // means we genuinely don't know the outcome.
    if (!reconciliation.checkFailed) {
      unawaited(PaymentService().logFailedPayment(
        r.message,
        orderId: orderId,
        amount: _razorpayAmount,
      ));
    }

    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = reconciliation.checkFailed
          // We genuinely don't know the outcome — never tell a seller who
          // might have been charged that their payment definitely failed.
          ? 'We could not confirm your payment status. If any amount was '
              'deducted, it will be refunded automatically within 5-7 '
              'business days. Please check back before retrying, or '
              'contact support.'
          : r.message;
    });
  }

  Widget _noticeBanner({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: AppTextStyles.bodyMedium.copyWith(
                        color: color, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(subtitle, style: AppTextStyles.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);
    final isPaid = userAsync.value?.isPaid ?? false;
    final totalPrice = _duration.totalPrice(_seats);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Subscription',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (!isPaid && widget.reason == 'new_account')
            _noticeBanner(
              icon: Icons.celebration_outlined,
              color: AppColors.primary,
              title: 'Welcome to KrishiDukan! 🎉',
              subtitle:
                  'Your account is ready. Subscribe to unlock your dashboard, '
                  'list products and start selling.',
            ),
          if (!isPaid && widget.reason == 'paywall')
            _noticeBanner(
              icon: Icons.lock_outline,
              color: AppColors.warning,
              title: 'Subscription required',
              subtitle:
                  'The dashboard is locked until you have an active '
                  'subscription. Pick a plan below to continue.',
            ),
          // Renewal arrives while the subscription is still active, so this
          // banner is deliberately not gated on !isPaid the way the two above
          // are — the plan picker below is already preselected to their
          // current seats and duration.
          if (widget.reason == 'renewal')
            _noticeBanner(
              icon: Icons.hourglass_bottom_rounded,
              color: AppColors.warning,
              title: 'Renew your subscription',
              subtitle:
                  'Your current plan is selected below. Complete the payment '
                  'to keep your dashboard and listings live.',
            ),
          if (isPaid && widget.reason != 'renewal')
            Container(
              margin: const EdgeInsets.only(bottom: 20),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: AppColors.success.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.verified, color: AppColors.success),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Active Subscription',
                            style: AppTextStyles.bodyMedium
                                .copyWith(color: AppColors.success)),
                        Text('Your store is fully activated',
                            style: AppTextStyles.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          Text('Choose Your Plan', style: AppTextStyles.heading2),
          const SizedBox(height: 6),
          Text(
            'Pay per seat. One seat = one product listing slot.',
            style:
                AppTextStyles.body.copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 24),

          // ── Seat picker ───────────────────────────────────────────────────
          _SectionCard(
            title: 'Number of Seats',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconButton(
                      onPressed: _seats > _seatStep
                          ? () => _setSeats(_seats - _seatStep)
                          : null,
                      icon: const Icon(Icons.remove_circle_outline),
                      color: AppColors.primary,
                    ),
                    // Typed entry — buying 100 seats used to mean 100 taps on +.
                    SizedBox(
                      width: 76,
                      child: TextField(
                        controller: _seatCtrl,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(5),
                        ],
                        style: AppTextStyles.heading2,
                        decoration: const InputDecoration(
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 8),
                        ),
                        // Snap to the 10-block rule only once editing ends, so
                        // the field stays freely editable while typing (an
                        // in-progress "1" of "100" must not jump to 10).
                        onChanged: (v) {
                          final n = int.tryParse(v);
                          if (n != null) setState(() => _seats = _normalizeSeats(n));
                        },
                        onEditingComplete: () {
                          _setSeats(int.tryParse(_seatCtrl.text) ?? _seatStep);
                          FocusScope.of(context).unfocus();
                        },
                        onTapOutside: (_) {
                          _setSeats(int.tryParse(_seatCtrl.text) ?? _seatStep);
                          FocusScope.of(context).unfocus();
                        },
                      ),
                    ),
                    IconButton(
                      onPressed: () => _setSeats(_seats + _seatStep),
                      icon: const Icon(Icons.add_circle_outline),
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '$_seats product listing slots',
                        style: AppTextStyles.body
                            .copyWith(color: AppColors.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    for (final n in _seatPresets) ...[
                      Expanded(
                        child: ChoiceChip(
                          label: Text('$n seats'),
                          selected: _seats == n,
                          onSelected: (_) => _setSeats(n),
                        ),
                      ),
                      if (n != _seatPresets.last) const SizedBox(width: 8),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Sold in blocks of $_seatStep · minimum $_seatStep seats',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Duration picker ───────────────────────────────────────────────
          _SectionCard(
            title: 'Duration',
            child: Column(
              children: _durations.map((d) {
                final selected = _duration.months == d.months;
                return GestureDetector(
                  onTap: () => setState(() => _duration = d),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppColors.primaryContainer.withValues(alpha: 0.3)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: selected
                            ? AppColors.primary
                            : AppColors.divider,
                        width: selected ? 2 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          selected
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked,
                          color: selected
                              ? AppColors.primary
                              : AppColors.onSurfaceVariant,
                          size: 18,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Row(
                            children: [
                              Text(d.label,
                                  style: AppTextStyles.bodyMedium),
                              if (d.badge != null) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.secondary,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(d.badge!,
                                      style: AppTextStyles.caption.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w700)),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Text(
                          CurrencyUtils.format(d.totalPrice(_seats).toDouble()),
                          style: AppTextStyles.price,
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          // ── Price summary ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$_seats seat${_seats != 1 ? 's' : ''} × ${_duration.label}',
                      style: AppTextStyles.bodySmall,
                    ),
                    Text(
                      CurrencyUtils.format(totalPrice.toDouble()),
                      style: AppTextStyles.priceLarge,
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('₹${_pricePerSeat[_duration.months]}/seat',
                        style: AppTextStyles.caption),
                    Text('one-time payment',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── Features ──────────────────────────────────────────────────────
          _SectionCard(
            title: "What's included",
            child: Column(
              children: [
                'Inventory management',
                'Real-time order tracking',
                'Discount management',
                'Delivery settings',
                'Analytics dashboard',
                'Customer order notifications',
              ]
                  .map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            const Icon(Icons.check_circle,
                                color: AppColors.success, size: 18),
                            const SizedBox(width: 8),
                            Text(f, style: AppTextStyles.body),
                          ],
                        ),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: 8),

          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: AppColors.error.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline,
                        color: AppColors.error, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(_error!,
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.error))),
                  ],
                ),
              ),
            ),

          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _startPayment,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(
                      'Pay ${CurrencyUtils.format(totalPrice.toDouble())} · Unlock $_seats seat${_seats != 1 ? 's' : ''}',
                      style: AppTextStyles.button,
                    ),
            ),
          ),

          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_outline,
                  size: 12, color: AppColors.onSurfaceVariant),
              const SizedBox(width: 4),
              Text('Secured by Razorpay',
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 4,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
