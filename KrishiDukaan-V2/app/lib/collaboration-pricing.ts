/**
 * Collaboration pricing — the KrishiDukan-configured, BUSINESS-FACING charge a
 * manufacturer/retailer sees for booking an influencer collaboration.
 *
 * This is DELIBERATELY SEPARATE from both the retailer ladder (settings/pricing)
 * and the influencer subscription plans (settings/influencerPricing). Those
 * price what a seller or an influencer pays to use the platform; THIS prices a
 * collaboration between them, and KrishiDukan — not the influencer — owns it.
 *
 * WHY A SEPARATE DOCUMENT (settings/collaborationPricing)
 * ------------------------------------------------------
 *   • It is NOT the influencer's self-reported `collaboration.charge`. That
 *     figure is a private quotation and must never be shown to a business (see
 *     the sanitising list API). Prices here are set by admins only.
 *   • It is a small matrix — follower TIER × collaboration TYPE — not a per-
 *     period seat ladder, so forcing either existing shape onto it would be a
 *     poor fit and risk a mix-up.
 *
 * Conventions shared with pricing.ts / influencer-pricing.ts:
 *   • World-readable settings/* path, Admin-SDK-only writes via
 *     /api/admin/collaboration-pricing.
 *   • Every reader falls back to DEFAULT_COLLABORATION_PRICING when the document
 *     is missing or malformed, so a deleted/corrupt doc can never blank the
 *     collaboration pages.
 *   • The model is intentionally open-ended — tiers and types are arrays with
 *     stable ids — so admins can add new follower tiers or collaboration types
 *     later without a code change.
 */

/** Firestore path holding the live collaboration pricing. */
export const COLLABORATION_PRICING_DOC_PATH = {
  collection: "settings",
  doc: "collaborationPricing",
} as const;

/** A kind of collaboration a business can book (e.g. a tag, a feature video). */
export interface CollaborationType {
  /** Stable key referenced by the price matrix. Lower-case snake_case. */
  id: string;
  /** Display label, e.g. "Collaboration Tag". */
  label: string;
  /** Optional one-line clarification, e.g. "Influencer featured in the video". */
  description?: string;
}

/**
 * A follower-count band. `minFollowers` is inclusive; `maxFollowers` is
 * inclusive, or null for "no upper bound". Bands are mutually exclusive — see
 * parseCollaborationPricing, which rejects overlaps.
 */
export interface CollaborationTier {
  /** Stable key referenced by the price matrix. */
  id: string;
  /** Display label, e.g. "1 – 10,000 followers". */
  label: string;
  minFollowers: number;
  maxFollowers: number | null;
}

/**
 * The whole configuration. `prices[tierId][typeId]` is the rupee price, or null
 * when that type is not offered in that tier (so the matrix can be sparse —
 * e.g. "Collaboration Tag" only in the lowest tier). A tier with NO non-null
 * price is treated as "custom quote / admin configuration required".
 */
export interface CollaborationPricing {
  tiers: CollaborationTier[];
  types: CollaborationType[];
  prices: Record<string, Record<string, number | null>>;
}

export const DEFAULT_CURRENCY = "INR";

/**
 * Built-in fallback — the four prices from the product spec. Changing these
 * changes the fallback only; live prices come from Firestore.
 *
 *   1–10,000       Collaboration Tag                 ₹500
 *   1–10,000       Video Collaboration (featured)    ₹2,500
 *   10,001–100,000 Normal Collaboration              ₹2,000
 *   10,001–100,000 Video Collaboration (featured)    ₹10,000
 *
 * Above 100,000 there is intentionally NO tier — resolveCollaborationOffers()
 * returns requiresCustomQuote so the UI shows "pricing on request" rather than
 * an invented number.
 */
export const DEFAULT_COLLABORATION_PRICING: CollaborationPricing = {
  tiers: [
    { id: "tier_1", label: "1 – 10,000 followers", minFollowers: 1, maxFollowers: 10000 },
    { id: "tier_2", label: "10,001 – 100,000 followers", minFollowers: 10001, maxFollowers: 100000 },
  ],
  types: [
    { id: "collab_tag", label: "Collaboration Tag" },
    { id: "normal_collab", label: "Normal Collaboration" },
    {
      id: "video_collab",
      label: "Video Collaboration",
      description: "Influencer featured in the video",
    },
  ],
  prices: {
    tier_1: { collab_tag: 500, video_collab: 2500 },
    tier_2: { normal_collab: 2000, video_collab: 10000 },
  },
};

const isSnakeId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z0-9_]+$/.test(v) && v.length > 0 && v.length <= 60;

const isWholeNonNeg = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Validate a raw Firestore value into a usable configuration. Returns null
 * (never a partial object) so callers fall back cleanly to the defaults.
 *
 * Rules enforced:
 *   • At least one tier and one type, each with a unique snake_case id.
 *   • Tier bands are well-formed (min ≥ 0, max null or ≥ min) and, once sorted
 *     by min, strictly non-overlapping — pricing must be unambiguous for any
 *     follower count.
 *   • Every price is null or a whole, NON-NEGATIVE rupee amount. A negative or
 *     fractional price makes the whole document invalid (fail safe to defaults).
 *   • Price keys must reference a known tier and type.
 */
export function parseCollaborationPricing(raw: unknown): CollaborationPricing | null {
  const obj = raw as Partial<CollaborationPricing> | null | undefined;
  if (!obj || typeof obj !== "object") return null;

  const rawTiers = obj.tiers;
  const rawTypes = obj.types;
  const rawPrices = obj.prices;
  if (!Array.isArray(rawTiers) || rawTiers.length === 0) return null;
  if (!Array.isArray(rawTypes) || rawTypes.length === 0) return null;
  if (!rawPrices || typeof rawPrices !== "object") return null;

  // ── Types ──
  const types: CollaborationType[] = [];
  const typeIds = new Set<string>();
  for (const t of rawTypes) {
    const id = (t as CollaborationType)?.id;
    const label = (t as CollaborationType)?.label;
    if (!isSnakeId(id) || typeof label !== "string" || !label.trim()) return null;
    if (typeIds.has(id)) return null;
    typeIds.add(id);
    const desc = (t as CollaborationType)?.description;
    types.push({
      id,
      label: label.trim(),
      ...(typeof desc === "string" && desc.trim() ? { description: desc.trim() } : {}),
    });
  }

  // ── Tiers ──
  const tiers: CollaborationTier[] = [];
  const tierIds = new Set<string>();
  for (const t of rawTiers) {
    const id = (t as CollaborationTier)?.id;
    const label = (t as CollaborationTier)?.label;
    const min = (t as CollaborationTier)?.minFollowers;
    const max = (t as CollaborationTier)?.maxFollowers;
    if (!isSnakeId(id) || typeof label !== "string" || !label.trim()) return null;
    if (tierIds.has(id)) return null;
    if (!isWholeNonNeg(min)) return null;
    if (max !== null && !isWholeNonNeg(max)) return null;
    if (max !== null && max < min) return null;
    tierIds.add(id);
    tiers.push({ id, label: label.trim(), minFollowers: min, maxFollowers: max });
  }

  // Reject overlapping bands (sort by min; each must start after the previous
  // band's max, and only the LAST band may be open-ended).
  const sorted = [...tiers].sort((a, b) => a.minFollowers - b.minFollowers);
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (prev && prev.maxFollowers === null) return null; // open band must be last
    if (prev && prev.maxFollowers !== null && sorted[i].minFollowers <= prev.maxFollowers) {
      return null; // overlap
    }
  }

  // ── Prices ──
  const prices: Record<string, Record<string, number | null>> = {};
  for (const [tierId, row] of Object.entries(rawPrices)) {
    if (!tierIds.has(tierId)) return null;
    if (!row || typeof row !== "object") return null;
    const out: Record<string, number | null> = {};
    for (const [typeId, price] of Object.entries(row as Record<string, unknown>)) {
      if (!typeIds.has(typeId)) return null;
      if (price === null) {
        out[typeId] = null;
        continue;
      }
      if (!isWholeNonNeg(price)) return null;
      out[typeId] = price;
    }
    prices[tierId] = out;
  }

  return { tiers: sorted, types, prices };
}

/** A single bookable offer, resolved for a specific influencer. */
export interface CollaborationOffer {
  typeId: string;
  label: string;
  description?: string;
  /** Rupee price configured by KrishiDukan. */
  price: number;
  currency: string;
}

export interface ResolvedCollaboration {
  /** The matched tier, or null when no tier covers this follower count. */
  tier: CollaborationTier | null;
  /** Bookable offers (type + price) for the matched tier. Empty when none. */
  offers: CollaborationOffer[];
  /**
   * True when no tier covers this follower count (e.g. > 100,000) OR the matched
   * tier has no prices configured — the UI must show "custom quotation / admin
   * configuration required" instead of a price.
   */
  requiresCustomQuote: boolean;
}

/** The tier whose band contains `followers`, or null if none does. */
export function tierForFollowers(
  pricing: CollaborationPricing,
  followers: number,
): CollaborationTier | null {
  const n = Number(followers) || 0;
  return (
    pricing.tiers.find(
      (t) => n >= t.minFollowers && (t.maxFollowers === null || n <= t.maxFollowers),
    ) ?? null
  );
}

/**
 * Resolve the collaboration offers for an influencer with `followers` followers.
 * Pure + deterministic — used both by the list API (server) and, if needed, the
 * admin preview. Never invents a price: an uncovered count returns
 * requiresCustomQuote with no offers.
 */
export function resolveCollaborationOffers(
  pricing: CollaborationPricing,
  followers: number,
  currency: string = DEFAULT_CURRENCY,
): ResolvedCollaboration {
  const tier = tierForFollowers(pricing, followers);
  if (!tier) return { tier: null, offers: [], requiresCustomQuote: true };

  const row = pricing.prices[tier.id] ?? {};
  const offers: CollaborationOffer[] = [];
  for (const type of pricing.types) {
    const price = row[type.id];
    if (typeof price !== "number") continue; // null / not offered in this tier
    offers.push({
      typeId: type.id,
      label: type.label,
      ...(type.description ? { description: type.description } : {}),
      price,
      currency,
    });
  }
  return { tier, offers, requiresCustomQuote: offers.length === 0 };
}

/**
 * The headline follower figure used to pick a tier and to filter/sort. We use
 * the LARGEST single-platform following rather than a cross-platform sum: it is
 * the most defensible "reach" number and avoids double-counting an audience that
 * follows the same creator on two platforms.
 */
export function headlineFollowers(
  socials: Record<string, { followers?: number } | null | undefined> | null | undefined,
): number {
  if (!socials) return 0;
  let max = 0;
  for (const s of Object.values(socials)) {
    const n = Number(s?.followers) || 0;
    if (n > max) max = n;
  }
  return max;
}
