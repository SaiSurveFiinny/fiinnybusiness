/**
 * Self-serve subscription pricing — the single source of truth.
 *
 * WHY THIS EXISTS
 * ---------------
 * The per-listing price used to be hardcoded in four places that nothing kept
 * in sync:
 *
 *   api/payment/create-order/route.ts  PRICE_PER_SEAT   ← what the seller is CHARGED
 *   views/SubscriptionView.tsx         DURATION_OPTIONS ← what the seller SEES
 *   app/sell/page.tsx                  PLANS            ← the public marketing page
 *   plans/ collection (admin UI)       ← admin-assigned subscriptions only
 *
 * Editing the price in the admin Plans tab changed none of the first three, and
 * missing one of them meant either charging more than was displayed (a billing
 * complaint) or less (lost revenue). All three now read `settings/pricing`
 * through this module.
 *
 * NOT the same thing as the `plans` collection. A `plans` doc is an
 * admin-assigned bundle (a price for N seats). This is the public self-serve
 * ladder: a price PER listing for each duration. Different shape, different
 * consumer — kept separate so changing one cannot silently alter the other.
 *
 * FALLBACK IS DELIBERATE. Every reader falls back to DEFAULT_DURATIONS when the
 * document is missing or malformed. A payment must never fail because a
 * settings doc was deleted, and the defaults below are the prices that were
 * hardcoded before this module existed — so a total read failure behaves
 * exactly like the old code did.
 */

/** Firestore path holding the live pricing ladder. */
export const PRICING_DOC_PATH = { collection: "settings", doc: "pricing" } as const;

export interface DurationPrice {
  /** Billing period in months. Also the key the checkout sends up. */
  months: number;
  /** Rupees per listing (per "seat") for the WHOLE period, not per month. */
  pricePerSeat: number;
  /** Optional marketing badge, e.g. "Save 14%". Display only. */
  badge?: string;
}

/**
 * The prices that were hardcoded before this module. Changing these changes the
 * fallback only — the live prices come from Firestore.
 */
export const DEFAULT_DURATIONS: DurationPrice[] = [
  { months: 1, pricePerSeat: 21 },
  { months: 3, pricePerSeat: 54, badge: "Save 14%" },
  { months: 6, pricePerSeat: 90, badge: "Save 29%" },
  { months: 12, pricePerSeat: 144, badge: "Best Value" },
];

/**
 * Validate a raw Firestore value into a usable ladder.
 * Returns null (never a partial ladder) so callers fall back cleanly.
 */
export function parseDurations(raw: unknown): DurationPrice[] | null {
  const list = (raw as { durations?: unknown })?.durations ?? raw;
  if (!Array.isArray(list) || list.length === 0) return null;

  const out: DurationPrice[] = [];
  for (const item of list) {
    const months = Number((item as DurationPrice)?.months);
    const price = Number((item as DurationPrice)?.pricePerSeat);
    // Money must be a whole, non-negative number of rupees: Razorpay is charged
    // in paise via `price * 100`, and a fractional rupee here would round badly.
    if (!Number.isInteger(months) || months <= 0) return null;
    if (!Number.isInteger(price) || price < 0) return null;
    const badge = (item as DurationPrice)?.badge;
    out.push({
      months,
      pricePerSeat: price,
      ...(typeof badge === "string" && badge.trim() ? { badge: badge.trim() } : {}),
    });
  }

  // Duplicate periods would make the charged price depend on array order.
  const seen = new Set<number>();
  for (const d of out) {
    if (seen.has(d.months)) return null;
    seen.add(d.months);
  }

  return out.sort((a, b) => a.months - b.months);
}

/** Look up the price for a period. Returns null when the period isn't offered. */
export function priceFor(
  durations: DurationPrice[],
  months: number,
): number | null {
  return durations.find((d) => d.months === months)?.pricePerSeat ?? null;
}

/** Per-month equivalent, for display only ("₹12/month" on a yearly plan). */
export function perMonthLabel(d: DurationPrice): string {
  return `₹${Math.round(d.pricePerSeat / d.months)}/month`;
}

// ─── Seat quantity rule ─────────────────────────────────────────────────────

/** Seats are sold in blocks of this size, and this is also the minimum buy. */
export const SEAT_STEP = 10;

/** One-tap seat quantities offered next to the input. */
export const SEAT_PRESETS = [10, 100, 500] as const;

/**
 * Snap a requested seat count to the sale rule: at least [SEAT_STEP], and
 * always a whole multiple of it.
 *
 * Rounds UP rather than to nearest, so a seller who needs 15 listing slots
 * gets 20 and never silently ends up with fewer slots than they asked for.
 *
 * The purchase UIs (mobile subscription screen, web SubscriptionView) and
 * /api/payment/create-order all run requests through this, so the seat count
 * the seller sees priced is exactly the one the server charges for — a client
 * that skipped the rule can't be billed on a different number than it showed.
 */
export function normalizeSeatCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= SEAT_STEP) return SEAT_STEP;
  return Math.ceil(n / SEAT_STEP) * SEAT_STEP;
}

// ─── Promo codes ────────────────────────────────────────────────────────────

export interface PromoCode {
  /** Uppercased code as typed by the seller. */
  code: string;
  /** Percentage off the order subtotal, 1–100. */
  discountPercent: number;
  active: boolean;
}

/**
 * Validate a promoCodes/ document.
 *
 * The field is `discountPercent` — matching what SubscriptionView already reads.
 * Anything outside 1–100 is rejected rather than clamped: a 0% or 150% code is a
 * data error, and silently "fixing" it would charge an amount nobody intended.
 */
export function parsePromo(raw: unknown): PromoCode | null {
  const d = raw as Record<string, unknown> | null | undefined;
  if (!d) return null;
  const code = String(d.code ?? "").trim().toUpperCase();
  const discountPercent = Number(d.discountPercent);
  if (!code) return null;
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    return null;
  }
  return { code, discountPercent, active: d.active !== false };
}

/** Apply a percentage discount to a rupee subtotal. */
export function applyDiscount(subtotal: number, discountPercent: number): number {
  const discounted = Math.ceil(subtotal * (1 - discountPercent / 100));
  return Math.max(0, discounted);
}
