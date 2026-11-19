import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/catalog_model.dart';
import 'package:krishidukaan_app/core/services/delivered_price_service.dart';

/// Same rules as the web's app/lib/delivered-price-client.ts.
CatalogModel _p(List<AvailabilityEntry> av, {String? sellMode}) => CatalogModel(
      id: 'p1',
      name: 'Booster',
      nameSearch: const ['booster'],
      category: 'Fertilizers',
      images: const [],
      price: 500,
      sellerCount: av.length,
      unit: '1 kg',
      availability: av,
      sellMode: sellMode,
    );

void main() {
  const a = AvailabilityEntry(storeId: 'a', storePhone: '+919000000001', sellingPrice: 500);
  const b = AvailabilityEntry(storeId: 'b', storePhone: '+919000000002', sellingPrice: 520, discountPct: 10); // 468
  const c = AvailabilityEntry(storeId: 'c', storePhone: '+919000000003', sellingPrice: 480, isOnline: false);
  const d = AvailabilityEntry(storeId: 'd', storePhone: '+919000000004', sellingPrice: 490, stockLevel: 'Out of Stock');
  const e = AvailabilityEntry(storeId: 'e', storePhone: '+919000000005', sellingPrice: 495, freeDelivery: true);
  const f = AvailabilityEntry(storeId: 'f', storePhone: '+919000000006', sellingPrice: 900);

  test('3 cheapest online, in-stock sellers after their discount', () {
    final offers = cardOffers(_p([a, b, c, d, e, f]));
    expect(offers.map((o) => o.sellerKey), ['+919000000002', '+919000000005', '+919000000001']);
    expect(offers.first.price, 468);
    expect(offers.first.size, '1 kg');
    expect(offers[1].productFree, isTrue);
  });

  test('in-store-only product and a store page', () {
    expect(cardOffers(_p([a, b], sellMode: 'offline_store_only')), isEmpty);
    final only = cardOffers(_p([a, b, e]), onlySeller: '9000000005');
    expect(only.single.sellerKey, '+919000000005');
  });

  test('id changes when the price or offer changes', () {
    final p = _p([a]);
    final x = offerFor(p, a, '1 kg', 500)!;
    final y = offerFor(p, a, '1 kg', 499)!;
    final z = offerFor(p, const AvailabilityEntry(storeId: 'a', storePhone: '+919000000001', sellingPrice: 500, sellerDeliveryPct: 50), '1 kg', 500)!;
    expect({x.id, y.id, z.id}.length, 3);
  });

  test('cheapest delivered first, unknown keep their order', () {
    DeliveredResult r(String id, double total, [String? by]) =>
        DeliveredResult(id: id, status: 'ok', total: total, deliveryBy: by);
    final results = {
      's1': null,
      's2': r('s2', 560),
      's3': r('s3', 540, '2026-11-22'),
      's4': null,
      's5': r('s5', 540, '2026-11-20'),
    };
    final ranked = rankDelivered(results.keys.toList(), (k) => results[k]);
    expect(ranked, ['s5', 's3', 's2', 's1', 's4']);
  });
}
