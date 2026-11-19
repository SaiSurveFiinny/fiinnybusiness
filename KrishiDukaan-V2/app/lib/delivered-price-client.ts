"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketplaceProduct } from "../../types/product";
import type { OfferInput, OfferResult } from "./delivered-offers";

/**
 * Browser side of the delivered price (docs/delivered-price-architecture.md
 * §4.4). Pages render with the item price at once; this fills in "₹532
 * delivered · by Sat, 21 Nov" afterwards, for the products on screen only.
 *
 *   - Offers from every card on screen are sent in ONE request every 300 ms
 *     (at most 60 per request) to POST /api/delivery/offers.
 *   - Answers are kept 30 min on the device (memory + localStorage), keyed by
 *     the pincode and everything that changes the price, so refreshing or
 *     going back costs no request.
 *   - "pending" (couriers still answering for a new route) is asked again
 *     after 3 s, up to 3 times; after that the card simply shows no line.
 */

const TTL_MS = 30 * 60 * 1000;
const STORE_KEY = "kd_delivered_v1";
const MAX_STORED = 600;
const BATCH_MS = 300;
const MAX_BATCH = 60;
const RETRY_MS = 3000;
const MAX_TRIES = 3;

type Cached = { at: number; r: OfferResult };
const mem = new Map<string, Cached>();
let storeLoaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadStore() {
  if (storeLoaded) return;
  storeLoaded = true;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, Cached>) : {};
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) if (v && now - v.at < TTL_MS) mem.set(k, v);
  } catch { /* nothing stored */ }
}

function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const now = Date.now();
      const entries = Array.from(mem.entries()).filter(([, v]) => now - v.at < TTL_MS).slice(-MAX_STORED);
      window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* storage full or blocked: memory only */ }
  }, 1000);
}

const cacheKey = (pin: string, o: OfferInput) => `${pin}|${o.id}`;

function cached(pin: string, o: OfferInput): OfferResult | null {
  loadStore();
  const c = mem.get(cacheKey(pin, o));
  return c && Date.now() - c.at < TTL_MS ? c.r : null;
}

// ── Batching ───────────────────────────────────────────────────────────────
type Waiter = { pin: string; offer: OfferInput; tries: number; done: (r: OfferResult | null) => void };
let queue: Waiter[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/** Same offer asked by two cards at once → one entry in the request. */
const waiting = new Map<string, Array<(r: OfferResult | null) => void>>();

function schedule(delay = BATCH_MS) {
  if (timer) return;
  timer = setTimeout(flush, delay);
}

async function flush() {
  timer = null;
  const batch = queue.splice(0, MAX_BATCH);
  if (queue.length) schedule(0);
  const byPin = new Map<string, Waiter[]>();
  for (const w of batch) {
    const list = byPin.get(w.pin) ?? [];
    list.push(w);
    byPin.set(w.pin, list);
  }
  await Promise.all(Array.from(byPin.entries()).map(async ([pin, ws]) => {
    let results: OfferResult[] = [];
    try {
      const res = await fetch("/api/delivery/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pincode: pin, offers: ws.map((w) => w.offer) }),
      });
      if (res.ok) results = ((await res.json()) as { results?: OfferResult[] }).results ?? [];
    } catch { results = []; }
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const w of ws) {
      const r = byId.get(w.offer.id);
      if (r?.status === "pending" && w.tries + 1 < MAX_TRIES) {
        setTimeout(() => { queue.push({ ...w, tries: w.tries + 1 }); schedule(); }, RETRY_MS);
        continue;
      }
      if (r?.status === "ok" || r?.status === "unavailable") {
        mem.set(cacheKey(pin, w.offer), { at: Date.now(), r });
        persistSoon();
      }
      w.done(r && r.status !== "pending" ? r : null);
    }
  }));
}

/** The delivered price of one offer at this pincode (null: unknown for now). */
export function deliveredOffer(pin: string, offer: OfferInput): Promise<OfferResult | null> {
  const hit = cached(pin, offer);
  if (hit) return Promise.resolve(hit);
  const key = cacheKey(pin, offer);
  return new Promise((resolve) => {
    const list = waiting.get(key);
    if (list) { list.push(resolve); return; }
    waiting.set(key, [resolve]);
    queue.push({
      pin, offer, tries: 0,
      done: (r) => { (waiting.get(key) ?? []).forEach((f) => f(r)); waiting.delete(key); },
    });
    schedule(queue.length >= MAX_BATCH ? 0 : BATCH_MS);
  });
}

// ── Offers from a marketplace card ─────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;

/** What a card needs to be priced delivered (marketplace cards and SEO products both have it). */
export type CardSource = Pick<
  MarketplaceProduct,
  "id" | "sellMode" | "unit" | "variants" | "availability" | "gstApplicable" | "gstRate" | "gstIncluded"
  | "extraDeliveryCharge" | "freeDelivery" | "sellerDeliveryPct" | "manufacturerPhone"
>;
type Seller = NonNullable<MarketplaceProduct["availability"]>[number];
const tail10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** One pack of `size` from one seller of `p`, as the endpoint wants it. */
export function offerFor(
  p: CardSource,
  a: Seller,
  size: string,
  price: number,
): OfferInput | null {
  const sellerKey = String(a.storePhone || a.storeId || "").trim();
  if (!sellerKey || !(price > 0)) return null;
  const o = {
    sellerKey,
    size,
    price: r2(price),
    gstApplicable: a.gstApplicable ?? p.gstApplicable ?? false,
    gstRate: a.gstRate ?? p.gstRate ?? 0,
    gstIncluded: a.gstIncluded ?? p.gstIncluded ?? true,
    extraDeliveryCharge: a.extraDeliveryCharge ?? p.extraDeliveryCharge ?? 0,
    productFree: a.freeDelivery ?? p.freeDelivery ?? false,
    productPct: a.sellerDeliveryPct ?? p.sellerDeliveryPct ?? 0,
    manufacturerPhone: p.manufacturerPhone ?? "",
  };
  // Everything that changes the answer is in the id, so a changed price or
  // offer is never served from the device cache.
  const id = [p.id, sellerKey, size, o.price, o.gstApplicable ? o.gstRate : "-", o.gstIncluded ? "i" : "x",
    o.extraDeliveryCharge, o.productFree ? "F" : o.productPct].join("|");
  return { id, ...o };
}

/** Whether a seller entry can take an online order (same rule as the product page). */
function sellsOnline(a: Seller): boolean {
  if (a.isOnline === false) return false;
  return !String(a.stockLevel ?? "").toLowerCase().includes("out");
}

/**
 * A card's offers: the base pack from its 3 cheapest online sellers (by item
 * price after their discount). The cheapest delivered is almost always among
 * them; asking about every seller would multiply requests for little gain.
 * `onlySeller`: a store's own page prices just that store.
 */
export function cardOffers(p: CardSource, perCard = 3, onlySeller?: string): OfferInput[] {
  if (p.sellMode === "offline_store_only") return [];
  const size = p.unit || p.variants?.[0]?.unit || "";
  const only = onlySeller ? tail10(onlySeller) : "";
  const list = (p.availability ?? [])
    .filter(sellsOnline)
    .filter((a) => !only || tail10(a.storePhone || a.storeId) === only)
    .map((a) => {
      const base = typeof a.sellingPrice === "number" ? a.sellingPrice : 0;
      const pct = a.discountPct && a.discountPct > 0 ? Math.min(a.discountPct, 99) : 0;
      return { a, price: base * (1 - pct / 100) };
    })
    .filter((x) => x.price > 0)
    .sort((x, y) => x.price - y.price)
    .slice(0, perCard);
  return list.map((x) => offerFor(p, x.a, size, x.price)).filter((o): o is OfferInput => o !== null);
}

/** Cheapest delivered first; a known date breaks ties. Pending/unknown last. */
export function rankDelivered<T extends { result: OfferResult | null }>(rows: T[]): T[] {
  const score = (r: OfferResult | null) => (r?.status === "ok" && typeof r.total === "number" ? r.total : Infinity);
  return [...rows].sort((a, b) =>
    score(a.result) - score(b.result) ||
    (a.result?.deliveryBy ?? "9999").localeCompare(b.result?.deliveryBy ?? "9999"));
}

/**
 * Delivered prices for these offers at `pin`, fetched only while `active`
 * (the card is on screen). Returns id → result as they arrive.
 */
export function useDeliveredOffers(offers: OfferInput[], pin: string | null, active: boolean): Map<string, OfferResult | null> {
  const sig = offers.map((o) => o.id).join("¦");
  const [results, setResults] = useState<Map<string, OfferResult | null>>(() => new Map());
  useEffect(() => {
    if (!pin) { setResults(new Map()); return; }
    // Already on the device: show at once, even before the card is on screen.
    const now = new Map<string, OfferResult | null>();
    let missing = false;
    for (const o of offers) {
      const hit = cached(pin, o);
      if (hit) now.set(o.id, hit); else missing = true;
    }
    setResults(now);
    if (!missing || !active) return;
    let alive = true;
    for (const o of offers) {
      if (now.has(o.id)) continue;
      void deliveredOffer(pin, o).then((r) => {
        if (!alive) return;
        setResults((cur) => new Map(cur).set(o.id, r));
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, pin, active]);
  return results;
}

/** The best (cheapest delivered) of a card's offers, or null while unknown. */
export function useBestDelivered(offers: OfferInput[], pin: string | null, active: boolean): OfferResult | null {
  const results = useDeliveredOffers(offers, pin, active);
  return useMemo(() => {
    const rows = offers.map((o) => ({ result: results.get(o.id) ?? null }));
    const best = rankDelivered(rows)[0]?.result ?? null;
    return best?.status === "ok" ? best : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);
}
