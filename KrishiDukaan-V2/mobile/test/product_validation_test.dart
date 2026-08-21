import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/user_model.dart';
import 'package:krishidukaan_app/core/utils/product_validation.dart';

UserModel _user({
  String name = 'Varad',
  String role = 'retailer',
  String? businessName = 'Varad Agro',
  String? city = 'Pune',
  String? address,
  bool profileCompleted = false,
}) =>
    UserModel(
      uid: 'u1',
      phone: '+919999999999',
      name: name,
      role: role,
      isPaid: true,
      totalSeats: 1,
      productCount: 0,
      businessName: businessName,
      city: city,
      address: address,
      profileCompleted: profileCompleted,
    );

void main() {
  group('description limit (must match web: empty, or 20-300)', () {
    test('empty is allowed — description is optional', () {
      expect(validateDescription(''), isNull);
      expect(validateDescription('   '), isNull);
    });

    test('under 20 characters is rejected', () {
      expect(isDescriptionInvalid('Too short'), isTrue);
      expect(validateDescription('Too short'), kDescriptionRangeMessage);
    });

    test('exactly 20 and exactly 300 are accepted (boundaries)', () {
      expect(validateDescription('a' * 20), isNull);
      expect(validateDescription('a' * 300), isNull);
    });

    test('301+ is rejected — the Varad Agro case', () {
      expect(isDescriptionInvalid('a' * 301), isTrue);
      expect(validateDescription('a' * 500), kDescriptionRangeMessage);
    });

    test('whitespace is trimmed before measuring', () {
      // 300 real chars plus padding still passes.
      expect(validateDescription('   ${'a' * 300}   '), isNull);
      // Padding alone cannot push a short description over the minimum.
      expect(validateDescription('${' ' * 50}short${' ' * 50}'), isNotNull);
    });
  });

  group('missingProfileFields (drives the completion popup)', () {
    test('complete seller profile reports nothing missing', () {
      expect(_user().missingProfileFields, isEmpty);
      expect(_user().isProfileComplete, isTrue);
    });

    test('seller missing a business name is flagged', () {
      final u = _user(businessName: '');
      expect(u.isProfileComplete, isFalse);
      expect(u.missingProfileFields, contains('Shop / Business Name'));
    });

    test('a consumer is not asked for a business name', () {
      final u = _user(role: 'consumer', businessName: '');
      expect(u.missingProfileFields, isNot(contains('Shop / Business Name')));
      expect(u.isProfileComplete, isTrue);
    });

    test('address counts when either city or address is present', () {
      expect(_user(city: '', address: 'Main road').missingProfileFields,
          isNot(contains('Address')));
      expect(_user(city: '', address: '').missingProfileFields,
          contains('Address'));
    });

    test('never disagrees with isProfileComplete', () {
      for (final u in [
        _user(),
        _user(name: ''),
        _user(businessName: ''),
        _user(city: '', address: ''),
        _user(role: 'consumer', businessName: ''),
      ]) {
        expect(u.missingProfileFields.isEmpty, u.isProfileComplete,
            reason: 'popup and banner must agree');
      }
    });

    test('profileCompleted flag short-circuits everything', () {
      final u = _user(name: '', businessName: '', city: '', profileCompleted: true);
      expect(u.isProfileComplete, isTrue);
      expect(u.missingProfileFields, isEmpty);
    });
  });
}
