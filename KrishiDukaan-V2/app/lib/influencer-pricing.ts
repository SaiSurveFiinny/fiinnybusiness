/**
 * Influencer subscription pricing — the single source of truth, kept
 * DELIBERATELY SEPARATE from the retailer/manufacturer ladder in
 * `app/lib/pricing.ts` (settings/pricing).
 *
 * WHY A SEPARATE DOCUMENT
 * -----------------------
 * Retailer pricing is a per-listing "seat" ladder with bundles, tiers and role
 * restrictions. Influencer pricing is four flat per-period prices with an
 * on/off switch and nothing else — no seats, no listings, no tiers. Forcing the
 * retailer shape onto influencers would risk an influencer being priced or
 * entitled off a retailer row. So influencer plans live in their own document,
 * `settings/influencerPricing`, parsed by this module alone.
 *
 * Same conventions as pricing.ts otherwise:
 *   • World-readable (settings/* is public), Admin-SDK-only writes via
 *     /api/admin/influencer-pricing.
 *   • The client NEVER sends a price — /api/payment/influencer/create-order
 *     prices the charge from this document.
 *   • Every reader falls back to DEFAULT_INFLUENCER_PLANS when the document is
 *     missing or malformed, so a deleted/corrupt doc can never take checkout
 *     down (mirrors parseDurations()).
 */

/** Firestore path holding the live influencer pricing. */
export const INFLUENCER_PRICING_DOC_PATH = {
  collection: "settings",
  doc: "influencerPricing",
} as const;

/** The four billing periods, in months. This is the whole, fixed set. */
export const INFLUENCER_PERIODS = [1, 3, 6, 12] as const;
export type InfluencerPeriod = (typeof INFLUENCER_PERIODS)[number];

export interface InfluencerPlan {
  /** Billing period in months. One of INFLUENCER_PERIODS. */
  months: number;
  /** Flat rupee price for the WHOLE period. Whole number (Razorpay bills price*100 paise). */
  price: number;
  /** Whether sellers can currently buy this plan. A disabled plan is hidden and refused server-side. */
  enabled: boolean;
  /** Optional marketing badge, display only (e.g. "Save 20%"). */
  badge?: string;
}

/** Human label for a billing period. */
export function periodLabel(months: number): string {
  switch (months) {
    case 1:
      return "Monthly";
    case 3:
      return "3 Months";
    case 6:
      return "6 Months";
    case 12:
      return "Yearly";
    default:
      return `${months} Months`;
  }
}

/**
 * Built-in fallback prices. Changing these changes the fallback only — live
 * prices come from Firestore. Intentionally distinct values from the retailer
 * ladder so a mix-up is obvious.
 */
export const DEFAULT_INFLUENCER_PLANS: InfluencerPlan[] = [
  { months: 1, price: 49, enabled: true },
  { months: 3, price: 126, enabled: true, badge: "Save 14%" },
  { months: 6, price: 209, enabled: true, badge: "Save 29%" },
  { months: 12, price: 335, enabled: true, badge: "Best Value · Save 43%" },
];

/**
 * Validate a raw Firestore value into a usable set of plans.
 * Returns null (never a partial list) so callers fall back cleanly.
 *
 * Accepts the `{ plans: [...] }` wrapper or a bare array. Each row must have a
 * period in INFLUENCER_PERIODS, a whole-number non-negative rupee price, and a
 * boolean `enabled`. Duplicate periods are rejected (the charged price would
 * otherwise depend on array order). A subset of the four periods is allowed.
 */
export function parseInfluencerPlans(raw: unknown): InfluencerPlan[] | null {
  const list = (raw as { plans?: unknown })?.plans ?? raw;
  if (!Array.isArray(list) || list.length === 0) return null;

  const out: InfluencerPlan[] = [];
  const seen = new Set<number>();
  for (const item of list) {
    const months = Number((item as InfluencerPlan)?.months);
    const price = Number((item as InfluencerPlan)?.price);
    if (!(INFLUENCER_PERIODS as readonly number[]).includes(months)) return null;
    if (!Number.isInteger(price) || price < 0) return null;
    if (seen.has(months)) return null;
    seen.add(months);

    const rawEnabled = (item as InfluencerPlan)?.enabled;
    if (typeof rawEnabled !== "boolean") return null;

    const badge = (item as InfluencerPlan)?.badge;
    out.push({
      months,
      price,
      enabled: rawEnabled,
      ...(typeof badge === "string" && badge.trim() ? { badge: badge.trim() } : {}),
    });
  }

  return out.sort((a, b) => a.months - b.months);
}

/** The plan for a period, or null when that period isn't offered. */
export function influencerPlanFor(
  plans: InfluencerPlan[],
  months: number,
): InfluencerPlan | null {
  const m = Number(months);
  return plans.find((p) => p.months === m) ?? null;
}

/** Only the plans a seller can currently buy, in period order. */
export function enabledInfluencerPlans(plans: InfluencerPlan[]): InfluencerPlan[] {
  return plans.filter((p) => p.enabled).sort((a, b) => a.months - b.months);
}

/** Per-month equivalent in whole rupees, for display only ("₹333/month"). */
export function influencerPerMonth(plan: InfluencerPlan): number {
  return Math.round(plan.price / plan.months);
}
