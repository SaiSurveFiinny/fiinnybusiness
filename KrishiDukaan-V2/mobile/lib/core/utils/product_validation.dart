/// Shared product-form rules, kept in one place so the app and the web agree.
///
/// The web enforces these in app/dashboard/_components/add-product-inventory-form.tsx;
/// the app had no equivalent, so a seller could type a description of any
/// length, hit Save, and get an opaque failure with nothing explaining why
/// (reported by the Varad Agro seller). Same numbers, same message.
library;

/// Description must be either left empty, or between these lengths.
/// Mirrors web: `description.trim().length < 20 || > 300` is rejected.
const int kDescriptionMinLength = 20;
const int kDescriptionMaxLength = 300;

/// The message shown on both platforms when a description is out of range.
const String kDescriptionRangeMessage =
    'Description must be between $kDescriptionMinLength and '
    '$kDescriptionMaxLength characters.';

/// True when [description] is not acceptable: non-empty but outside the range.
/// An empty description is valid — it's an optional field.
bool isDescriptionInvalid(String description) {
  final len = description.trim().length;
  return len > 0 && (len < kDescriptionMinLength || len > kDescriptionMaxLength);
}

/// Validation error for [description], or null when it's acceptable.
String? validateDescription(String description) =>
    isDescriptionInvalid(description) ? kDescriptionRangeMessage : null;
