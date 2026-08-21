/// Utility for parsing variant labels into estimated weights.
///
/// Mirrors the web app's `parseVariantWeightKg()` from `app/utils/weight.ts`
/// so that delivery‐charge calculations stay consistent across platforms.

/// Parse a variant unit string into an estimated weight in kilograms.
/// Returns 0 for unknown or unitless variants (bottle, pcs, pkt, can).
///
/// Examples: "1kg"→1, "500g"→0.5, "250ml"→0.25, "2L"→2, "1.5kg"→1.5, "800ml"→0.8
double parseVariantWeightKg(String? variantUnit) {
  if (variantUnit == null || variantUnit.trim().isEmpty) return 0;
  final s = variantUnit.trim();

  // kg
  final kgMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*kg$', caseSensitive: false).firstMatch(s);
  if (kgMatch != null) return double.parse(kgMatch.group(1)!);

  // g / gm
  final gMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*g(?:m)?$', caseSensitive: false).firstMatch(s);
  if (gMatch != null) return double.parse(gMatch.group(1)!) / 1000;

  // L / litre
  final lMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*l(?:itre)?$', caseSensitive: false).firstMatch(s);
  if (lMatch != null) return double.parse(lMatch.group(1)!);

  // ml
  final mlMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*ml$', caseSensitive: false).firstMatch(s);
  if (mlMatch != null) return double.parse(mlMatch.group(1)!) / 1000;

  return 0;
}

/// Canonicalises a package-size label so spelling/spacing differences compare
/// equal: "2L", "2 l", "2ltr", "2 Liter" all normalise to "2l".
///
/// Direct port of web's `normalizeUnit()` in `app/utils/weight.ts`. Size
/// matching MUST use this on both sides — a retailer typing "5 Ltr" where the
/// catalogue says "5L" is the same size, and a raw string compare would treat
/// the store as not stocking it and silently drop it from the buy options.
String normalizeUnit(String? unit) {
  if (unit == null) return '';
  final s = unit.trim().toLowerCase();
  if (s.isEmpty) return '';

  final measured = RegExp(
    r'^(\d+(?:\.\d+)?)\s*(kilograms?|kilogram|kgs?|kg|grams?|gms?|gm|g|millilitres?|milliliters?|mls?|ml|litres?|liters?|ltrs?|ltr|ls?|l)$',
  ).firstMatch(s);

  if (measured != null) {
    var num = measured.group(1)!;
    if (num.contains('.')) {
      num = num.replaceAll(RegExp(r'\.0+$'), '').replaceAllMapped(
            RegExp(r'(\.\d*?)0+$'),
            (m) => m.group(1)!,
          );
    }
    final raw = measured.group(2)!;
    final String canon;
    if (RegExp(r'^(kilograms?|kilogram|kgs?|kg)$').hasMatch(raw)) {
      canon = 'kg';
    } else if (RegExp(r'^(millilitres?|milliliters?|mls?|ml)$').hasMatch(raw)) {
      canon = 'ml';
    } else if (RegExp(r'^(grams?|gms?|gm|g)$').hasMatch(raw)) {
      canon = 'g';
    } else {
      canon = 'l'; // litres
    }
    return '$num$canon';
  }

  // Non-measured unit (bottle, pcs, pkt…): strip internal whitespace so
  // spacing differences still match.
  return s.replaceAll(RegExp(r'\s+'), '');
}
