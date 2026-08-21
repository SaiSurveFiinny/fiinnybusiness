"use client";

/**
 * Client-side read cache for the admin portal.
 *
 * The admin pages are dominated by whole-collection scans (`users`, `products`,
 * `subscriptions`, `orders`). Before this module every page mount — and every
 * back-and-forth between tabs — re-ran those scans, so a few minutes of normal
 * admin browsing burned tens of thousands of Firestore document reads.
 *
 * Two layers:
 *
 *  1. `cachedFetch` — a module-level in-memory cache keyed by a logical dataset
 *     name, shared across every admin page for as long as the SPA stays loaded.
 *     Concurrent callers share one in-flight promise, so mounting two pages that
 *     need `users` costs a single scan. Entries expire after a TTL and can be
 *     force-refreshed (the "Refresh" buttons) or invalidated after a write.
 *
 *  2. `readSnapshot` / `writeSnapshot` — localStorage-backed snapshots of small,
 *     plain-JSON summaries (the overview/analytics stat tiles). These survive a
 *     full page reload, so the dashboard paints last-known numbers instantly and
 *     only re-reads Firestore when the snapshot is stale or the admin asks.
 *     Never put Firestore Timestamps/GeoPoints in a snapshot — JSON drops them.
 */

/** Logical dataset names — one cache entry each, shared by every page that needs it. */
export const CACHE_KEYS = {
  users: "users:all",
  products: "products:raw",
  subscriptions: "subscriptions:all",
  plans: "plans:all",
  orders: "orders:all",
  roleCounts: "users:roleCounts",
} as const;

/** Default freshness window for a cached collection scan. */
export const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Freshness window for the overview/analytics stat snapshots. */
export const STATS_TTL_MS = 30 * 60 * 1000; // 30 minutes

type Entry = { at: number; value: unknown; inflight?: Promise<unknown> };

const memory = new Map<string, Entry>();

/**
 * Returns the cached value for `key`, running `fetcher` only when nothing fresh
 * is cached. Set `force` to bypass the cache (the Refresh buttons).
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const hit = memory.get(key);

  if (!opts.force && hit) {
    // An in-flight fetch is always joined, even past the TTL — two pages mounting
    // at once must not both scan the collection.
    if (hit.inflight) return hit.inflight as Promise<T>;
    if (Date.now() - hit.at < ttl) return hit.value as T;
  }

  const inflight = fetcher()
    .then(value => {
      memory.set(key, { at: Date.now(), value });
      return value;
    })
    .catch(err => {
      // Drop the failed entry so the next caller retries instead of joining a
      // rejected promise forever.
      memory.delete(key);
      throw err;
    });

  memory.set(key, { at: hit?.at ?? 0, value: hit?.value, inflight });
  return inflight;
}

/** Age of a cache entry in ms, or null when nothing is cached. */
export function cacheAge(key: string): number | null {
  const hit = memory.get(key);
  return hit && hit.at ? Date.now() - hit.at : null;
}

/** Drops one dataset (or everything) — call after a write that changes it. */
export function invalidateCache(key?: string) {
  if (key) memory.delete(key);
  else memory.clear();
}

// ─── localStorage snapshots (plain JSON only) ────────────────────────────────

const SNAPSHOT_PREFIX = "kd_admin_snapshot:";

export type Snapshot<T> = { data: T; savedAt: number };

export function readSnapshot<T>(key: string): Snapshot<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SNAPSHOT_PREFIX + key,
      JSON.stringify({ data, savedAt: Date.now() } satisfies Snapshot<T>),
    );
  } catch {
    /* quota / private mode — the page still works, just without a warm start */
  }
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" — for the "Updated …" labels. */
export function formatAge(savedAt: number | null | undefined): string {
  if (!savedAt) return "never";
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
