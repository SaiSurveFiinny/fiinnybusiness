import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import {
  cachedQuotes, courierCheckoutEnabled, fetchRoute, parcelKgFor, pickupPincodesFor, quoteRouteKey, storeQuotes,
  type CourierQuote, type QuoteRoute,
} from "../../../lib/courier-quote";
import { MAX_OFFERS, parseOffer, priceOffer, type OfferInput, type OfferResult } from "../../../lib/delivered-offers";
import { pincodeInfo } from "../../../lib/pincode-info";
import { loadRouteConfig } from "../../../lib/route-server";
import { loadActiveCampaign } from "../../../lib/delivery-campaign";
import { parseVariantWeightKg } from "../../../utils/weight";

/**
 * POST /api/delivery/offers
 *   { pincode, offers: [{ id, sellerKey, size, price, gst…, productFree, productPct, manufacturerPhone }] }
 *   → { enabled, pincode, state, results: [{ id, status, total, deliveryCharge, free, deliveryBy, … }] }
 *
 * The delivered price (item + delivery, and the date) for the products on the
 * customer's screen, priced like checkout (lib/delivered-offers.ts). Built to
 * be cheap on every refresh (docs/delivered-price-architecture.md §4.4):
 *   - courier answers come from the shared 12 h cache (one Firestore read per
 *     customer pincode, lib/courier-quote); only routes nobody asked about
 *     yet go to the couriers, at most 6 at once, within ~4 s — the rest
 *     answer "pending" and the client asks again;
 *   - seller pincodes and delivery settings are batched reads, kept in memory;
 *   - fetched routes are saved with one write per customer pincode;
 *   - the client keeps answers for 30 min, so a page refresh sends nothing.
 * Prices are a display: checkout prices the order again on the server.
 */

const PIN = /^[1-9]\d{5}$/;
const k10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
const FETCH_CONCURRENCY = 6;
const FETCH_BUDGET_MS = 4000;

// ── Abuse limits (per IP, per server instance) ─────────────────────────────
const hits = new Map<string, { at: number; n: number; fetched: number }>();
function limiter(ip: string) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    if (hits.size > 5000) hits.clear();
    h = { at: now, n: 0, fetched: 0 };
    hits.set(ip, h);
  }
  return h;
}

// ── Seller delivery settings: batched, 10 min in memory ────────────────────
const memSettings = new Map<string, { at: number; d: Record<string, unknown> | null }>();
async function deliverySettingsFor(keys: string[]): Promise<Map<string, Record<string, unknown> | null>> {
  const out = new Map<string, Record<string, unknown> | null>();
  const now = Date.now();
  const todo: string[] = [];
  for (const k of Array.from(new Set(keys.map(k10).filter((k) => k.length === 10)))) {
    const hit = memSettings.get(k);
    if (hit && now - hit.at < 10 * 60 * 1000) out.set(k, hit.d);
    else todo.push(k);
  }
  if (todo.length) {
    const db = getAdminDb();
    try {
      const snaps = await db.getAll(...todo.map((k) => db.collection("deliverySettings").doc(`+91${k}`)));
      snaps.forEach((s, i) => {
        const d = s.exists ? (s.data() as Record<string, unknown>) : null;
        out.set(todo[i]!, d);
        memSettings.set(todo[i]!, { at: Date.now(), d });
      });
    } catch {
      for (const k of todo) out.set(k, null);
    }
  }
  return out;
}

// Rates change rarely; one read a minute per instance, not one per request.
let memRates: { at: number; v: Awaited<ReturnType<typeof loadRouteConfig>> } | null = null;
async function rates() {
  if (memRates && Date.now() - memRates.at < 60_000) return memRates.v;
  memRates = { at: Date.now(), v: await loadRouteConfig() };
  return memRates.v;
}

/** Runs the fetches at most `limit` at a time and stops waiting at `deadline`. */
async function fetchSome(
  jobs: Array<{ route: QuoteRoute; value: number }>,
  limit: number,
  deadline: number,
): Promise<Map<string, CourierQuote | null>> {
  const got = new Map<string, CourierQuote | null>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && Date.now() < deadline) {
      const job = jobs[next++]!;
      const left = deadline - Date.now();
      if (left <= 0) break;
      const p = fetchRoute(job.route, job.value);
      // Past the budget the courier call keeps running and lands in the
      // cache; this request just answers "pending" for it.
      const res = await Promise.race([p, new Promise<"late">((r) => setTimeout(() => r("late"), left))]);
      if (res === "late" || res === undefined) continue;
      got.set(quoteRouteKey(job.route), res);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return got;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
  const lim = limiter(ip);
  if (++lim.n > 30) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { pincode?: unknown; offers?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const pincode = String(body.pincode ?? "").trim();
  if (!PIN.test(pincode)) return NextResponse.json({ error: "A 6-digit pincode is required" }, { status: 400 });
  const rawOffers = Array.isArray(body.offers) ? body.offers.slice(0, MAX_OFFERS) : [];
  const offers = rawOffers.map(parseOffer);
  const valid = offers.filter((o): o is OfferInput => o !== null);

  // The customer's state picks a seller's in-state / out-of-state slab.
  let info: Awaited<ReturnType<typeof pincodeInfo>> = null;
  try { info = await pincodeInfo(pincode); } catch { info = null; }
  if (!info) return NextResponse.json({ error: "Pincode not found" }, { status: 404 });

  const sellerKeys = valid.map((o) => o.sellerKey);
  const makerKeys = valid.map((o) => o.manufacturerPhone ?? "").filter(Boolean);
  const [courierOn, settings, pricingRates, campaign] = await Promise.all([
    courierCheckoutEnabled(),
    deliverySettingsFor([...sellerKeys, ...makerKeys]),
    rates(),
    loadActiveCampaign(),
  ]);
  const pickups = courierOn ? await pickupPincodesFor(sellerKeys) : new Map<string, string | null>();

  // One route per offer: the seller's shop → this pincode → one pack's band.
  const plan = valid.map((o) => {
    const packKg = parseVariantWeightKg(o.size);
    const bandKg = parcelKgFor([{ qty: 1, weightKg: packKg }]);
    const pickup = pickups.get(k10(o.sellerKey)) ?? null;
    const route: QuoteRoute | null = courierOn && pickup ? { pickup, drop: pincode, kg: bandKg } : null;
    return { o, packKg, bandKg, route };
  });

  const routes = plan.map((p) => p.route).filter((r): r is QuoteRoute => r !== null);
  const known = await cachedQuotes(routes);

  // Routes nobody has asked about yet: ask the couriers, within limits.
  const missing = new Map<string, { route: QuoteRoute; value: number }>();
  for (const p of plan) {
    if (!p.route) continue;
    const key = quoteRouteKey(p.route);
    if (known.has(key)) continue;
    const cur = missing.get(key);
    if (!cur) missing.set(key, { route: p.route, value: p.o.price });
    else cur.value = Math.max(cur.value, p.o.price);
  }
  const allowed = Math.max(0, 40 - lim.fetched);
  const jobs = Array.from(missing.values()).slice(0, allowed);
  lim.fetched += jobs.length;
  const fetched = jobs.length ? await fetchSome(jobs, FETCH_CONCURRENCY, Date.now() + FETCH_BUDGET_MS) : new Map();
  if (fetched.size) {
    await storeQuotes(Array.from(fetched.entries()).map(([key, quote]) => ({
      route: missing.get(key)!.route,
      quote,
    })));
  }

  const pricing = { rates: pricingRates, campaign };
  const byId = new Map<OfferInput, OfferResult>();
  for (const p of plan) {
    const key = p.route ? quoteRouteKey(p.route) : "";
    const quote: CourierQuote | null | "pending" = !p.route
      ? null
      : known.has(key) ? known.get(key)! : fetched.has(key) ? fetched.get(key)! : "pending";
    byId.set(p.o, priceOffer({
      offer: p.o,
      packKg: p.packKg,
      bandKg: p.bandKg,
      settings: settings.get(k10(p.o.sellerKey)) as never ?? null,
      makerSettings: p.o.manufacturerPhone ? (settings.get(k10(p.o.manufacturerPhone)) as never) ?? null : null,
      customerState: info.state,
      courierOn,
      quote,
      pricing,
    }));
  }

  const results: OfferResult[] = offers.map((o, i) =>
    o ? byId.get(o)! : { id: String((rawOffers[i] as { id?: unknown })?.id ?? "").slice(0, 200), status: "unavailable" });
  const pending = results.some((r) => r.status === "pending");

  return NextResponse.json(
    { enabled: courierOn, pincode, state: info.state, city: info.city, results },
    // Personal (it depends on the pincode and the cart's offers): never on the CDN.
    { headers: { "Cache-Control": pending ? "no-store" : "private, max-age=300" } },
  );
}
