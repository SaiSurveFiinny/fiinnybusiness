// Maps the raw `type` values stored on products (see AGRI_CATEGORIES in constants.ts)
// to the four invoice-level category buckets that appear on printed bills,
// licence-number selection, and future report filtering.
//
// Single source of truth — import this everywhere category detection is needed
// so the on-screen A5 preview and the printed invoice always agree.

const PESTICIDE_TYPES = new Set([
    'Insecticide',
    'Fungicide',
    'Herbicide',
    'Bio Product',
    'PGR',
]);

const FERTILIZER_TYPES = new Set([
    'Fertilizer',
    'Micronutrient',
]);

/**
 * Returns the ordered list of invoice category labels that apply to a set of
 * line items.  Always returns at least ['Others'] when no known type matches.
 *
 * @param items - any objects that carry an optional `type` string field
 *                (CartItem, lineItem saved to Firestore, etc.)
 */
export function getInvoiceProductCategories(
    items: Array<{ type?: string }>,
): string[] {
    const types = new Set(items.map(i => i.type).filter((t): t is string => Boolean(t)));
    const cats: string[] = [];

    if ([...types].some(t => FERTILIZER_TYPES.has(t))) cats.push('Fertilizers');
    if ([...types].some(t => PESTICIDE_TYPES.has(t))) cats.push('Pesticides');
    if (types.has('Seeds')) cats.push('Seeds');

    // "Others" covers any unrecognised type AND is the fallback when the cart
    // is empty or all products have no type set.
    const hasUnknown = [...types].some(
        t => !FERTILIZER_TYPES.has(t) && !PESTICIDE_TYPES.has(t) && t !== 'Seeds',
    );
    if (cats.length === 0 || hasUnknown) cats.push('Others');

    return cats;
}

export interface LicenseEntry {
    label: string;
    number: string;
}

/**
 * Returns only the license numbers that are relevant to the active product
 * categories AND are actually configured in branding.
 *
 * Rules:
 *  - Fertilizers present → include Fertilizer License (if set)
 *  - Pesticides present  → include Pesticide License (if set)
 *  - Seeds present       → include Seeds License (if set)
 *  - Only "Others"       → return [] (no category-specific license applies)
 *
 * Use this in both the on-screen A5 preview and the print template so both
 * surfaces always show identical license information.
 */
export function getApplicableLicenses(
    activeCats: string[],
    branding: { fertilizerLicense?: string; pesticideLicense?: string; seedsLicense?: string } | null | undefined,
): LicenseEntry[] {
    if (!branding) return [];
    // If the only category is "Others", no regulated license applies
    if (activeCats.length > 0 && activeCats.every(c => c === 'Others')) return [];

    const result: LicenseEntry[] = [];
    if (activeCats.includes('Fertilizers') && branding.fertilizerLicense)
        result.push({ label: 'Fert. Lic', number: branding.fertilizerLicense });
    if (activeCats.includes('Pesticides') && branding.pesticideLicense)
        result.push({ label: 'Pest. Lic', number: branding.pesticideLicense });
    if (activeCats.includes('Seeds') && branding.seedsLicense)
        result.push({ label: 'Seeds Lic', number: branding.seedsLicense });
    return result;
}
