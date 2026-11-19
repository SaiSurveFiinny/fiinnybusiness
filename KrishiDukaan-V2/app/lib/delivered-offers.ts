/**
 * "Delivered price": what one pack of a product from one seller costs the
 * customer at their pincode — item + delivery — and when it arrives
 * (docs/delivered-price-architecture.md §4.3).
 *
 * Pure: no Firebase. The route (app/api/delivery/offers) loads settings and
 * courier quotes and hands them here, and this prices the offer with
 * checkout's own computeSellerPricing on a one-pack line. So for one pack the
 * listing shows exactly what checkout will charge: product / store /
 * manufacturer offers, the store's "free above ₹X", the platform campaign
 * (Option B), the gateway fee on delivery, and the seller's own slab when no
 * courier serves the address. Tested in scripts/tests/delivered-offers.test.ts.
 */

import { computeSellerPricing, type CartPricingLine, type CourierPricingOptions } from "./cart-pricing";
import type { CourierQuote } from "./courier-quote";
import { deliveryByDate } from "./delivery-eta";
import { lineDeliveryShare, offerPct, type FreeDeliverySettings } from "./free-delivery";
import type { DeliverySettingsLike } from "../utils/delivery";

/** What the client asks about: one pack of one product from one seller. */
export type OfferInput = {
  /** The client's own id for matching the answer (product + seller + size). */
  id: string;
  sellerKey: string;
  /** Pack size label, e.g. "1 kg" (the weight is read from it, as at checkout). */
  size?: string;
  /** The seller's price for this pack, after their discount (GST as configured). */
  price: number;
  gstApplicable?: boolean;
  gstRate?: number;
  gstIncluded?: boolean;
  extraDeliveryCharge?: number;
  productFree?: boolean;
  productPct?: number;
  manufacturerPhone?: string;
};

export type OfferResult = {
  id: string;
  /**
   * ok: priced. pending: the courier answer for this route isn't in yet (ask
   * again in a few seconds). unavailable: the offer can't be priced (bad input,
   * seller unknown).
   */
  status: "ok" | "pending" | "unavailable";
  /** courier = Delhivery/Shiprocket; seller = the seller delivers at their own charge. */
  mode?: "courier" | "seller";
  /** Item incl. any added GST (one pack). */
  itemTotal?: number;
  deliveryCharge?: number;
  free?: boolean;
  /** The platform campaign paying for (part of) delivery, by name. */
  campaign?: string | null;
  /** itemTotal + deliveryCharge. */
  total?: number;
  etaDays?: number | null;
  /** YYYY-MM-DD, when the courier gave a transit time. */
  deliveryBy?: string | null;
  carrier?: string | null;
};

export const MAX_OFFERS = 60;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));

/** Validates and trims one offer from the request body; null when unusable. */
export function parseOffer(raw: unknown): OfferInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").slice(0, 200);
  const sellerKey = String(o.sellerKey ?? "").trim().slice(0, 40);
  const price = n(o.price);
  if (!id || !sellerKey || !(price > 0) || price > 10_000_000) return null;
  const extra = n(o.extraDeliveryCharge);
  const rate = n(o.gstRate);
  return {
    id,
    sellerKey,
    size: String(o.size ?? "").slice(0, 40),
    price,
    gstApplicable: o.gstApplicable === true,
    gstRate: Number.isFinite(rate) && rate >= 0 && rate <= 40 ? rate : 0,
    gstIncluded: o.gstIncluded !== false,
    extraDeliveryCharge: Number.isFinite(extra) && extra > 0 ? extra : 0,
    productFree: o.productFree === true,
    productPct: offerPct(o.productPct),
    manufacturerPhone: String(o.manufacturerPhone ?? "").trim().slice(0, 20),
  };
}

/**
 * Prices one offer.
 *
 * `quote`: the cheapest courier for this seller → pincode → weight band;
 * null = no courier serves it (seller's own slab); "pending" = not known yet.
 * `courierOn` false (courier pricing switched off) → seller's slab, as checkout.
 */
export function priceOffer(input: {
  offer: OfferInput;
  /** Pack weight in kg (raw, for the seller slab). */
  packKg: number;
  /** Billable courier band for one pack (lib/courier-quote parcelKgFor). */
  bandKg: number;
  settings: (DeliverySettingsLike & FreeDeliverySettings) | null;
  makerSettings: FreeDeliverySettings;
  customerState: string;
  courierOn: boolean;
  quote: CourierQuote | null | "pending";
  pricing: CourierPricingOptions;
  now?: Date;
}): OfferResult {
  const { offer } = input;
  if (input.courierOn && input.quote === "pending") return { id: offer.id, status: "pending" };

  const line: CartPricingLine = {
    sellerKey: offer.sellerKey,
    unitPrice: offer.price,
    qty: 1,
    weightKg: input.packKg > 0 ? input.packKg : 0,
    gstApplicable: offer.gstApplicable,
    gstRate: offer.gstRate,
    gstIncluded: offer.gstIncluded,
    extraDeliveryCharge: offer.extraDeliveryCharge,
    freeDelivery: offer.productFree,
    deliveryShare: lineDeliveryShare({
      productFree: offer.productFree,
      productPct: offer.productPct,
      seller: input.settings,
      manufacturer: input.makerSettings,
    }),
  };

  const quote = input.courierOn && input.quote && input.quote !== "pending" ? input.quote : null;
  const deliveryBy = quote ? deliveryByDate(quote.etaDays, input.now) : null;
  const sp = computeSellerPricing(
    offer.sellerKey,
    [line],
    input.settings,
    input.customerState,
    quote
      ? {
        charge: Math.ceil(quote.cost),
        carrier: quote.carrier,
        service: quote.service,
        etaDays: quote.etaDays ?? null,
        weightKg: input.bandKg,
        deliveryBy,
      }
      : null,
    input.pricing,
  );
  const itemTotal = Number((sp.subtotal + sp.gstAdded).toFixed(2));
  return {
    id: offer.id,
    status: "ok",
    mode: quote ? "courier" : "seller",
    itemTotal,
    deliveryCharge: sp.deliveryCharge,
    free: sp.deliveryCharge <= 0,
    campaign: sp.delivery.campaign?.name ?? null,
    total: sp.total,
    etaDays: quote?.etaDays ?? null,
    deliveryBy,
    carrier: quote?.carrier ?? null,
  };
}
