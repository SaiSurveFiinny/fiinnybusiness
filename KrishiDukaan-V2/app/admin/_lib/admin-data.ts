"use client";

/**
 * Cached accessors for the whole-collection scans the admin portal relies on.
 *
 * Every admin page should read its bulk data through these instead of calling the
 * `fetchAll*` helpers directly — that way the `users` scan is paid once and shared
 * by Users & Roles, Team, Companies, Reports, Subscriptions and Products, and the
 * `products` scan is shared by Overview, Analytics and the Products tab.
 *
 * Pass `force` (wired to each page's Refresh button) to bypass the cache.
 */

import {
  fetchAllUsers,
  fetchAllSellerProducts,
  fetchAllSubscriptions,
  fetchAllPlans,
  fetchAllOrdersForAdmin,
  fetchUserRoleCounts,
  type RawProductDoc,
} from "../../firebase";
import { CACHE_KEYS, cachedFetch, cacheAge, invalidateCache } from "./admin-cache";

export { CACHE_KEYS, cacheAge, invalidateCache } from "./admin-cache";

type Opts = { force?: boolean };

export function getUsers(opts: Opts = {}): Promise<any[]> {
  return cachedFetch(CACHE_KEYS.users, fetchAllUsers, opts);
}

/** Raw `products` docs (ownership + counter fields intact). */
export function getProducts(opts: Opts = {}): Promise<RawProductDoc[]> {
  return cachedFetch(CACHE_KEYS.products, fetchAllSellerProducts, opts);
}

export function getSubscriptions(opts: Opts = {}): Promise<any[]> {
  return cachedFetch(CACHE_KEYS.subscriptions, fetchAllSubscriptions, opts);
}

export function getPlans(opts: Opts = {}): Promise<any[]> {
  return cachedFetch(CACHE_KEYS.plans, fetchAllPlans, opts);
}

export function getOrders(opts: Opts = {}) {
  return cachedFetch(CACHE_KEYS.orders, fetchAllOrdersForAdmin, opts);
}

export function getRoleCounts(opts: Opts = {}) {
  return cachedFetch(CACHE_KEYS.roleCounts, fetchUserRoleCounts, opts);
}

/** Call after any admin write that changes the users collection. */
export function invalidateUsers() {
  invalidateCache(CACHE_KEYS.users);
  invalidateCache(CACHE_KEYS.roleCounts);
}

/** Call after any admin write that changes the products collection. */
export function invalidateProducts() {
  invalidateCache(CACHE_KEYS.products);
}

/** Call after any admin write that changes subscriptions. */
export function invalidateSubscriptions() {
  invalidateCache(CACHE_KEYS.subscriptions);
}

/** Newest cache timestamp across a set of datasets — drives the "Updated …" label. */
export function newestAge(...keys: string[]): number | null {
  const ages = keys.map(cacheAge).filter((a): a is number => a !== null);
  return ages.length ? Math.max(...ages) : null;
}
