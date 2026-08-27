import 'package:cloud_firestore/cloud_firestore.dart';

/// One structured "Category Info" field, e.g. Pesticides → Active Ingredient.
/// Mirrors `CategoryField` in app/dashboard/_lib/category-info.ts.
class CategoryField {
  /// Firestore key inside the product's `categoryInfo` map.
  final String key;
  final String label;

  /// 'text' | 'textarea' | 'chips'. A `chips` field stores a `List<String>`;
  /// everything else stores a plain `String`.
  final String type;
  final String? placeholder;

  const CategoryField({
    required this.key,
    required this.label,
    required this.type,
    this.placeholder,
  });

  bool get isChips => type == 'chips';
  bool get isTextarea => type == 'textarea';

  factory CategoryField.fromMap(Map<String, dynamic> m) => CategoryField(
        key: (m['key'] ?? '').toString(),
        label: (m['label'] ?? '').toString(),
        type: (m['type'] ?? 'text').toString(),
        placeholder: m['placeholder']?.toString(),
      );
}

/// The product category list plus each category's Category Info fields.
class ProductSchema {
  /// Ordered category names, as shown in the Add/Edit Product dropdown.
  final List<String> categories;

  /// Category name → its structured fields.
  final Map<String, List<CategoryField>> fieldsByCategory;

  /// Field keys stored as `List<String>` rather than `String`.
  final Set<String> chipsFields;

  /// Categories that show the Composition editor.
  final Set<String> compositionCategories;

  const ProductSchema({
    required this.categories,
    required this.fieldsByCategory,
    required this.chipsFields,
    required this.compositionCategories,
  });

  List<CategoryField> fieldsFor(String category) =>
      fieldsByCategory[category] ?? fieldsByCategory['Other'] ?? const [];

  bool showsComposition(String category) =>
      compositionCategories.contains(category);
}

/// Reads `settings/productSchema` — the single source of truth shared with the
/// web dashboard.
///
/// The category list used to be hardcoded separately in Dart and TypeScript
/// and had already drifted: mobile offered Irrigation/Organic (zero products
/// use either) while missing Bio-Stimulants, and NEITHER list contained
/// Adjuvants despite 333 live products using it. Reading one Firestore doc
/// means a new category can be added without shipping an app release.
///
/// [fallback] is a copy of the seeded schema, used when the doc is missing or
/// unreadable (offline, rules change, first run before seeding) so the form
/// degrades to a working dropdown rather than an empty one.
class ProductSchemaRepository {
  final _db = FirebaseFirestore.instance;

  static const _pesticideLike = <CategoryField>[
    CategoryField(key: 'activeIngredient', label: 'Active Ingredient', type: 'text', placeholder: 'e.g. Chlorpyrifos 50% EC'),
    CategoryField(key: 'chemicalGroup', label: 'Chemical Group', type: 'text', placeholder: 'e.g. Organophosphate'),
    CategoryField(key: 'targetPest', label: 'Target Pest', type: 'text', placeholder: 'e.g. Aphids, Thrips, White Flies'),
    CategoryField(key: 'modeOfAction', label: 'Mode of Action', type: 'textarea', placeholder: 'e.g. Contact and systemic action...'),
    CategoryField(key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 2 ml / Litre of water'),
    CategoryField(key: 'waitingPeriod', label: 'Waiting Period', type: 'text', placeholder: 'e.g. 14 days before harvest'),
    CategoryField(key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Cotton, Rice, Vegetables'),
  ];

  static const _generic = <CategoryField>[
    CategoryField(key: 'keyFeatures', label: 'Key Features / Product Info', type: 'textarea', placeholder: 'e.g. Non-ionic surfactant...'),
    CategoryField(key: 'benefits', label: 'Benefits', type: 'chips', placeholder: 'e.g. Improves coverage, Enhances absorption'),
    CategoryField(key: 'applicationMethod', label: 'Application Method', type: 'text', placeholder: 'e.g. Tank mix with spray solution'),
    CategoryField(key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 0.5 ml / Litre'),
    CategoryField(key: 'specifications', label: 'Specifications', type: 'textarea', placeholder: 'List key product specifications...'),
    CategoryField(key: 'application', label: 'Application', type: 'textarea', placeholder: 'Describe how the product is used...'),
    CategoryField(key: 'additionalNotes', label: 'Additional Notes', type: 'textarea', placeholder: 'Any other relevant information...'),
  ];

  /// Mirrors the seeded `settings/productSchema` (scripts/seed-product-schema.js).
  static final ProductSchema fallback = ProductSchema(
    categories: const [
      'Fertilizers', 'Pesticides', 'Insecticides', 'Fungicides', 'Herbicides',
      'Bio-Stimulants', 'Adjuvants', 'Seeds', 'Sprayers', 'Tools', 'Other',
    ],
    fieldsByCategory: {
      'Fertilizers': const [
        CategoryField(key: 'application', label: 'Application', type: 'textarea', placeholder: 'e.g. Suitable for foliar spray...'),
        CategoryField(key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 3–5 gm / Litre'),
        CategoryField(key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Tomatoes, Wheat, Sugarcane'),
      ],
      'Pesticides': _pesticideLike,
      'Insecticides': _pesticideLike,
      'Fungicides': _pesticideLike,
      'Herbicides': const [
        CategoryField(key: 'activeIngredient', label: 'Active Ingredient', type: 'text', placeholder: 'e.g. Glyphosate 41% SL'),
        CategoryField(key: 'targetWeeds', label: 'Target Weeds', type: 'text', placeholder: 'e.g. Broad-leaf weeds, Grasses'),
        CategoryField(key: 'type', label: 'Type', type: 'text', placeholder: 'Selective / Non-Selective'),
        CategoryField(key: 'applicationStage', label: 'Application Stage', type: 'text', placeholder: 'Pre-Emergence / Post-Emergence'),
        CategoryField(key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 1.5 L / acre'),
        CategoryField(key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Wheat, Maize, Soybean'),
      ],
      'Bio-Stimulants': const [
        CategoryField(key: 'keyIngredients', label: 'Key Ingredients', type: 'text', placeholder: 'e.g. Humic acid, Seaweed extract'),
        CategoryField(key: 'benefits', label: 'Benefits', type: 'chips', placeholder: 'e.g. Improves root development'),
        CategoryField(key: 'applicationMethod', label: 'Application Method', type: 'text', placeholder: 'e.g. Soil drench, foliar spray'),
        CategoryField(key: 'dosage', label: 'Recommended Dosage', type: 'text', placeholder: 'e.g. 2–3 ml / Litre'),
        CategoryField(key: 'growthStage', label: 'Growth Stage', type: 'text', placeholder: 'e.g. Vegetative, Flowering'),
        CategoryField(key: 'bestForCrops', label: 'Best For Crops', type: 'chips', placeholder: 'e.g. Tomatoes, Grapes, Paddy'),
      ],
      'Adjuvants': _generic,
      'Seeds': const [
        CategoryField(key: 'varietyName', label: 'Variety Name', type: 'text', placeholder: 'e.g. HYV-123, Pusa Basmati'),
        CategoryField(key: 'seedType', label: 'Seed Type', type: 'text', placeholder: 'Hybrid / Open Pollinated / OPV'),
        CategoryField(key: 'germinationRate', label: 'Germination Rate', type: 'text', placeholder: 'e.g. 90–95%'),
        CategoryField(key: 'maturityPeriod', label: 'Maturity Period', type: 'text', placeholder: 'e.g. 90–110 days'),
        CategoryField(key: 'seedRate', label: 'Seed Rate', type: 'text', placeholder: 'e.g. 8–10 kg / acre'),
        CategoryField(key: 'suitableSeason', label: 'Suitable Season', type: 'text', placeholder: 'Kharif / Rabi / Zaid'),
        CategoryField(key: 'bestRegions', label: 'Best Regions', type: 'chips', placeholder: 'e.g. Maharashtra, Karnataka'),
      ],
      'Sprayers': const [
        CategoryField(key: 'tankCapacity', label: 'Tank Capacity', type: 'text', placeholder: 'e.g. 16 Litres'),
        CategoryField(key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. HDPE, Stainless Steel'),
        CategoryField(key: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g. 2.5 kg (empty)'),
        CategoryField(key: 'powerSource', label: 'Power Source', type: 'text', placeholder: 'Manual / Battery / Petrol'),
        CategoryField(key: 'sprayRange', label: 'Spray Range', type: 'text', placeholder: 'e.g. 5–8 metres'),
        CategoryField(key: 'nozzleType', label: 'Nozzle Type', type: 'text', placeholder: 'e.g. Adjustable fan nozzle'),
      ],
      'Tools': const [
        CategoryField(key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. High-carbon steel'),
        CategoryField(key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: 'e.g. 40 × 15 cm'),
        CategoryField(key: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g. 1.2 kg'),
        CategoryField(key: 'suitableFor', label: 'Suitable For', type: 'text', placeholder: 'e.g. Weeding, Digging'),
        CategoryField(key: 'handleType', label: 'Handle Type', type: 'text', placeholder: 'e.g. Wooden, Fibreglass'),
        CategoryField(key: 'warranty', label: 'Warranty', type: 'text', placeholder: 'e.g. 1 year warranty'),
      ],
      'Other': _generic,
    },
    chipsFields: const {'bestForCrops', 'bestRegions', 'benefits'},
    compositionCategories: const {
      'Fertilizers', 'Pesticides', 'Insecticides', 'Fungicides',
      'Herbicides', 'Bio-Stimulants', 'Adjuvants', 'Seeds', 'Other',
    },
  );

  Future<ProductSchema> fetch() async {
    try {
      final snap = await _db.collection('settings').doc('productSchema').get();
      final data = snap.data();
      if (data == null) return fallback;

      final rawCategories = data['categories'];
      if (rawCategories is! List || rawCategories.isEmpty) return fallback;

      final names = <String>[];
      final byCategory = <String, List<CategoryField>>{};
      for (final entry in rawCategories) {
        if (entry is! Map) continue;
        final name = (entry['name'] ?? '').toString();
        if (name.isEmpty) continue;
        names.add(name);
        final rawFields = entry['fields'];
        byCategory[name] = rawFields is List
            ? rawFields
                .whereType<Map>()
                .map((f) => CategoryField.fromMap(Map<String, dynamic>.from(f)))
                .where((f) => f.key.isNotEmpty)
                .toList()
            : const [];
      }
      if (names.isEmpty) return fallback;

      Set<String> setOf(dynamic raw, Set<String> orElse) =>
          raw is List && raw.isNotEmpty
              ? raw.map((e) => e.toString()).toSet()
              : orElse;

      return ProductSchema(
        categories: names,
        fieldsByCategory: byCategory,
        chipsFields: setOf(data['chipsFields'], fallback.chipsFields),
        compositionCategories:
            setOf(data['compositionCategories'], fallback.compositionCategories),
      );
    } catch (_) {
      // Offline, permission change, or malformed doc — a working dropdown
      // matters more than a live one.
      return fallback;
    }
  }
}
