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
}) => ListingModel(
      id: 's1',
      catalogId: 'p1',
      sellerPhone: '+919999999999',
      sellerName: 'Store',
      sellerType: 'retailer',
      price: price,
      stockQuantity: 10,
      variants: variants,
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
}
