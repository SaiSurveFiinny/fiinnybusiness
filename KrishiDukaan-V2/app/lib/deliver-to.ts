"use client";

import { useSyncExternalStore } from "react";

/**
 * "Deliver to 411038": the pincode delivered prices are worked out for
 * (docs/delivered-price-architecture.md §4.1).
 *
 *   - Logged in: the profile's delivery address pincode (page.tsx sets it when
 *     the profile loads, and again whenever profile or checkout saves one).
 *   - Guest, or someone checking another address: the pincode they type in
 *     the "Deliver to" chip. That choice wins over the profile until an
 *     address is saved again.
 * Kept in localStorage so every page (SPA views and the server-rendered
 * product / category pages) starts with it. No pincode → prices show as before.
 */

type DeliverTo = { pincode: string; source: "profile" | "user"; city?: string };

const KEY = "kd_deliver_to_v1";
const PIN = /^[1-9]\d{5}$/;
let current: DeliverTo | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): DeliverTo | null {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as DeliverTo) : null;
    current = v && PIN.test(v.pincode) ? v : null;
    if (!current) {
      // The product page's earlier "Deliver to" box kept its own pincode.
      const legacy = window.localStorage.getItem("kd_delivery_pincode") ?? "";
      if (PIN.test(legacy)) current = { pincode: legacy, source: "user" };
    }
  } catch {
    current = null;
  }
  return current;
}

function save(v: DeliverTo | null) {
  current = v;
  try {
    if (v) window.localStorage.setItem(KEY, JSON.stringify(v));
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode: kept for this page only */ }
  listeners.forEach((l) => l());
}

/** The customer typed a pincode in the chip. */
export function chooseDeliverTo(pincode: string, city?: string) {
  if (!PIN.test(pincode)) return;
  save({ pincode, source: "user", ...(city ? { city } : {}) });
}

/**
 * The profile's saved address. `saved` true when it was just saved (profile or
 * checkout): it then replaces a pincode typed in the chip too.
 */
export function profileDeliverTo(pincode: string, opts: { saved?: boolean; city?: string } = {}) {
  if (typeof window === "undefined" || !PIN.test(pincode)) return;
  const cur = load();
  if (cur?.source === "user" && !opts.saved) return;
  if (cur?.pincode === pincode && cur.source === "profile") return;
  save({ pincode, source: "profile", ...(opts.city ? { city: opts.city } : {}) });
}

/** On logout: a typed pincode stays (it's the device's), the profile's goes. */
export function clearProfileDeliverTo() {
  if (typeof window === "undefined") return;
  if (load()?.source === "profile") save(null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

/** The current "Deliver to", or null (server render and first paint: null). */
export function useDeliverTo(): DeliverTo | null {
  return useSyncExternalStore(subscribe, () => load(), () => null);
}
