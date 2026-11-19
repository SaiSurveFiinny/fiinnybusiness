/// Who gets which rupee of an online order: the reader side of the
/// settlement plan.
///
/// A DELIBERATE MIRROR of `settlementView` in
/// functions/src/payouts/settlement.ts (the server makes the plan at checkout
/// and stamps it on the order; docs/delivery-money-architecture.md). Only the
/// reader lives here: the app never makes or changes a plan. The test
/// (test/settlement_test.dart) pins the same numbers as
/// scripts/tests/settlement.test.ts; change both together.
library;

/// A percentage of a paise amount, rounded UP to a whole paise.
int pctOfPaise(int paise, num percent) {
  if (percent <= 0 || paise <= 0) return 0;
  final scaled = paise * (percent * 100).round();
  return (scaled + 9999) ~/ 10000;
}

class SplitRates {
  final double commissionPercent;
  final double gatewayFeePercent;
  final double gatewayFeeGstPercent;
  final bool sellerBearsFee;

  const SplitRates({
    required this.commissionPercent,
    required this.gatewayFeePercent,
    required this.gatewayFeeGstPercent,
    required this.sellerBearsFee,
  });

  static double _pct(dynamic v) {
    final n = v is num ? v.toDouble() : double.tryParse('$v');
    return (n != null && n >= 0 && n <= 100) ? n : 0;
  }

  factory SplitRates.fromMap(dynamic raw) {
    final m = raw is Map ? raw : const {};
    return SplitRates(
      commissionPercent: _pct(m['commissionPercent']),
      gatewayFeePercent: _pct(m['gatewayFeePercent']),
      gatewayFeeGstPercent: _pct(m['gatewayFeeGstPercent']),
      sellerBearsFee: m['feeBearer'] != 'platform',
    );
  }

  int gatewayFee(int paise) {
    final base = pctOfPaise(paise, gatewayFeePercent);
    return base + pctOfPaise(base, gatewayFeeGstPercent);
  }
}

/// The same key the server uses: a phone becomes its last 10 digits, anything
/// else (a user id) is kept as written.
String settlementKey(Object? v) {
  final raw = (v ?? '').toString().trim();
  if (raw.isEmpty) return '';
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  final phoneShaped = RegExp(r'^[+\d\s()-]+$').hasMatch(raw);
  return phoneShaped && digits.length >= 10 ? digits.substring(digits.length - 10) : raw;
}

class SettlementPlan {
  final String sellerKey;
  final int goodsPaise;

  /// "platform" (a courier ships, the platform pays it) or "seller".
  final String deliveryTo;
  final int customerDeliveryPaise;
  final int keptDeliveryPaise;
  final int sellerCourierPaise;
  final int transferPaise;
  final SplitRates rates;

  const SettlementPlan({
    required this.sellerKey,
    required this.goodsPaise,
    required this.deliveryTo,
    required this.customerDeliveryPaise,
    required this.keptDeliveryPaise,
    required this.sellerCourierPaise,
    required this.transferPaise,
    required this.rates,
  });

  /// Null when the order has no plan (old app builds, manual orders, anything
  /// paid before plans existed) or a malformed one: those keep the old rules.
  static SettlementPlan? fromMap(dynamic raw) {
    if (raw is! Map || raw['v'] != 1) return null;
    int? asInt(dynamic v) => (v is int && v >= 0) ? v : (v is num && v == v.roundToDouble() && v >= 0 ? v.toInt() : null);
    final goods = asInt(raw['goodsPaise']);
    final transfer = asInt(raw['transferPaise']);
    final to = raw['deliveryTo'];
    if (goods == null || transfer == null || (to != 'platform' && to != 'seller')) return null;
    return SettlementPlan(
      sellerKey: settlementKey(raw['sellerKey']),
      goodsPaise: goods,
      deliveryTo: to as String,
      customerDeliveryPaise: asInt(raw['customerDeliveryPaise']) ?? 0,
      keptDeliveryPaise: asInt(raw['keptDeliveryPaise']) ?? 0,
      sellerCourierPaise: asInt(raw['sellerCourierPaise']) ?? 0,
      transferPaise: transfer,
      rates: SplitRates.fromMap(raw['rates']),
    );
  }
}

class SettlementAdjustment {
  final String id;
  final String sellerKey;
  final String kind;
  final int netPaise;
  final bool paid;

  const SettlementAdjustment({
    required this.id,
    required this.sellerKey,
    required this.kind,
    required this.netPaise,
    required this.paid,
  });

  static List<SettlementAdjustment> listFrom(dynamic raw) {
    if (raw is! List) return const [];
    final out = <SettlementAdjustment>[];
    for (final a in raw) {
      if (a is! Map) continue;
      final net = a['netPaise'];
      final kind = a['kind'];
      if (a['id'] is! String || net is! int || net <= 0) continue;
      if (kind != 'self_delivery' && kind != 'courier_share_refund') continue;
      out.add(SettlementAdjustment(
        id: a['id'] as String,
        sellerKey: settlementKey(a['sellerKey']),
        kind: kind as String,
        netPaise: net,
        paid: (a['paidTransferId'] ?? '').toString().isNotEmpty,
      ));
    }
    return out;
  }
}

class SettlementView {
  final int grossPaise;
  final int commissionPaise;
  final int gatewayFeePaise;

  /// The seller's share of the courier cost (their delivery offer).
  final int deliveryPaise;
  final int transferPaise;
  final int adjustmentsPaise;
  final int netPaise;

  const SettlementView({
    required this.grossPaise,
    required this.commissionPaise,
    required this.gatewayFeePaise,
    required this.deliveryPaise,
    required this.transferPaise,
    required this.adjustmentsPaise,
    required this.netPaise,
  });
}

/// What the order's current seller is owed. Same rules as the server's
/// settlementView: a partial refund comes off the goods first.
SettlementView settlementView(
  SettlementPlan plan,
  List<SettlementAdjustment> adjustments, {
  Object? sellerKey,
  int refundedPaise = 0,
}) {
  final refunded = refundedPaise < 0 ? 0 : refundedPaise;
  final goods = plan.goodsPaise - refunded > 0 ? plan.goodsPaise - refunded : 0;
  int kept = plan.keptDeliveryPaise;
  if (refunded >= plan.goodsPaise) {
    final left = plan.keptDeliveryPaise - (refunded - plan.goodsPaise);
    kept = left > 0 ? left : 0;
  }
  final commission = pctOfPaise(goods, plan.rates.commissionPercent);
  final gateway = plan.rates.sellerBearsFee ? plan.rates.gatewayFee(goods + kept) : 0;
  final delivery = goods > 0 ? plan.sellerCourierPaise : 0;
  final raw = goods + kept - commission - gateway - delivery;
  final transfer = raw > 0 ? raw : 0;
  final who = settlementKey(sellerKey ?? plan.sellerKey);
  final adj = adjustments.where((a) => a.sellerKey == who).fold<int>(0, (s, a) => s + a.netPaise);
  return SettlementView(
    grossPaise: goods + kept,
    commissionPaise: commission,
    gatewayFeePaise: gateway,
    deliveryPaise: delivery,
    transferPaise: transfer,
    adjustmentsPaise: adj,
    netPaise: transfer + adj,
  );
}
