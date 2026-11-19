import { getAdminDb } from "./firebase-admin";
import { expectedPickupDate } from "./delivery-eta";

/**
 * Checkout delivery priced from the couriers.
 *
 * THE BUSINESS RULE (owner, Nov 2026)
 *   - The customer pays what the courier charges: the cheaper of Delhivery and
 *     Shiprocket for this seller's shop → this pincode → this parcel weight.
 *     If only one serves the address, that one.
 *   - Neither serves it → the seller delivers, at the seller's own slab charge.
 *   - The price is fixed at payment. A later reassignment to a farther seller
 *     never charges the customer more; the platform pays the difference.
 *
 * SPEED (docs/delivered-price-architecture.md §4.4)
 *   Two couriers answer in ~1-2 s (about six API calls), so a quote is cached
 *   per (shop pincode, customer pincode, weight band) for 12 hours: courier
 *   rate cards don't change within a day, and listings, the product page, the
 *   cart and checkout all read this one cache, so they show the same number
 *   and checkout is already warm. Cached in memory and in Firestore, where
 *   every route to one customer pincode lives in ONE document
 *   (deliveryQuotes/{pincode}, map "pickup_kg" → quote): a page with sellers
 *   in many towns costs one read, not one per town. Identical requests in
 *   flight share one courier call.
 *
 * Weight bands: couriers bill in 0.5 kg steps, so the parcel weight is rounded
 * UP to the next 0.5 kg. Cart and checkout therefore always price the same band.
 */

export type CourierQuote = {
  carrier: "delhivery" | "shiprocket";
  service: string;
  courierId?: number;
  cost: number;
  etaDays?: number | null;
};

const TIMEOUT_MS = 6000;
/** How long a courier answer is reused. Rate cards change rarely; transit days are re-dated on every read. */
export const QUOTE_CACHE_MS = 12 * 3600 * 1000;
const PIN = /^[1-9]\d{5}$/;
const QUOTES = "deliveryQuotes";
const MEM_MAX = 20_000;
/** route key → cached answer (null = no courier serves this route). */
const memQuotes = new Map<string, { at: number; quote: CourierQuote | null }>();
/** Customer pincodes whose Firestore bucket was read lately (a miss there isn't re-read per request). */
const bucketReadAt = new Map<string, number>();
const inflight = new Map<string, Promise<CourierQuote | null | undefined>>();
const memPickup = new Map<string, { at: number; pin: string | null }>();
let memConfig: { at: number; on: boolean } | null = null;

/** Off unless _serverConfig/shipping has enabled AND checkoutPricing true. */
export async function courierCheckoutEnabled(): Promise<boolean> {
  if (memConfig && Date.now() - memConfig.at < 60_000) return memConfig.on;
  let on = false;
  try {
    const d = (await getAdminDb().collection("_serverConfig").doc("shipping").get()).data();
    on = d?.enabled === true && d?.checkoutPricing === true;
  } catch { on = false; }
  memConfig = { at: Date.now(), on };
  return on;
}

const k10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** A seller document's pincode, nested or flat; "" when unusable. */
function pinOf(d: Record<string, unknown>): string {
  const a = d.address && typeof d.address === "object" ? (d.address as Record<string, unknown>) : {};
  const flat = String(a.pincode ?? d.pincode ?? "").trim();
  if (PIN.test(flat)) return flat;
  const text = typeof d.address === "string" ? d.address : "";
  return text.match(/\b[1-9]\d{5}\b/)?.[0] ?? "";
}

/** The seller's shop pincode (same document order as the booking code). */
export async function pickupPincodeFor(sellerKey: string): Promise<string | null> {
  const k = k10(sellerKey);
  if (k.length !== 10) return null;
  const hit = memPickup.get(k);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.pin;
  const db = getAdminDb();
  let pin: string | null = null;
  outer: for (const col of ["manufacturers", "retailers", "profiles", "users"]) {
    const snaps = await Promise.all([`+91${k}`, k].map((id) => db.collection(col).doc(id).get()));
    for (const s of snaps) {
      if (!s.exists) continue;
      const p = pinOf(s.data() ?? {});
      if (p) { pin = p; break outer; }
    }
  }
  memPickup.set(k, { at: Date.now(), pin });
  return pin;
}

/**
 * Shop pincodes for many sellers at once (the listing's delivered prices):
 * the same documents and order as pickupPincodeFor, but read with two batched
 * getAll calls (manufacturers + retailers, then profiles + users for the rest)
 * instead of up to eight reads per seller. Cached in memory 10 minutes.
 */
export async function pickupPincodesFor(sellerKeys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const now = Date.now();
  const todo: string[] = [];
  for (const raw of sellerKeys) {
    const k = k10(raw);
    if (k.length !== 10 || out.has(k)) continue;
    const hit = memPickup.get(k);
    if (hit && now - hit.at < 10 * 60 * 1000) out.set(k, hit.pin);
    else if (!todo.includes(k)) todo.push(k);
  }
  if (!todo.length) return out;
  const db = getAdminDb();
  let left = todo;
  for (const cols of [["manufacturers", "retailers"], ["profiles", "users"]]) {
    if (!left.length) break;
    const refs = left.flatMap((k) => cols.flatMap((c) => [`+91${k}`, k].map((id) => db.collection(c).doc(id))));
    let snaps: FirebaseFirestore.DocumentSnapshot[] = [];
    try { snaps = await db.getAll(...refs); } catch { snaps = []; }
    const per = cols.length * 2;
    const next: string[] = [];
    left.forEach((k, i) => {
      let pin = "";
      for (const sn of snaps.slice(i * per, i * per + per)) {
        if (sn.exists) { pin = pinOf(sn.data() ?? {}); if (pin) break; }
      }
      if (pin) { out.set(k, pin); memPickup.set(k, { at: Date.now(), pin }); }
      else next.push(k);
    });
    left = snaps.length ? next : [];
  }
  for (const k of left) { out.set(k, null); memPickup.set(k, { at: Date.now(), pin: null }); }
  return out;
}

/** The customer's pincode: the explicit field first, else from the address. */
export function dropPincodeFrom(address: unknown, explicit?: unknown): string {
  const e = String(explicit ?? "").trim();
  if (PIN.test(e)) return e;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const p = String(a.pincode ?? a.addressPincode ?? "").trim();
    if (PIN.test(p)) return p;
  }
  return String(address ?? "").match(/\b[1-9]\d{5}\b/)?.[0] ?? "";
}

/**
 * Billable parcel weight: each line's pack weight (a size we can't read counts
 * 1 kg per unit), +10% packing, at least 0.5 kg, rounded UP to the 0.5 kg band.
 * Same rule as the booking code (functions/src/shipping/pure.ts parcelKg).
 */
export function parcelKgFor(lines: Array<{ qty: number; weightKg: number }>): number {
  const raw = lines.reduce((s, l) => s + (l.weightKg > 0 ? l.weightKg : Math.max(1, l.qty) * 1), 0);
  const kg = Math.max(0.5, raw * 1.1);
  return Math.ceil(kg * 2) / 2;
}

async function http(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function delhivery(pickup: string, drop: string, kg: number): Promise<CourierQuote[]> {
  const token = process.env.DELHIVERY_API_TOKEN;
  if (!token) return [];
  const h = { Authorization: `Token ${token}`, Accept: "application/json" };
  const pin = await http(`https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${drop}`, { headers: h });
  const code = pin?.delivery_codes?.[0]?.postal_code;
  if (!code || String(code.pre_paid).toUpperCase() !== "Y") return [];
  const grams = Math.ceil(kg * 1000);
  const pickupAt = encodeURIComponent(`${expectedPickupDate()} 11:00`);
  const modes = ["S", "E"] as const;
  // Price and transit time per mode, all in parallel (transit days drive the
  // "Delivery by" date the customer sees).
  const [rates, tats] = await Promise.all([
    Promise.all(modes.map((md) =>
      http(`https://track.delhivery.com/api/kinko/v1/invoice/charges/.json?md=${md}&ss=Delivered&d_pin=${drop}&o_pin=${pickup}&cgm=${grams}&pt=Pre-paid`, { headers: h })
        .catch(() => null))),
    Promise.all(modes.map((md) =>
      http(`https://track.delhivery.com/api/dc/expected_tat?origin_pin=${pickup}&destination_pin=${drop}&mot=${md}&pdt=B2C&expected_pickup_date=${pickupAt}`, { headers: h })
        .catch(() => null))),
  ]);
  const out: CourierQuote[] = [];
  rates.forEach((r, i) => {
    const cost = Number((Array.isArray(r) ? r[0] : r)?.total_amount);
    const tat = Number(tats[i]?.data?.tat);
    if (Number.isFinite(cost) && cost > 0) {
      out.push({ carrier: "delhivery", service: i === 0 ? "Surface" : "Express", cost, etaDays: Number.isFinite(tat) && tat > 0 ? tat : null });
    }
  });
  return out;
}

async function shiprocketToken(): Promise<string | null> {
  const email = process.env.SHIPROCKET_API_EMAIL;
  const password = process.env.SHIPROCKET_API_PASSWORD;
  if (!email || !password) return null;
  // Shared with the booking functions (functions/src/shipping/carriers.ts).
  const ref = getAdminDb().collection("_serverConfig").doc("shiprocketToken");
  const cached = (await ref.get()).data();
  if (cached?.token && Number(cached.expiresAt) > Date.now()) return String(cached.token);
  const r = await http("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r?.token) return null;
  await ref.set({ token: r.token, expiresAt: Date.now() + 8 * 24 * 3600 * 1000 });
  return String(r.token);
}

async function shiprocket(pickup: string, drop: string, kg: number, value: number): Promise<CourierQuote[]> {
  const token = await shiprocketToken();
  if (!token) return [];
  const r = await http(
    `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickup}&delivery_postcode=${drop}&weight=${kg}&cod=0&declared_value=${Math.max(1, Math.ceil(value))}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const list = r?.data?.available_courier_companies;
  if (!Array.isArray(list)) return [];
  return list
    .map((c: any): CourierQuote => ({
      carrier: "shiprocket",
      service: String(c.courier_name ?? "Shiprocket"),
      courierId: Number(c.courier_company_id) || undefined,
      cost: Number(c.rate ?? c.freight_charge),
      etaDays: Number(c.estimated_delivery_days) || null,
    }))
    .filter((q: CourierQuote) => Number.isFinite(q.cost) && q.cost > 0);
}

/** Cheapest first; ties go to the faster courier. */
export function cheapestOf(quotes: CourierQuote[]): CourierQuote | null {
  const ok = quotes.filter((q) => Number.isFinite(q.cost) && q.cost > 0);
  ok.sort((a, b) => a.cost - b.cost || (a.etaDays ?? 99) - (b.etaDays ?? 99));
  return ok[0] ?? null;
}

/** One route: a seller's shop pincode → the customer's pincode → a weight band. */
export type QuoteRoute = { pickup: string; drop: string; kg: number };

const kgKey = (kg: number) => kg.toFixed(1);
const routeKey = (r: QuoteRoute) => `${r.pickup}_${r.drop}_${kgKey(r.kg)}`;
/** Field name inside deliveryQuotes/{drop}: "411001_1.5" ("." is not allowed in a field path). */
const bucketField = (r: QuoteRoute) => `${r.pickup}_${kgKey(r.kg).replace(".", "_")}`;
const validRoute = (r: QuoteRoute) => PIN.test(r.pickup) && PIN.test(r.drop) && r.kg > 0;

function remember(key: string, at: number, quote: CourierQuote | null) {
  if (memQuotes.size >= MEM_MAX) {
    // Oldest entries first (Map keeps insertion order).
    let n = MEM_MAX / 10;
    for (const k of Array.from(memQuotes.keys())) { if (n-- <= 0) break; memQuotes.delete(k); }
  }
  memQuotes.delete(key);
  memQuotes.set(key, { at, quote });
}

function fresh(at: number, now = Date.now()) {
  return Number.isFinite(at) && now - at < QUOTE_CACHE_MS;
}

/**
 * The cached answers for these routes: from memory, else one read of each
 * customer pincode's bucket. A route missing from the result has no fresh
 * answer yet; `null` means "no courier serves it".
 */
export async function cachedQuotes(routes: QuoteRoute[]): Promise<Map<string, CourierQuote | null>> {
  const out = new Map<string, CourierQuote | null>();
  const now = Date.now();
  const missByDrop = new Map<string, QuoteRoute[]>();
  for (const r of routes) {
    if (!validRoute(r)) continue;
    const key = routeKey(r);
    const m = memQuotes.get(key);
    if (m && fresh(m.at, now)) { out.set(key, m.quote); continue; }
    // A bucket read a moment ago already told us what Firestore has.
    if (now - (bucketReadAt.get(r.drop) ?? 0) < 30_000) continue;
    const list = missByDrop.get(r.drop) ?? [];
    list.push(r);
    missByDrop.set(r.drop, list);
  }
  if (!missByDrop.size) return out;
  const db = getAdminDb();
  const drops = Array.from(missByDrop.keys());
  try {
    const snaps = await db.getAll(...drops.map((d) => db.collection(QUOTES).doc(d)));
    snaps.forEach((snap, i) => {
      const drop = drops[i]!;
      bucketReadAt.set(drop, Date.now());
      const q = (snap.data()?.q ?? {}) as Record<string, { at?: number; quote?: CourierQuote | null }>;
      // Keep every fresh route in the bucket: the next product on the page
      // likely needs another one of them.
      for (const [field, v] of Object.entries(q)) {
        const at = Number(v?.at);
        if (!fresh(at, now)) continue;
        const [pickup, whole, frac] = field.split("_");
        const route = { pickup: pickup!, drop, kg: Number(`${whole}.${frac ?? "0"}`) };
        if (!validRoute(route)) continue;
        remember(routeKey(route), at, v?.quote ?? null);
      }
      for (const r of missByDrop.get(drop)!) {
        const m = memQuotes.get(routeKey(r));
        if (m && fresh(m.at, now)) out.set(routeKey(r), m.quote);
      }
    });
  } catch { /* cache read failed: the routes are fetched */ }
  return out;
}

/**
 * Asks the couriers for one route (shared by identical requests in flight).
 * Resolves to the quote, null when no courier serves it, or undefined when
 * both couriers were unreachable (not cached: an outage is not "no courier").
 * Stores the answer in memory only; persist with storeQuotes.
 */
export function fetchRoute(r: QuoteRoute, value: number): Promise<CourierQuote | null | undefined> {
  const key = routeKey(r);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const [a, b] = await Promise.allSettled([delhivery(r.pickup, r.drop, r.kg), shiprocket(r.pickup, r.drop, r.kg, value)]);
    if (a.status === "rejected" && b.status === "rejected") return undefined;
    const all = [...(a.status === "fulfilled" ? a.value : []), ...(b.status === "fulfilled" ? b.value : [])];
    const quote = cheapestOf(all);
    remember(key, Date.now(), quote);
    return quote;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Saves fetched answers: one merged write per customer pincode. */
export async function storeQuotes(entries: Array<{ route: QuoteRoute; quote: CourierQuote | null }>): Promise<void> {
  const byDrop = new Map<string, Record<string, { at: number; quote: CourierQuote | null }>>();
  for (const { route, quote } of entries) {
    if (!validRoute(route)) continue;
    const m = memQuotes.get(routeKey(route));
    const at = m?.at ?? Date.now();
    const fields = byDrop.get(route.drop) ?? {};
    fields[bucketField(route)] = { at, quote };
    byDrop.set(route.drop, fields);
  }
  const db = getAdminDb();
  await Promise.all(Array.from(byDrop.entries()).map(([drop, q]) =>
    db.collection(QUOTES).doc(drop).set({ q, updatedAt: Date.now() }, { merge: true }).catch((e) => {
      console.warn("[courier-quote] cache write failed", drop, e);
    })));
}

/**
 * The cheapest courier for this route and weight band, or null when no courier
 * serves it (or both are unreachable: then the seller's own charge applies, so
 * a courier outage never blocks checkout).
 */
export async function cheapestQuote(pickup: string, drop: string, kg: number, value: number): Promise<CourierQuote | null> {
  const route = { pickup, drop, kg };
  if (!validRoute(route)) return null;
  const cached = await cachedQuotes([route]);
  if (cached.has(routeKey(route))) return cached.get(routeKey(route)) ?? null;
  const quote = await fetchRoute(route, value);
  if (quote === undefined) return null;
  await storeQuotes([{ route, quote }]);
  return quote;
}

/** The cache key a route's answer is kept under (for callers matching results to routes). */
export { routeKey as quoteRouteKey };
