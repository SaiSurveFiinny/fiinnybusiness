import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/catalog_model.dart';
import 'package:krishidukaan_app/core/models/listing_model.dart';
import 'package:krishidukaan_app/core/utils/weight_utils.dart';
import 'package:krishidukaan_app/features/marketplace/widgets/store_selector_sheet.dart';

CatalogModel _catalog({
  required double price,
  List<VariantModel>? variants,
}) => CatalogModel(
      id: 'p1',
      name: 'Arjuna',
      nameSearch: const ['arjuna'],
      category: 'bio',
      images: const ['x'],
      price: price,
      sellerCount: 1,
      variants: variants,
    );

ListingModel _listing({
  required double price,
  List<VariantModel> variants = const [],
  String id = 's1',
  double? distanceKm,
}) => ListingModel(
      id: id,
      catalogId: 'p1',
      sellerPhone: '+91999999$id',
      sellerName: 'Store $id',
      sellerType: 'retailer',
      price: price,
      stockQuantity: 10,
      variants: variants,
      distanceKm: distanceKm,
    );

void main() {
  group('normalizeUnit', () {
    test('canonicalises spelling and spacing of the same size', () {
      expect(normalizeUnit('5L'), normalizeUnit('5 l'));
      expect(normalizeUnit('5L'), normalizeUnit('5 Ltr'));
      expect(normalizeUnit('5L'), normalizeUnit('5 litres'));
      expect(normalizeUnit('500ml'), normalizeUnit('500 ML'));
      expect(normalizeUnit('1kg'), normalizeUnit('1 Kilogram'));
    });

    test('keeps genuinely different sizes distinct', () {
      expect(normalizeUnit('1L') == normalizeUnit('5L'), isFalse);
      expect(normalizeUnit('500ml') == normalizeUnit('500g'), isFalse);
    });

    test('trims decimals consistently', () {
      expect(normalizeUnit('1.0L'), normalizeUnit('1L'));
    });
  });

  group('storePriceForVariant', () {
    final oneL = const VariantModel(label: '1L', price: 530, stock: null);
    final fiveL = const VariantModel(label: '5L', price: 2500, stock: null);

    test('single-size product falls back to the listing price', () {
      final c = _catalog(price: 530);
      final l = _listing(price: 530);
      expect(storePriceForVariant(l, c, null), 530);
    });

    test('THE BUG: 5L must not be priced at the 1L base price', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      // Store carries both sizes at its own prices.
      final l = _listing(price: 530, variants: [
        const VariantModel(label: '1L', price: 530, stock: null),
        const VariantModel(label: '5L', price: 2500, stock: null),
      ]);
      expect(storePriceForVariant(l, c, fiveL), 2500);
      expect(storePriceForVariant(l, c, oneL), 530);
    });

    test('matches sizes across spelling differences', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      final l = _listing(price: 530, variants: [
        const VariantModel(label: '5 Ltr', price: 2400, stock: null),
      ]);
      expect(storePriceForVariant(l, c, fiveL), 2400);
    });

    test('store that does not carry the size returns null', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      final l = _listing(price: 530, variants: [
        const VariantModel(label: '1L', price: 530, stock: null),
      ]);
      expect(storePriceForVariant(l, c, fiveL), isNull);
    });

    test('size explicitly out of stock returns null', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      final l = _listing(price: 530, variants: [
        const VariantModel(label: '5L', price: 2500, stock: 0),
      ]);
      expect(storePriceForVariant(l, c, fiveL), isNull);
    });

    test('missing stock figure is treated as available, not out of stock', () {
      const v = VariantModel(label: '5L', price: 2500, stock: null);
      expect(v.isOutOfStock, isFalse);
      expect(const VariantModel(label: '5L', price: 1, stock: 0).isOutOfStock,
          isTrue);
    });

    test('legacy store with no per-size prices supplies only the base size', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      final l = _listing(price: 530); // no variants configured
      expect(storePriceForVariant(l, c, oneL), 530, reason: 'base size ok');
      expect(storePriceForVariant(l, c, fiveL), isNull,
          reason: 'non-base size not stocked');
    });
  });

  group('auto-selected store (buildStoreOptions ordering + cheapest rule)', () {
    final oneL = const VariantModel(label: '1L', price: 530, stock: null);
    final fiveL = const VariantModel(label: '5L', price: 2500, stock: null);

    test('cheapest option for the SELECTED size wins, not the base size', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      // Shop A is cheaper at 1L but dearer at 5L; shop B is the reverse.
      final a = _listing(id: 'a', price: 500, distanceKm: 1, variants: const [
        VariantModel(label: '1L', price: 500, stock: null),
        VariantModel(label: '5L', price: 2600, stock: null),
      ]);
      final b = _listing(id: 'b', price: 550, distanceKm: 9, variants: const [
        VariantModel(label: '1L', price: 550, stock: null),
        VariantModel(label: '5L', price: 2400, stock: null),
      ]);

      final for5L = buildStoreOptions(c, [a, b], selectedVariant: fiveL);
      expect(for5L.length, 2);
      final best5 = for5L.reduce((x, y) =>
          y.effectivePrice < x.effectivePrice ? y : x);
      expect(best5.listing.id, 'b', reason: '5L is cheaper at shop b');
      expect(best5.effectivePrice, 2400);

      final for1L = buildStoreOptions(c, [a, b], selectedVariant: oneL);
      final best1 = for1L.reduce((x, y) =>
          y.effectivePrice < x.effectivePrice ? y : x);
      expect(best1.listing.id, 'a', reason: '1L is cheaper at shop a');
      expect(best1.effectivePrice, 500);
    });

    test('a store not carrying the selected size is never offered', () {
      final c = _catalog(price: 530, variants: [oneL, fiveL]);
      final only1L = _listing(id: 'a', price: 100, variants: const [
        VariantModel(label: '1L', price: 100, stock: null),
      ]);
      final has5L = _listing(id: 'b', price: 2400, variants: const [
        VariantModel(label: '5L', price: 2400, stock: null),
      ]);

      final opts = buildStoreOptions(c, [only1L, has5L], selectedVariant: fiveL);
      expect(opts.map((o) => o.listing.id), ['b'],
          reason: 'the ₹100 shop only sells 1L and must not win on price');
    });
  });
}
