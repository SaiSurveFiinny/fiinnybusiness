import type { MetadataRoute } from "next";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore/lite";
import { getClientDb } from "./lib/firebase-client-server";
import { SEO_CATEGORIES } from "./lib/seo/category-meta";
import {
  getAllListableProductsForSitemap,
  buildProductSlug,
} from "./lib/seo/products-server";
import { getReelsForSitemap, buildReelSlug } from "./lib/seo/reels-server";
import {
  getAllStores,
  getStoreGeography,
  buildStoreSlug,
  slugifyGeo,
} from "./lib/seo/stores-server";
import { HELP_SECTIONS } from "./views/helpContent";

// Canonical public origin (kept in sync with app/layout.tsx and app/robots.ts).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

// Regenerate the sitemap at most once per hour (ISR).
export const revalidate = 3600;

// Firestore Timestamp | Date | string → Date, with a safe fallback to now.
function toDate(value: unknown): Date {
  try {
    const d = (value as { toDate?: () => Date })?.toDate?.();
    if (d instanceof Date && !isNaN(d.getTime())) return d;
    if (value) {
      const parsed = new Date(value as string);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    /* ignore */
  }
  return new Date();
}

// ─── Static public entries ──────────────────────────────────────────────────
// Only SSR routes that return real HTML content to crawlers are listed here.
// The SPA's ?view=* query-param URLs (market, hub, map, about, help) are
// intentionally excluded — they are client-rendered and deliver an empty page
// to search engines, wasting crawl budget and degrading sitemap quality.
function staticEntries(now: Date): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/sell`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/stores`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    // The 21 documentation sections. Same content the SPA has always rendered at
    // /?view=help — which is the homepage shell to a crawler and canonicalises to
    // "/", so none of it could be indexed until these routes existed.
    ...HELP_SECTIONS.map((s) => ({
      url: `${SITE_URL}/help/${s.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/app`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}

// ─── Category entries ───────────────────────────────────────────────────────
function categoryEntries(now: Date): MetadataRoute.Sitemap {
  // Canonical SSR category landing pages (/category/[slug]).
  // NOTE: The legacy `/?view=market&category=…` entries were removed — the raw
  // `&` they contained broke XML validation (EntityRef: expecting ';'), and they
  // merely duplicated these canonical, query-param-free category routes.
  return SEO_CATEGORIES.map((c) => ({
    url: `${SITE_URL}/category/${c.slug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.9,
  }));
}

// ─── Product entries (dynamic, safe-fallback) ───────────────────────────────
async function productEntries(): Promise<MetadataRoute.Sitemap> {
  const products = await getAllListableProductsForSitemap();
  return products.map((p) => ({
    url: `${SITE_URL}/products/${buildProductSlug(p.name, p.id)}`,
    lastModified: toDate(p.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
}

// ─── Brand entries (dynamic, safe-fallback) ─────────────────────────────────
async function brandEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(collection(db, "manufacturers"), where("slug", "!=", ""), limit(2000)),
    );
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const slug = typeof data.slug === "string" ? data.slug.trim() : "";
        if (!slug) return null;
        return {
          url: `${SITE_URL}/brand/${slug}`,
          lastModified: toDate(data.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  } catch (err) {
    console.warn("[sitemap] brand entries unavailable:", err);
    return [];
  }
}

// ─── Reel entries (dynamic, safe-fallback) ──────────────────────────────────
async function reelEntries(): Promise<MetadataRoute.Sitemap> {
  const reels = await getReelsForSitemap();
  return reels.map((r) => ({
    url: `${SITE_URL}/reels/${buildReelSlug(r.title, r.id)}`,
    lastModified: r.createdAtMs ? new Date(r.createdAtMs) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}

// ─── Store entries (dynamic, safe-fallback) ─────────────────────────────────
// State → city → store, built only from sellers that have a real city and state
// on file (see the hard constraint in stores-server.getAllStores). Cities with
// no store never get a URL, so this cannot emit doorway pages.
async function storeEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const [geo, stores] = await Promise.all([getStoreGeography(), getAllStores()]);

    const stateUrls = geo.map((s) => ({
      url: `${SITE_URL}/stores/${s.stateSlug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const cityUrls = geo.flatMap((s) =>
      s.cities.map((c) => ({
        url: `${SITE_URL}/stores/${c.stateSlug}/${c.citySlug}`,
        lastModified: now,
        // The "<product> dealer in <city>" target — highest-intent local query.
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    );

    const storeUrls = stores.map((s) => ({
      url: `${SITE_URL}/stores/${slugifyGeo(s.state)}/${slugifyGeo(
        s.city,
      )}/${buildStoreSlug(s.name, s.id)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...stateUrls, ...cityUrls, ...storeUrls];
  } catch (err) {
    console.warn("[sitemap] store entries unavailable:", err);
    return [];
  }
}

// ─── Blog entries (dynamic, safe-fallback) ──────────────────────────────────
async function blogEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(
        collection(db, "blogPosts"),
        where("status", "==", "published"),
        limit(5000),
      ),
    );
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const slug = typeof data.slug === "string" ? data.slug.trim() : "";
        if (!slug) return null;
        return {
          url: `${SITE_URL}/blog/${encodeURIComponent(slug)}`,
          lastModified: toDate(data.updatedAt ?? data.publishedAt),
          changeFrequency: "monthly" as const,
          priority: 0.6,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  } catch (err) {
    console.warn("[sitemap] blog entries unavailable:", err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Dynamic sections fetched in parallel; each resolves to [] on failure so the
  // sitemap always renders the static + category baseline.
  const [brands, posts, products, reels, storeUrls] = await Promise.all([
    brandEntries(),
    blogEntries(),
    productEntries(),
    reelEntries(),
    storeEntries(now),
  ]);

  return [
    { url: `${SITE_URL}/reels`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 },
    ...staticEntries(now),
    ...categoryEntries(now),
    ...storeUrls,
    ...products,
    ...reels,
    ...brands,
    ...posts,
  ];
}
