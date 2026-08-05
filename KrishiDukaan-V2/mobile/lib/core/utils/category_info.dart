/// Category-specific product information schema — Dart port of
/// `app/dashboard/_lib/category-info.ts` so the mobile "Product Insights"
/// section shows the same per-category spec fields as the web product page.
library;

import '../models/catalog_model.dart';

const List<String> productCategories = [
  'Fertilizers',
  'Pesticides',
  'Herbicides',
  'Bio-Stimulants',
  'Seeds',
  'Sprayers',
  'Tools',
  'Other',
];

bool isStandardCategory(String value) => productCategories.contains(value);

enum CategoryFieldType { text, textarea, chips }

class CategoryField {
  final String key;
  final String label;
  final CategoryFieldType type;
  const CategoryField(this.key, this.label, this.type);
}

const Map<String, List<CategoryField>> categoryFields = {
  'Fertilizers': [
    CategoryField('application', 'Application', CategoryFieldType.textarea),
    CategoryField('dosage', 'Recommended Dosage', CategoryFieldType.text),
    CategoryField('bestForCrops', 'Best For Crops', CategoryFieldType.chips),
  ],
  'Pesticides': [
    CategoryField('activeIngredient', 'Active Ingredient', CategoryFieldType.text),
    CategoryField('chemicalGroup', 'Chemical Group', CategoryFieldType.text),
    CategoryField('targetPest', 'Target Pest', CategoryFieldType.text),
    CategoryField('modeOfAction', 'Mode of Action', CategoryFieldType.textarea),
    CategoryField('dosage', 'Recommended Dosage', CategoryFieldType.text),
    CategoryField('waitingPeriod', 'Waiting Period', CategoryFieldType.text),
    CategoryField('bestForCrops', 'Best For Crops', CategoryFieldType.chips),
  ],
  'Herbicides': [
    CategoryField('activeIngredient', 'Active Ingredient', CategoryFieldType.text),
    CategoryField('targetWeeds', 'Target Weeds', CategoryFieldType.text),
    CategoryField('type', 'Type', CategoryFieldType.text),
    CategoryField('applicationStage', 'Application Stage', CategoryFieldType.text),
    CategoryField('dosage', 'Recommended Dosage', CategoryFieldType.text),
    CategoryField('bestForCrops', 'Best For Crops', CategoryFieldType.chips),
  ],
  'Bio-Stimulants': [
    CategoryField('keyIngredients', 'Key Ingredients', CategoryFieldType.text),
    CategoryField('benefits', 'Benefits', CategoryFieldType.chips),
    CategoryField('applicationMethod', 'Application Method', CategoryFieldType.text),
    CategoryField('dosage', 'Recommended Dosage', CategoryFieldType.text),
    CategoryField('growthStage', 'Growth Stage', CategoryFieldType.text),
    CategoryField('bestForCrops', 'Best For Crops', CategoryFieldType.chips),
  ],
  'Seeds': [
    CategoryField('varietyName', 'Variety Name', CategoryFieldType.text),
    CategoryField('seedType', 'Seed Type', CategoryFieldType.text),
    CategoryField('germinationRate', 'Germination Rate', CategoryFieldType.text),
    CategoryField('maturityPeriod', 'Maturity Period', CategoryFieldType.text),
    CategoryField('seedRate', 'Seed Rate', CategoryFieldType.text),
    CategoryField('suitableSeason', 'Suitable Season', CategoryFieldType.text),
    CategoryField('bestRegions', 'Best Regions', CategoryFieldType.chips),
  ],
  'Sprayers': [
    CategoryField('tankCapacity', 'Tank Capacity', CategoryFieldType.text),
    CategoryField('material', 'Material', CategoryFieldType.text),
    CategoryField('weight', 'Weight', CategoryFieldType.text),
    CategoryField('powerSource', 'Power Source', CategoryFieldType.text),
    CategoryField('sprayRange', 'Spray Range', CategoryFieldType.text),
    CategoryField('nozzleType', 'Nozzle Type', CategoryFieldType.text),
  ],
  'Tools': [
    CategoryField('material', 'Material', CategoryFieldType.text),
    CategoryField('dimensions', 'Dimensions', CategoryFieldType.text),
    CategoryField('weight', 'Weight', CategoryFieldType.text),
    CategoryField('suitableFor', 'Suitable For', CategoryFieldType.text),
    CategoryField('handleType', 'Handle Type', CategoryFieldType.text),
    CategoryField('warranty', 'Warranty', CategoryFieldType.text),
  ],
  'Other': [
    CategoryField('keyFeatures', 'Key Features / Product Info', CategoryFieldType.textarea),
    CategoryField('benefits', 'Benefits', CategoryFieldType.chips),
    CategoryField('applicationMethod', 'Application Method', CategoryFieldType.text),
    CategoryField('dosage', 'Recommended Dosage', CategoryFieldType.text),
    CategoryField('specifications', 'Specifications', CategoryFieldType.textarea),
    CategoryField('application', 'Application', CategoryFieldType.textarea),
    CategoryField('additionalNotes', 'Additional Notes', CategoryFieldType.textarea),
  ],
};

/// Fields stored as a list of strings instead of a plain string.
const Set<String> chipsFields = {'bestForCrops', 'bestRegions', 'benefits'};

/// Synthesizes a categoryInfo-shaped map from the legacy flat fertilizer
/// fields that predate the categoryInfo refactor (nitrogen, phosphorus,
/// potassium, applicationDesc, dosage, bestForCrops). Returns null if none
/// of those fields are present.
Map<String, dynamic>? synthesizeFertilizerInfo(CatalogModel catalog) {
  final n = catalog.nitrogen;
  final p = catalog.phosphorus;
  final k = catalog.potassium;
  final app = catalog.applicationDesc?.trim() ?? '';
  final dos = catalog.dosage?.trim() ?? '';
  final bfc = catalog.bestForCrops ?? const <String>[];

  if (n == null && p == null && k == null && app.isEmpty && dos.isEmpty && bfc.isEmpty) {
    return null;
  }

  return {
    if (n != null) 'nitrogen': n.toString(),
    if (p != null) 'phosphorus': p.toString(),
    if (k != null) 'potassium': k.toString(),
    if (app.isNotEmpty) 'application': app,
    if (dos.isNotEmpty) 'dosage': dos,
    if (bfc.isNotEmpty) 'bestForCrops': bfc,
  };
}

/// Effective categoryInfo for a product: the doc's own `categoryInfo` map if
/// set, else a synthesized map from legacy flat Fertilizer fields, else null.
Map<String, dynamic>? effectiveCategoryInfo(CatalogModel catalog) {
  if (catalog.categoryInfo != null && catalog.categoryInfo!.isNotEmpty) {
    return catalog.categoryInfo;
  }
  final cat = catalog.category.trim();
  if (cat.isEmpty || cat == 'Fertilizers' || cat.toLowerCase().contains('fertilizer')) {
    return synthesizeFertilizerInfo(catalog);
  }
  return null;
}
