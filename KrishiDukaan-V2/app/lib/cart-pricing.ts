/**
 * Server-authoritative cart pricing — GST and delivery, per seller.
 *
 * Pure (no Firebase, no React) so the checkout route, the webhook order
 * recovery and the unit tests all run the SAME code. The rules mirror what the
 * web cart shows and what createOrdersFromCart persists, so the amount charged,
 * the amount displayed and the order record cannot drift:
 *
 *   Original Price → Discount → Discounted Price → GST → Delivery → Final
 *
 *   GST       computed on the DISCOUNTED unit price. Included GST is already in
 *             the price and is never added; only EXCLUDED GST is added.
 *   Delivery  per seller. Free-delivery products add no weight and no charge.
 *             The weight slab is picked by the customer's delivery state (see
 *             utils/delivery). Zero chargeable weight → only the per-product
 *             extra applies, exactly like the cart estimate: an item with no
 *             parseable pack size must not pick up the lowest slab.
 *             A shipment where EVERY item is free ships free; what it would
 *             have cost is kept as `waived` so the invoice can show it struck.
 */

import { computeLinePricing } from "../utils/gst";
import { normalizeUnit } from "../utils/weight";
import { getActiveDiscountAmt, getActiveDiscountPct, type DiscountFields } from "../utils/discount";
import {
  chargeFromSlabs,
  resolveDeliverySlabs,
  type DeliverySettingsLike,
  type DeliveryType,
} from "../utils/delivery";

export type CartPricingLine = {
  /** Same key checkout groups sellers by: phone first, id fallback. */
  sellerKey: string;
  /** Post-discount unit price — GST is computed on this. */
  unitPrice: number;
  qty: number;
  /** qty × per-unit pack weight, in kg. */
  weightKg: number;
  gstApplicable?: boolean;
  gstRate?: number;
  /** Default TRUE — only an explicit false is exclusive. */
  gstIncluded?: boolean;
  extraDeliveryCharge?: number;
  freeDelivery?: boolean;
};

export type DeliveryBreakdown = {
  /** Weight-slab component actually charged (0 if free). */
  slab: number;
  /** Per-product extra actually charged (0 if free). */
  extra: number;
  free: boolean;
  /** What would have been charged, when Free Delivery overrode it. */
  waived: number;
  /** Which slab set applied. "default" = single-slab seller or state unknown. */
  deliveryType: DeliveryType;
};

export type SellerPricing = {
  sellerKey: string;
  /** Sum of post-discount line prices, before any added GST. */
  subtotal: number;
  /** All GST in the order (included + excluded) — for the invoice. */
  gstTotal: number;
  /** GST ADDED to the payable total (excluded lines only). */
  gstAdded: number;
  deliveryCharge: number;
  delivery: DeliveryBreakdown;
  /** subtotal + gstAdded + deliveryCharge. */
  total: number;
};

const r2 = (n: number) => Number(n.toFixed(2));
const r3 = (n: number) => Number(n.toFixed(3));

/** Delivery for ONE seller's lines. `settings` null = no readable settings. */
export function computeSellerDelivery(
  lines: CartPricingLine[],
  settings: DeliverySettingsLike | null,
  customerState: string | null | undefined,
): DeliveryBreakdown {
  const chargeable = lines.filter((l) => !l.freeDelivery);
  const isFree = lines.length > 0 && chargeable.length === 0;

  const extraOf = (ls: CartPricingLine[]) =>
    r2(ls.reduce((s, l) => s + ((l.extraDeliveryCharge ?? 0) > 0 ? l.extraDeliveryCharge! : 0), 0));
  const weightOf = (ls: CartPricingLine[]) => r3(ls.reduce((s, l) => s + l.weightKg, 0));

  let deliveryType: DeliveryType = "default";
  const slabFor = (weightKg: number): number => {
    if (!settings || weightKg <= 0) return 0;
    const resolved = resolveDeliverySlabs(settings, customerState);
    deliveryType = resolved.deliveryType;
    return resolved.slabs.length ? chargeFromSlabs(weightKg, resolved.slabs) : 0;
  };

  if (isFree) {
    // Nothing is charged; keep what it would have been for the invoice.
    const waived = r2(slabFor(weightOf(lines)) + extraOf(lines));
    return { slab: 0, extra: 0, free: true, waived, deliveryType };
  }

  const slab = slabFor(weightOf(chargeable));
  return { slab, extra: extraOf(chargeable), free: false, waived: 0, deliveryType };
}

/** Full per-seller pricing: subtotal, GST and delivery. */
export function computeSellerPricing(
  sellerKey: string,
  lines: CartPricingLine[],
  settings: DeliverySettingsLike | null,
  customerState: string | null | undefined,
): SellerPricing {
  let subtotal = 0;
  let gstTotal = 0;
  let gstAdded = 0;
  for (const l of lines) {
    const p = computeLinePricing({
      unitPrice: l.unitPrice,
      qty: l.qty,
      gstApplicable: l.gstApplicable,
      gstRate: l.gstRate,
      gstIncluded: l.gstIncluded,
    });
    subtotal += p.net;
    gstTotal += p.gstTotal;
    gstAdded += p.gstAdded;
  }
  const delivery = computeSellerDelivery(lines, settings, customerState);
  const deliveryCharge = delivery.free ? 0 : r2(delivery.slab + delivery.extra);
  return {
    sellerKey,
    subtotal: r2(subtotal),
    gstTotal: r2(gstTotal),
    gstAdded: r2(gstAdded),
    deliveryCharge,
    delivery,
    total: r2(subtotal + gstAdded + deliveryCharge),
  };
}

// ─── Source-document readers ────────────────────────────────────────────────
//
// Product, inventory, seller-copy and availability[] documents all carry a
// pack-size ladder and the store's commercial settings, in slightly different
// shapes. These two readers are the only place that knowledge lives.

/**
 * Price of the chosen pack size from a `variants[]` ladder, or null when the
 * item has no size or the ladder has no matching, positive price.
 *
 * Matching goes through normalizeUnit so "1 kg", "1KG" and "1kg" are the same
 * size, as they are everywhere else. Null means "use the base price" — the
 * previous behaviour — so a size the ladder doesn't list is never priced at 0.
 */
export function variantPriceFor(variants: unknown, variantUnit: string | null | undefined): number | null {
  if (!variantUnit || !Array.isArray(variants)) return null;
  const want = normalizeUnit(variantUnit);
  if (!want) return null;
  for (const v of variants as Array<Record<string, unknown> | null>) {
    if (!v || normalizeUnit(String(v.unit ?? "")) !== want) continue;
    const price = Number(v.price);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

export type Commercial = {
  gstApplicable: boolean;
  gstRate: number;
  /** Default TRUE — only an explicit false is exclusive. */
  gstIncluded: boolean;
  extraDeliveryCharge: number;
  freeDelivery: boolean;
};

/** A store's own GST + delivery settings from any product-shaped document. */
export function commercialOf(d: Record<string, unknown> | null | undefined): Commercial {
  const rate = Number(d?.gstRate);
  const extra = Number(d?.extraDeliveryCharge);
  return {
    gstApplicable: d?.gstApplicable === true,
    gstRate: Number.isFinite(rate) && rate > 0 ? Math.min(rate, 100) : 0,
    gstIncluded: d?.gstIncluded !== false,
    extraDeliveryCharge: Number.isFinite(extra) && extra > 0 ? extra : 0,
    freeDelivery: d?.freeDelivery === true,
  };
}

/**
 * Whether a document carries commercial settings at all. A seller copy or
 * inventory row written before these fields existed has none; it must not be
 * read as "explicitly no GST" when a fresher source has the real settings.
 */
export function hasCommercial(d: Record<string, unknown> | null | undefined): boolean {
  if (!d) return false;
  return (
    d.gstApplicable !== undefined ||
    d.gstRate !== undefined ||
    d.gstIncluded !== undefined ||
    d.extraDeliveryCharge !== undefined ||
    d.freeDelivery !== undefined
  );
}

/**
 * The seller's discount on [price], from a priced doc's discount fields —
 * the same helpers the cart and product page use (app/utils/discount.ts), so
 * the charge matches what the customer was shown:
 *  - a percentage applies only when discountType isn't "fixed_amount" (the
 *    app stores a leftover discountPct next to a fixed discount), and
 *  - a fixed amount respects the discount's start/end dates (an expired
 *    ₹300-off was still being taken off a ₹400 item).
 */
export function discountedPrice(d: Record<string, unknown>, price: number): number {
  const fields = d as unknown as DiscountFields;
  const pct = getActiveDiscountPct(fields);
  const pctOff = Math.round((price * pct) / 100 * 100) / 100;
  const fixedOff = getActiveDiscountAmt(fields);
  return Math.round(Math.max(0, price - pctOff - fixedOff) * 100) / 100;
}

/** First value that is a positive number — a stored 0 is "not priced", never "free". */
export function positive(...values: unknown[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * The unit price of the pack size the customer chose, at THIS store.
 *
 * [ladders] are this store's size lists, most specific first (its inventory
 * row, its product copy, its availability[] entry, and the product's own
 * list when the store owns the product). The first one listing the size wins.
 * When none does:
 *  - no size asked, or a single-size product → [storeBase];
 *  - the product's base size → [storeBase] (the store's plain price is the
 *    base size's price);
 *  - any other size → null: this store doesn't price that size, and the line
 *    is refused rather than charged at the base price. Charging the base was
 *    the bug: a 5 L can of a product whose 1 L costs ₹200 was charged ₹200.
 */
export function sizePrice(
  variantUnit: string,
  storeBase: number,
  ladders: unknown[],
  catalog: Record<string, unknown> | null,
): number | null {
  if (!variantUnit) return storeBase > 0 ? storeBase : null;
  for (const ladder of ladders) {
    const p = variantPriceFor(ladder, variantUnit);
    if (p !== null) return p;
  }
  const catalogSizes = Array.isArray(catalog?.variants)
    ? (catalog!.variants as Array<Record<string, unknown> | null>).filter((v) => v && normalizeUnit(String(v.unit ?? '')))
    : [];
  if (catalogSizes.length < 2) return storeBase > 0 ? storeBase : null;
  const catalogPrice = Number(catalog?.price);
  const base = catalogSizes.find((v) => Number(v!.price) === catalogPrice) ?? catalogSizes[0];
  if (normalizeUnit(String(base!.unit ?? '')) === normalizeUnit(variantUnit)) {
    return storeBase > 0 ? storeBase : null;
  }
  return null;
}
