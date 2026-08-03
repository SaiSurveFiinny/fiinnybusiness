import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

export type SearchAppearanceStats = {
  impressions: string;
  ctr: string;
  avgPosition: string;
};

export type SeriesPoint = { label: string; value: number };

export type OrderAnalytics = {
  totalOrders: number;
  totalRevenue: number;
  revenueOverTime: SeriesPoint[];
  ordersOverTime: SeriesPoint[];
  statusCounts: Record<string, number>;
  topProducts: { name: string; quantity: number; revenue: number }[];
};

export type RetailerAnalytics = {
  totalImpressions: number;
  totalClicks: number;
  productCount: number;
  searchAppearance: SearchAppearanceStats;
  viewsOverTime: SeriesPoint[];
  callsOverTime: SeriesPoint[];
  directionRequests: SeriesPoint[];
  orders: OrderAnalytics;
  /** False when every query came back empty — drives the honest empty state. */
  hasAnyData: boolean;
};

type DaySeries = { key: string; label: string };

function getLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLast7Days(): DaySeries[] {
  const today = new Date();
  const days: DaySeries[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({
      key: getLocalDayKey(d),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return days;
}

/**
 * Seller analytics, aggregated from the two collections that actually hold
 * data for a seller:
 *
 * - `products` — matched via the same dual-schema owner fields the (working)
 *   inventory reads use: ownerId/retailerId hold auth UIDs, ownerPhone/
 *   retailerPhone/retailerDocId hold phone keys. The old version queried
 *   sellerId/sellerPhone/shopOwnerId, which exist on no product doc, so it
 *   found nothing. Engagement counters (impressions/clicks/…ByDay) live on
 *   these docs, written by the track* helpers in app/firebase.ts.
 * - `orders` — sellerId and sellerPhone both store the seller's phone
 *   (order_repository.dart writes sellerId as phone for legacy compat).
 *
 * The phantom `store_analytics` collection (never written, no security rule,
 * every read permission-denied) has been removed.
 */
export async function fetchRetailerAnalytics(
  retailerId: string | null,
  profile?: any,
): Promise<RetailerAnalytics> {
  const days = getLast7Days();
  const dayKeys = new Set(days.map((d) => d.key));

  // ── Candidate identifiers ────────────────────────────────────────────────
  const uidCandidates = new Set<string>();
  if (retailerId) uidCandidates.add(retailerId);
  if (profile?.uid) uidCandidates.add(profile.uid);
  if (profile?.id) uidCandidates.add(profile.id);

  const phoneCandidates = new Set<string>();
  const rawPhone = String(profile?.phone ?? "").trim();
  if (rawPhone) {
    phoneCandidates.add(rawPhone);
    const stripped = rawPhone.replace("+91", "").trim();
    if (stripped) phoneCandidates.add(stripped);
    if (!rawPhone.startsWith("+")) phoneCandidates.add(`+91${rawPhone}`);
  }
  // Some accounts are keyed by phone in uid-shaped fields and vice versa —
  // querying a field with a wrong-shaped value just returns empty, never errors.
  const allCandidates = Array.from(
    new Set([...Array.from(uidCandidates), ...Array.from(phoneCandidates)]),
  );

  const errors: unknown[] = [];

  // ── Products: engagement counters ────────────────────────────────────────
  const viewsByDay: Record<string, number> = {};
  const callsByDay: Record<string, number> = {};
  const directionsByDay: Record<string, number> = {};
  days.forEach((d) => {
    viewsByDay[d.key] = 0;
    callsByDay[d.key] = 0;
    directionsByDay[d.key] = 0;
  });

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPositionSum = 0;

  const productFields = [
    "ownerId",
    "ownerPhone",
    "retailerId",
    "retailerPhone",
    "retailerDocId",
  ];
  const productSnaps = await Promise.all(
    productFields.flatMap((field) =>
      allCandidates.map((idVal) =>
        getDocs(query(collection(db, "products"), where(field, "==", idVal))).catch(
          (err) => {
            errors.push(err);
            console.error(`[analytics] products ${field}==${idVal} failed:`, err);
            return null;
          },
        ),
      ),
    ),
  );

  const seenProductIds = new Set<string>();
  for (const snap of productSnaps) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (seenProductIds.has(doc.id)) continue; // dedupe across field/id combos
      seenProductIds.add(doc.id);
      const data = doc.data();
      totalImpressions += Number(data.impressions || 0);
      totalClicks += Number(data.clicks || 0);
      totalPositionSum += Number(data.positionSum || 0);

      const impressionsDay = (data.impressionsByDay ?? {}) as Record<string, unknown>;
      const callsDay = (data.callsByDay ?? {}) as Record<string, unknown>;
      const directionsDay = (data.directionRequestsByDay ?? {}) as Record<string, unknown>;
      days.forEach((day) => {
        viewsByDay[day.key] += Number(impressionsDay[day.key] || 0);
        callsByDay[day.key] += Number(callsDay[day.key] || 0);
        directionsByDay[day.key] += Number(directionsDay[day.key] || 0);
      });
    }
  }

  // ── Orders: revenue and volume ───────────────────────────────────────────
  const revenueByDay: Record<string, number> = {};
  const ordersByDay: Record<string, number> = {};
  days.forEach((d) => {
    revenueByDay[d.key] = 0;
    ordersByDay[d.key] = 0;
  });

  const orderSnaps = await Promise.all(
    ["sellerPhone", "sellerId"].flatMap((field) =>
      Array.from(phoneCandidates).map((idVal) =>
        getDocs(query(collection(db, "orders"), where(field, "==", idVal))).catch(
          (err) => {
            errors.push(err);
            console.error(`[analytics] orders ${field}==${idVal} failed:`, err);
            return null;
          },
        ),
      ),
    ),
  );

  let totalOrders = 0;
  let totalRevenue = 0;
  const statusCounts: Record<string, number> = {};
  const productAgg = new Map<string, { name: string; quantity: number; revenue: number }>();
  const seenOrderIds = new Set<string>();

  for (const snap of orderSnaps) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (seenOrderIds.has(doc.id)) continue;
      seenOrderIds.add(doc.id);
      const data = doc.data();
      const status = String(data.status ?? "unknown");
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      totalOrders += 1;

      const cancelled = status === "cancelled" || status === "rejected";
      const total = Number(data.total ?? 0);
      if (!cancelled) totalRevenue += total;

      const createdAt = data.createdAt as Timestamp | undefined;
      const dayKey = createdAt?.toDate ? getLocalDayKey(createdAt.toDate()) : null;
      if (dayKey && dayKeys.has(dayKey)) {
        ordersByDay[dayKey] += 1;
        if (!cancelled) revenueByDay[dayKey] += total;
      }

      if (!cancelled && Array.isArray(data.items)) {
        for (const item of data.items) {
          const name = String(item?.name ?? "Unknown product");
          const qty = Number(item?.quantity ?? 0);
          const lineRevenue = Number(item?.price ?? 0) * qty;
          const agg = productAgg.get(name) ?? { name, quantity: 0, revenue: 0 };
          agg.quantity += qty;
          agg.revenue += lineRevenue;
          productAgg.set(name, agg);
        }
      }
    }
  }

  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Surface a real failure instead of silently rendering zeros — but only
  // when *nothing* succeeded; partial data is still worth showing.
  const everythingFailed =
    errors.length > 0 &&
    productSnaps.every((s) => s === null) &&
    orderSnaps.every((s) => s === null);
  if (everythingFailed) {
    throw errors[0];
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgPosition = totalImpressions > 0 ? totalPositionSum / totalImpressions : 0;
  const impressionsFormatted =
    totalImpressions >= 1000
      ? (totalImpressions / 1000).toFixed(1) + "k"
      : totalImpressions.toString();

  return {
    totalImpressions,
    totalClicks,
    productCount: seenProductIds.size,
    searchAppearance: {
      impressions: impressionsFormatted,
      ctr: ctr.toFixed(1) + "%",
      avgPosition: avgPosition > 0 ? avgPosition.toFixed(1) : "—",
    },
    viewsOverTime: days.map((day) => ({ label: day.label, value: viewsByDay[day.key] || 0 })),
    callsOverTime: days.map((day) => ({ label: day.label, value: callsByDay[day.key] || 0 })),
    directionRequests: days.map((day) => ({ label: day.label, value: directionsByDay[day.key] || 0 })),
    orders: {
      totalOrders,
      totalRevenue,
      revenueOverTime: days.map((day) => ({ label: day.label, value: revenueByDay[day.key] || 0 })),
      ordersOverTime: days.map((day) => ({ label: day.label, value: ordersByDay[day.key] || 0 })),
      statusCounts,
      topProducts,
    },
    hasAnyData: totalOrders > 0 || totalImpressions > 0 || totalClicks > 0,
  };
}
