import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/delivery_address.dart';

/// Same cases as scripts/tests/delivery-address.test.ts on the web.
void main() {
  const full = {
    'house': 'Flat 4, Sai Heights', 'area': 'Kothrud', 'landmark': 'Dahanukar Colony',
    'city': 'Pune', 'district': 'Pune', 'state': 'Maharashtra', 'pincode': '411038',
  };

  test('new field wins', () {
    final a = DeliveryAddress.fromUserDoc({'deliveryAddress': full, 'addressArea': 'old', 'address': 'older'});
    expect(a.toMap(), full);
  });

  test('old web checkout fields', () {
    final a = DeliveryAddress.fromUserDoc({
      'addressHouse': '12', 'addressArea': 'Nandgaon', 'addressCity': 'Nashik',
      'addressDistrict': 'Nashik', 'addressState': 'Maharashtra', 'addressPincode': '423106',
    });
    expect(a.area, 'Nandgaon');
    expect(a.pincode, '423106');
  });

  test('one-line address only for buyers, never a seller\'s shop', () {
    final buyer = DeliveryAddress.fromUserDoc({'role': 'consumer', 'address': 'MG Road', 'city': 'Nashik', 'state': 'Maharashtra', 'pincode': '422001'});
    expect(buyer.area, 'MG Road');
    expect(buyer.pincode, '422001');
    final seller = DeliveryAddress.fromUserDoc({'role': 'retailer', 'address': 'Shop 5', 'city': 'Pune', 'pincode': '411037'});
    expect(seller.isEmpty, isTrue);
  });

  test('bad pincode dropped; deliverable check', () {
    expect(DeliveryAddress.fromUserDoc({'deliveryAddress': {...full, 'pincode': '01234'}}).pincode, '');
    expect(DeliveryAddress.fromUserDoc({'deliveryAddress': full}).isDeliverable, isTrue);
  });

  test('writes: buyers mirror one-line fields, sellers never', () {
    final a = DeliveryAddress.fromUserDoc({'deliveryAddress': full});
    final buyer = a.writeFields('consumer');
    expect(buyer['address'], 'Flat 4, Sai Heights, Kothrud');
    expect(buyer['pincode'], '411038');
    expect((buyer['deliveryAddress'] as Map)['landmark'], 'Dahanukar Colony');
    final seller = a.writeFields('retailer');
    expect(seller.containsKey('address'), isFalse);
    expect(seller.containsKey('pincode'), isFalse);
    expect(seller['addressCity'], 'Pune');
  });
}
