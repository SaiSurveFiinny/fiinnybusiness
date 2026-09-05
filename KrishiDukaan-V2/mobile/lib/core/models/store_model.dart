class StoreModel {
  final String id;
  final String name;
  final String? ownerName;
  final String? phone;
  // Firebase Auth UID stored on the profile doc. Legacy availability entries
  // key sellers by this UID (storeId == uid), so we match against it too.
  final String? userId;
  final String? address;
  final String? logo;
  final double? lat;
  final double? lng;
  final double? averageRating;
  final int? totalReviews;
  final String? city;
  final String? state;
  final String? pincode;
  // 'retailer' | 'manufacturer' | '' — drives the "Visit Brand Page" action.
  final String role;

  /// The seller's own Google Maps / Google Business listing URL (set in their
  /// profile). When present it beats raw coordinates for the "open in maps"
  /// action — the listing shows photos, reviews and live timings.
  final String? googleMapsUrl;

  /// Short one-line pitch set on the web dashboard profile editor — shown as
  /// a subtitle under the shop name.
  final String? tagline;
  final String? website;
  /// Cover/banner image URL, set on the web dashboard profile editor.
  final String? banner;

  /// ACCOUNT-level online-selling switch, independent of any single product's
  /// `isOnline`. Web requires BOTH this and the per-product flag before it
  /// will offer a store for online ordering (see app/page.tsx's onlineStore
  /// check). Tri-state on purpose:
  ///   true  — seller explicitly enabled online selling
  ///   false — seller explicitly turned it OFF (blocks ordering)
  ///   null  — never set. Deliberately NOT treated as "off": 427 of 442 live
  ///           retailer docs have no such field, so blocking on absence would
  ///           silently stop online orders for nearly every existing seller.
  final bool? onlineDelivery;

  // Distance from the user in km. Set client-side after a Haversine calc;
  // null when either the store or the user has no usable location.
  double? distanceKm;

  StoreModel({
    required this.id,
    required this.name,
    this.ownerName,
    this.phone,
    this.userId,
    this.address,
    this.logo,
    this.lat,
    this.lng,
    this.averageRating,
    this.totalReviews,
    this.city,
    this.state,
    this.pincode,
    this.role = '',
    this.googleMapsUrl,
    this.tagline,
    this.website,
    this.banner,
    this.onlineDelivery,
    this.distanceKm,
  });

  bool get hasLocation => lat != null && lng != null && lat != 0.0 && lng != 0.0;

  bool get hasGoogleListing =>
      googleMapsUrl != null && googleMapsUrl!.trim().startsWith('http');

  bool get isManufacturer => role == 'manufacturer';

  /// True only when the seller has EXPLICITLY switched online selling off.
  /// See [onlineDelivery] for why absence is not treated as off.
  bool get onlineSellingDisabled => onlineDelivery == false;

  /// Full address line built from the parts we have, deduped of empties.
  String get fullAddress => [
        address,
        city,
        state,
        pincode,
      ].where((s) => s != null && s.trim().isNotEmpty).join(', ');
}
