/**
 * Delivered price on listings = checkout's price for one pack
 * (app/lib/delivered-offers.ts).
 *
 *   npx tsx scripts/tests/delivered-offers.test.ts
 */
import assert from "node:assert/strict";
import { parseOffer, priceOffer, type OfferInput } from "../../app/lib/delivered-offers";
import { computeSellerPricing } from "../../app/lib/cart-pricing";
import { splitCourierCost } from "../../functions/src/payouts/settlement";
import { parcelKgFor } from "../../app/lib/courier-quote";

const rates = { commissionPercent: 2, gatewayFeePercent: 2, gatewayFeeGstPercent: 18, feeBearer: "seller" as const, holdTransfers: true };
const now = new Date("2026-11-17T06:00:00Z"); // Tue, IST
const offer: OfferInput = { id: "p1|+919000000001|1 kg", sellerKey: "+919000000001", size: "1 kg", price: 450 };
const quote = { carrier: "delhivery" as const, service: "Surface", cost: 79.4, etaDays: 3 };
const base = {
  offer, packKg: 1, bandKg: parcelKgFor([{ qty: 1, weightKg: 1 }]),
  settings: null, makerSettings: null, customerState: "Maharashtra",
  courierOn: true, quote, pricing: { rates, campaign: null }, now,
};

// 1. Courier, no offer: the customer pays the courier (rounded up) + gateway fee on it.
const r1 = priceOffer(base);
const split = splitCourierCost({ cost: 80, sellerShare: 0, campaign: null, rates });
assert.equal(r1.status, "ok");
assert.equal(r1.mode, "courier");
assert.equal(r1.deliveryCharge, split.customerDelivery);
assert.equal(r1.total, Number((450 + split.customerDelivery).toFixed(2)));
assert.equal(r1.deliveryBy, "2026-11-21"); // pickup Wed 18, +3 working days → Sat 21
assert.equal(base.bandKg, 1.5); // 1 kg + 10% packing → 1.5 kg band

// 2. Exactly checkout's number for the same one-pack line.
const sp = computeSellerPricing(offer.sellerKey, [{ sellerKey: offer.sellerKey, unitPrice: 450, qty: 1, weightKg: 1, deliveryShare: 0 }],
  null, "Maharashtra", { charge: 80, carrier: "delhivery", service: "Surface", etaDays: 3, weightKg: 1.5 }, { rates, campaign: null });
assert.equal(r1.total, sp.total);

// 3. Product free delivery → FREE, total = item.
const r3 = priceOffer({ ...base, offer: { ...offer, productFree: true } });
assert.equal(r3.free, true);
assert.equal(r3.deliveryCharge, 0);
assert.equal(r3.total, 450);

// 4. Store "free above ₹400" — one pack of ₹450 qualifies.
const r4 = priceOffer({ ...base, settings: { freeDeliveryAbove: 400 } as never });
assert.equal(r4.free, true);
// … ₹500 threshold doesn't.
assert.equal(priceOffer({ ...base, settings: { freeDeliveryAbove: 500 } as never }).free, false);

// 5. Seller pays 50% (product offer): customer pays half + fee on it.
const r5 = priceOffer({ ...base, offer: { ...offer, productPct: 50 } });
assert.equal(r5.deliveryCharge, splitCourierCost({ cost: 80, sellerShare: 0.5, campaign: null, rates }).customerDelivery);

// 6. Campaign (Option B) pays the rest, capped.
const camp = { name: "Diwali", maxPerOrder: 50 };
const r6 = priceOffer({ ...base, pricing: { rates, campaign: camp } });
assert.equal(r6.campaign, "Diwali");
assert.equal(r6.deliveryCharge, splitCourierCost({ cost: 80, sellerShare: 0, campaign: camp, rates }).customerDelivery);
const r6b = priceOffer({ ...base, pricing: { rates, campaign: { name: "Free", maxPerOrder: 0 } } });
assert.equal(r6b.free, true);

// 7. Excluded GST is part of the delivered total.
const r7 = priceOffer({ ...base, offer: { ...offer, gstApplicable: true, gstRate: 5, gstIncluded: false } });
assert.equal(r7.itemTotal, 472.5);

// 8. No courier serves it → the seller's slab for the customer's state.
const slabs = { coverageType: "states", weightSlabs: [{ minKg: 0, maxKg: 5, charge: 60 }] };
const r8 = priceOffer({ ...base, quote: null, settings: slabs as never });
assert.equal(r8.mode, "seller");
assert.equal(r8.deliveryCharge, 60);
assert.equal(r8.deliveryBy, null);
// Courier pricing switched off → seller slab even with a quote.
assert.equal(priceOffer({ ...base, courierOn: false, settings: slabs as never }).mode, "seller");

// 9. Not known yet.
assert.equal(priceOffer({ ...base, quote: "pending" }).status, "pending");

// parseOffer: rejects junk, clamps the rest.
assert.equal(parseOffer({ id: "x", sellerKey: "+91900", price: 0 }), null);
assert.equal(parseOffer({ sellerKey: "+91900", price: 10 }), null);
const po = parseOffer({ id: "x", sellerKey: "+919000000001", price: "120", gstRate: 99, productPct: 150, extraDeliveryCharge: -5 })!;
assert.equal(po.price, 120);
assert.equal(po.gstRate, 0);
assert.equal(po.productPct, 0);
assert.equal(po.extraDeliveryCharge, 0);
assert.equal(po.gstIncluded, true);

console.log("delivered offers: all checks passed");
