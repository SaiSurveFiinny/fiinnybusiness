import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  collection,
  doc,
  getCount,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../../lib/firebase-client-server";
import { sharePhone } from "../../lib/share-links";
import { buildProductSlug, isListable } from "../../lib/seo/products-server";
import BrandView from "../../views/BrandView";
import type {
  ManufacturerBrandData,
  BrandProductSummary,
  BrandPageCustomization,
} from "../../dashboard/_lib/brand-page-types";
import { assembleBrandData } from "../../dashboard/_lib/brand-page-types";
import {
  buildRatingAgg,
  mapMarketplaceDoc,
  mergeMarketplaceProducts,
} from "../../lib/marketplace-merge";
import type { MarketplaceProduct } from "../../../types/product";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function resolveSlugToPhone(slug: string): Promise<string | null> {
  const db = getClientDb();
  // A shared brand link (app/lib/share-links.ts) carries the phone instead of
  // the slug: /brand/+919876543210. The page itself redirects it to the slug.
  const phone = sharePhone(decodeURIComponent(slug));
  if (phone) {
    const snap = await getDoc(doc(db, "manufacturers", phone));
    return snap.exists() ? phone : null;
  }
  const snap = await getDocs(
    query(collection(db, "manufacturers"), where("slug", "==", slug), limit(1)),
  );
  if (snap.empty) return null;
  return snap.docs[0].id;
}

// Firestore `in` supports up to 30 values per query — chunk review lookups to it.
const REVIEW_IN_CHUNK = 30;

/**
 * Ratings for exactly the given product doc ids, via bounded chunked `in`
 * queries. Mirrors /api/marketplace/products — never a full productReviews read.
 */
async function fetchRatingAggForCatalogIds(
  db: ReturnType<typeof getClientDb>,
  ids: string[],
) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += REVIEW_IN_CHUNK) {
    const chunk = ids.slice(i, i + REVIEW_IN_CHUNK);
    if (chunk.length > 0) chunks.push(chunk);
  }
  // Fire all `in`-chunk queries in parallel instead of serially — a brand with
  // hundreds of seller copies otherwise pays one round-trip per 30 ids in turn.
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(
        query(collection(db, "productReviews"), where("catalogId", "in", chunk)),
      ).catch(() => null),
    ),
  );
  const rows: { catalogId: string; rating: number }[] = [];
  for (const snap of snaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      const r = d.data() as Record<string, unknown>;
      rows.push({
        catalogId: String(r.catalogId ?? ""),
        rating: Number(r.rating ?? 0),
      });
    }
  }
  return buildRatingAgg(rows);
}

async function fetchPageData(manufacturerPhone: string): Promise<{
  brand: ManufacturerBrandData;
  products: BrandProductSummary[];
  marketProducts: MarketplaceProduct[];
  retailerCount: number;
} | null> {
  const db = getClientDb();

  // ── Perf instrumentation ───────────────────────────────────────────────────
  // Per-stage wall-clock timings + approximate doc-read counts, logged once as a
  // single [BrandPagePerf] line. Safe to remove once latency is settled.
  const _perf: Record<string, number> = {};
  let _mark = performance.now();
  const _stage = (name: string) => {
    _perf[name] = +(performance.now() - _mark).toFixed(1);
    _mark = performance.now();
  };
  let _reads = 0;

  // Retailer network is NOT fetched here — it is not on the purchase path and
  // rendering hundreds of map markers + cards was the brand page's dominant
  // cost. Only the count is read (for the hero stat + whether to offer the
  // "Where to Find Us" panel); the list loads on demand via
  // GET /api/brand/retailers. See app/lib/brand-retailers.ts.
  const [mfrSnap, retailerCountSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", manufacturerPhone)),
    getCount(
      query(collection(db, "manufacturers", manufacturerPhone, "retailers")),
    ).catch(() => null),
  ]);
  const retailerCount = retailerCountSnap?.data().count ?? 0;
  _reads += 1;
  _stage("profile+count");

  if (!mfrSnap.exists()) return null;

  const mfrData = mfrSnap.data() as Record<string, unknown>;
  const uid = String(mfrData.uid ?? mfrData.manufacturerId ?? "");

  // Brand page may be stored under phone (canonical) or uid (when manufacturer dashboard saved
  // before uidIndex was created for the account). Try phone first, then uid as fallback.
  let brandSnap = await getDoc(doc(db, "brandPages", manufacturerPhone));
  _reads += 1;
  if (!brandSnap.exists() && uid && uid !== manufacturerPhone) {
    brandSnap = await getDoc(doc(db, "brandPages", uid));
    _reads += 1;
  }
  _stage("brandPages");

  const customization = brandSnap.exists()
    ? (brandSnap.data() as Partial<BrandPageCustomization>)
    : null;

  const brand = assembleBrandData(manufacturerPhone, mfrData, customization);

  // ── Products: manufacturer-owned catalog only ──────────────────────────────
  // Run two queries in parallel to cover both field schemas:
  //   - new schema: manufacturerId == uid (set on products created via the new dashboard)
  //   - legacy schema: ownerId == uid + ownerType == "manufacturer" (older products)
  // Deduplicate by document ID, then exclude retailer-assigned copies.
  let products: BrandProductSummary[] = [];
  // Cross-seller pricing (discount / sellMode / lowest price) for this brand's
  // products. Previously BrandView fetched the ENTIRE products + productReviews
  // collections on the client (fetchMarketplaceProducts) just to recover this.
  // We now run the SAME merge pipeline the Market feed uses, but bounded to this
  // manufacturer's own docs — which already include the seller copies, because
  // every assigned copy stamps manufacturerId with the manufacturer's uid.
  let marketProducts: MarketplaceProduct[] = [];
  if (uid) {
    const [byManufacturerId, byOwnerId] = await Promise.all([
      getDocs(
        query(
          collection(db, "products"),
          where("manufacturerId", "==", uid),
          where("isActive", "==", true),
        ),
      ),
      getDocs(
        query(
          collection(db, "products"),
          where("ownerId", "==", uid),
          where("ownerType", "==", "manufacturer"),
        ),
      ),
    ]);

    _reads += byManufacturerId.docs.length + byOwnerId.docs.length;
    _perf["product.docsFetched"] = byManufacturerId.docs.length + byOwnerId.docs.length;

    // Dedup every fetched doc by id — canonical manufacturer products AND their
    // seller copies (manufacturer_assigned etc. carry manufacturerId == uid, so
    // they come back from the first query). Both the card list and the merge are
    // derived from this one bounded read; no N+1, no second trip per product.
    const docsById = new Map<string, Record<string, unknown>>();
    for (const d of [...byManufacturerId.docs, ...byOwnerId.docs]) {
      if (!docsById.has(d.id)) docsById.set(d.id, d.data() as Record<string, unknown>);
    }

    products = Array.from(docsById.entries())
      // isListable() is the same predicate /products/[slug] and the sitemap use,
      // so every card below links to a page that actually renders. It also
      // excludes per-seller copies, keeping the grid to canonical products.
      .filter(([, r]) => isListable(r))
      .map(([id, r]) => ({
        id,
        name: String(r.name ?? ""),
        category: String(r.category ?? ""),
        price: Number(r.price ?? 0),
        image: String(r.image ?? ""),
      }));

    // Merge canonical products + seller copies into marketplace cards (same
    // dedup-by-name logic the Market grid renders from). Ratings come from a
    // bounded `in` query over exactly these doc ids, never a full collection read.
    const activeEntries = Array.from(docsById.entries()).filter(
      ([, r]) => r.isActive !== false,
    );
    const ratingAgg = await fetchRatingAggForCatalogIds(
      db,
      activeEntries.map(([id]) => id),
    );
    // Rating path runs sequential `in`-chunks of 30 over every active id (incl.
    // seller copies) — record how many round-trips that is.
    _perf["rating.activeIds"] = activeEntries.length;
    _perf["rating.inChunks"] = Math.ceil(activeEntries.length / REVIEW_IN_CHUNK);
    const mapped = activeEntries.map(([id, r]) => mapMarketplaceDoc(id, r));
    marketProducts = mergeMarketplaceProducts(mapped, ratingAgg);
  }
  _stage("products+ratings");

  // One structured line per request. Grep server logs for [BrandPagePerf].
  // Only ms-valued keys are summed for totalMs (count metrics live alongside).
  const _msKeys = ["profile+count", "brandPages", "products+ratings"];
  console.log(
    "[BrandPagePerf]",
    JSON.stringify({
      phone: manufacturerPhone,
      retailerCount,
      productDocsFetched: _perf["product.docsFetched"] ?? 0,
      totalReads: _reads,
      stagesMs: _perf,
      totalMs: +_msKeys.reduce((a, k) => a + (_perf[k] ?? 0), 0).toFixed(1),
    }),
  );

  return { brand, products, marketProducts, retailerCount };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const phone = await resolveSlugToPhone(slug);
  if (!phone) return { title: "Brand Not Found" };

  const db = getClientDb();
  const [snap, brandSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", phone)),
    getDoc(doc(db, "brandPages", phone)),
  ]);

  if (!snap.exists()) return { title: "Brand Not Found" };

  const d = snap.data() as Record<string, unknown>;
  const name = String(d.businessName ?? d.ownerName ?? "Brand");
  const tagline = brandSnap.exists() ? String(brandSnap.data()?.tagline ?? "") : "";

  // Bare name — the "%s | KrishiDukan" template in app/layout.tsx appends the
  // brand. shareTitle carries it explicitly for openGraph/twitter, which the
  // template does not apply to.
  const brandTitle = name;
  const shareTitle = `${name} | KrishiDukan`;
  const brandDescription =
    tagline ||
    `${name} — verified manufacturer on KrishiDukan. View products and find nearby stores.`;
  return {
    title: brandTitle,
    description: brandDescription,
    alternates: { canonical: `${SITE_URL}/brand/${slug}` },
    openGraph: {
      title: shareTitle,
      description: tagline || `${name} — verified manufacturer on KrishiDukan.`,
      images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: brandDescription,
      images: ["/images/og-default.png"],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BrandPage({ params }: PageProps) {
  const { slug } = await params;
  const phone = await resolveSlugToPhone(slug);
  if (!phone) notFound();

  const data = await fetchPageData(phone);
  if (!data) notFound();

  // Shared link by phone: show the brand at its usual address when it has one.
  if (sharePhone(decodeURIComponent(slug)) && data.brand.slug && data.brand.slug !== slug) {
    redirect(`/brand/${encodeURIComponent(data.brand.slug)}`);
  }

  return (
    <main>
      {/* Server-rendered product links — crawlable by Google, hidden visually.
          BrandView renders the interactive product grid for users. */}
      {data.products.length > 0 && (
        <nav aria-label="Brand products" className="sr-only">
          <ul>
            {data.products.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${buildProductSlug(p.name, p.id)}`}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <BrandView
        brand={data.brand}
        products={data.products}
        marketProducts={data.marketProducts}
        retailerCount={data.retailerCount}
      />
    </main>
  );
}
