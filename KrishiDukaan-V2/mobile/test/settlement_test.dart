import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/settlement.dart';

/// Pins the same numbers as scripts/tests/settlement.test.ts, so the app's
/// earnings and the server's payouts can never disagree.
void main() {
  const rates = {
    'commissionPercent': 2,
    'gatewayFeePercent': 2,
    'gatewayFeeGstPercent': 18,
    'feeBearer': 'seller',
  };

  Map<String, dynamic> plan({
    required int goods,
    required String to,
    int customerDelivery = 0,
    int kept = 0,
    int sellerCourier = 0,
    required int transfer,
  }) =>
      {
        'v': 1,
        'sellerKey': '8658031942',
        'goodsPaise': goods,
        'deliveryTo': to,
        'customerDeliveryPaise': customerDelivery,
        'keptDeliveryPaise': kept,
        'sellerCourierPaise': sellerCourier,
        'transferPaise': transfer,
        'rates': rates,
      };

  test('pctOfPaise rounds up like the server', () {
    expect(pctOfPaise(100000, 2), 2000);
    expect(pctOfPaise(2000, 18), 360);
    expect(pctOfPaise(164, 18), 30); // 29.52 → 30
    expect(pctOfPaise(0, 2), 0);
  });

  test('keys: phones match in any form, user ids are kept', () {
    expect(settlementKey('+91 86580 31942'), '8658031942');
    expect(settlementKey('dRv07eFd0wao2LhfnG9TPsVpkXC3'), 'dRv07eFd0wao2LhfnG9TPsVpkXC3');
  });

  test('scenario 2: free-delivery offer is a deduction, adjustment adds back', () {
    final p = SettlementPlan.fromMap(plan(goods: 100000, to: 'platform', sellerCourier: 8000, transfer: 87640))!;
    final adj = SettlementAdjustment.listFrom([
      {'id': 'courier_share_refund:8658031942', 'sellerKey': '8658031942', 'kind': 'courier_share_refund', 'netPaise': 1000},
    ]);
    final v = settlementView(p, adj, sellerKey: '+918658031942');
    expect(v.grossPaise, 100000);
    expect(v.commissionPaise, 2000);
    expect(v.gatewayFeePaise, 2360);
    expect(v.deliveryPaise, 8000);
    expect(v.transferPaise, 87640);
    expect(v.adjustmentsPaise, 1000);
    expect(v.netPaise, 88640);
    // Another seller's adjustment is never theirs.
    expect(settlementView(p, adj, sellerKey: '9011842378').adjustmentsPaise, 0);
  });

  test('scenario 1: delivery the platform ships is not the seller\'s', () {
    final p = SettlementPlan.fromMap(plan(goods: 100000, to: 'platform', customerDelivery: 8200, transfer: 95640))!;
    expect(settlementView(p, const []).netPaise, 95640);
    // Partial refund of ₹100 comes off the goods.
    final r = settlementView(p, const [], refundedPaise: 10000);
    expect(r.commissionPaise, 1800);
    expect(r.gatewayFeePaise, 2124);
    expect(r.transferPaise, 86076);
  });

  test('seller delivers: their slab is theirs, fee on it too', () {
    final p = SettlementPlan.fromMap(plan(goods: 100000, to: 'seller', customerDelivery: 5000, kept: 5000, transfer: 100522))!;
    final v = settlementView(p, const []);
    expect(v.gatewayFeePaise, 2478);
    expect(v.transferPaise, 100522);
  });

  test('untrusted documents', () {
    expect(SettlementPlan.fromMap(null), isNull);
    expect(SettlementPlan.fromMap({...plan(goods: 1, to: 'platform', transfer: 0), 'v': 2}), isNull);
    expect(SettlementPlan.fromMap({...plan(goods: 1, to: 'customer', transfer: 0)}), isNull);
    expect(SettlementAdjustment.listFrom([
      {'id': 'x', 'kind': 'self_delivery', 'netPaise': -5},
      null,
      'y',
    ]), isEmpty);
  });
}
