/// The customer's delivery address: one shape, everywhere.
///
/// A DELIBERATE MIRROR of app/lib/delivery-address.ts on the web
/// (docs/delivered-price-architecture.md §3). users/{phone}.deliveryAddress
/// = {house, area, landmark, city, district, state, pincode}, the same shape
/// as orders.deliveryAddress. Profile and checkout, web and app, read and
/// write it. Older fields are still read as fallbacks and still written, and a
/// SELLER's one-line address/city/state/pincode (their shop) is never touched.
/// test/delivery_address_test.dart pins the same cases as the web test.
library;

final _pin = RegExp(r'^[1-9]\d{5}$');

bool isSellerRole(Object? role) => role == 'retailer' || role == 'manufacturer';

class DeliveryAddress {
  final String house;
  final String area;
  final String landmark;
  final String city;
  final String district;
  final String state;
  final String pincode;

  const DeliveryAddress({
    this.house = '',
    this.area = '',
    this.landmark = '',
    this.city = '',
    this.district = '',
    this.state = '',
    this.pincode = '',
  });

  static const empty = DeliveryAddress();

  static String _s(Object? v, [int max = 160]) {
    final t = (v ?? '').toString().trim();
    return t.length > max ? t.substring(0, max) : t;
  }

  /// Trimmed, length-capped, and an invalid pincode dropped.
  factory DeliveryAddress.clean({
    Object? house,
    Object? area,
    Object? landmark,
    Object? city,
    Object? district,
    Object? state,
    Object? pincode,
  }) {
    final pin = _s(pincode, 6);
    return DeliveryAddress(
      house: _s(house, 120),
      area: _s(area),
      landmark: _s(landmark, 80),
      city: _s(city, 80),
      district: _s(district, 80),
      state: _s(state, 60),
      pincode: _pin.hasMatch(pin) ? pin : '',
    );
  }

  bool get isEmpty =>
      house.isEmpty && area.isEmpty && landmark.isEmpty && city.isEmpty && district.isEmpty && state.isEmpty && pincode.isEmpty;

  /// Pincode, area, town and state: enough to price and deliver.
  bool get isDeliverable => _pin.hasMatch(pincode) && area.isNotEmpty && city.isNotEmpty && state.isNotEmpty;

  /// The saved address from a users/{phone} document: the new field, else the
  /// old web checkout fields, else (buyers only) the one-line profile address.
  factory DeliveryAddress.fromUserDoc(Map<String, dynamic>? d) {
    if (d == null) return empty;
    final raw = d['deliveryAddress'];
    if (raw is Map) {
      final a = DeliveryAddress.clean(
        house: raw['house'], area: raw['area'], landmark: raw['landmark'], city: raw['city'],
        district: raw['district'], state: raw['state'], pincode: raw['pincode'],
      );
      if (!a.isEmpty) return a;
    }
    final web = DeliveryAddress.clean(
      house: d['addressHouse'], area: d['addressArea'], landmark: d['addressLandmark'], city: d['addressCity'],
      district: d['addressDistrict'], state: d['addressState'], pincode: d['addressPincode'],
    );
    if (!web.isEmpty) return web;
    if (!isSellerRole(d['role'])) {
      return DeliveryAddress.clean(area: d['address'], city: d['city'], state: d['state'], pincode: d['pincode']);
    }
    return empty;
  }

  Map<String, String> toMap() => {
        'house': house,
        'area': area,
        'landmark': landmark,
        'city': city,
        'district': district,
        'state': state,
        'pincode': pincode,
      };

  /// What to merge into users/{phone} when saved. Buyers also get the
  /// one-line fields older app builds read; sellers never (their shop).
  Map<String, Object> writeFields(Object? role) {
    final a = DeliveryAddress.clean(
      house: house, area: area, landmark: landmark, city: city, district: district, state: state, pincode: pincode,
    );
    return {
      'deliveryAddress': a.toMap(),
      'addressHouse': a.house,
      'addressArea': a.area,
      'addressLandmark': a.landmark,
      'addressCity': a.city,
      'addressDistrict': a.district,
      'addressState': a.state,
      'addressPincode': a.pincode,
      if (!isSellerRole(role)) ...{
        'address': [a.house, a.area].where((s) => s.isNotEmpty).join(', '),
        'city': a.city,
        'state': a.state,
        'pincode': a.pincode,
      },
    };
  }
}
