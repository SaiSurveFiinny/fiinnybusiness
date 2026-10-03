import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../../lib/firebase-client-server";
import { buildProductSlug, isListable } from "../../lib/seo/products-server";
import BrandView from "../../views/BrandView";
import type {
  ManufacturerBrandData,
  BrandProductSummary,
  BrandRetailerSummary,
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
  const rows: { catalogId: string; rating: number }[] = [];
  for (let i = 0; i < ids.length; i += REVIEW_IN_CHUNK) {
    const chunk = ids.slice(i, i + REVIEW_IN_CHUNK);
    if (chunk.length === 0) continue;
    const snap = await getDocs(
      query(collection(db, "productReviews"), where("catalogId", "in", chunk)),
    ).catch(() => null);
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
  retailers: BrandRetailerSummary[];
} | null> {
  const db = getClientDb();

  const [mfrSnap, retailerDocsSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", manufacturerPhone)),
    // Fetch ALL linked retailer mirror docs — no limit, subcollection is scoped to one manufacturer.
    getDocs(collection(db, "manufacturers", manufacturerPhone, "retailers")),
  ]);

  if (!mfrSnap.exists()) return null;

  const mfrData = mfrSnap.data() as Record<string, unknown>;
  const uid = String(mfrData.uid ?? mfrData.manufacturerId ?? "");

  // Brand page may be stored under phone (canonical) or uid (when manufacturer dashboard saved
  // before uidIndex was created for the account). Try phone first, then uid as fallback.
  let brandSnap = await getDoc(doc(db, "brandPages", manufacturerPhone));
  if (!brandSnap.exists() && uid && uid !== manufacturerPhone) {
    brandSnap = await getDoc(doc(db, "brandPages", uid));
  }

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
    const mapped = activeEntries.map(([id, r]) => mapMarketplaceDoc(id, r));
    marketProducts = mergeMarketplaceProducts(mapped, ratingAgg);
  }

  // ── Retailers: build summaries, enriching from retailers/{docId} when mirror lacks geo ──
  function parseGeo(g: unknown): { latitude: number; longitude: number } | null {
    if (!g || typeof g !== "object") return null;
    const { latitude, longitude } = g as { latitude?: number; longitude?: number };
    return typeof latitude === "number" && typeof longitude === "number"
      ? { latitude, longitude }
      : null;
  }

  // Match Retailer Network dashboard logic: exclude only explicitly revoked/removed/inactive
  // entries. "invited" retailers (pending claim) are visible — they appear in the dashboard too.
  const activeMirrors = retailerDocsSnap.docs.filter((d) => {
    const r = d.data() as Record<string, unknown>;
    const status = String(r.status ?? "invited");
    const onboarding = String(r.onboardingStatus ?? "active");
    return (
      status !== "revoked" &&
      onboarding !== "removed" &&
      onboarding !== "inactive"
    );
  });

  // Debug: log mirror counts server-side so mismatches are visible in server logs.
  console.log(
    `[BrandPage] ${manufacturerPhone} — subcollection docs: ${retailerDocsSnap.docs.length}, ` +
    `after filter: ${activeMirrors.length}`,
  );

  // For each mirror, fetch the full retailers/{docId} profile in parallel to get geo/address.
  // retailerDocId field in the mirror points to the correct doc in the retailers collection.
  // Process all filtered mirrors — no cap, subcollection is fetched in full.
  const retailers: BrandRetailerSummary[] = await Promise.all(
    activeMirrors.map(async (d) => {
      const r = d.data() as Record<string, unknown>;
      const mirrorAddr = (r.address ?? {}) as Record<string, unknown>;
      const mirrorGeo = parseGeo(r.geo);
      const shopName = String(r.shopName ?? r.ownerName ?? "");
      const ownerName = String(r.ownerName ?? "");

      const mirrorLogo = String(r.logo ?? "");

      // If mirror already has both geo and city, use it directly
      if (mirrorGeo && mirrorAddr.city) {
        return {
          phone: d.id,
          secondaryPhone: String(r.secondaryPhone ?? ""),
          shopName,
          ownerName,
          address: {
            city: String(mirrorAddr.city ?? ""),
            state: String(mirrorAddr.state ?? ""),
            line1: String(mirrorAddr.line1 ?? ""),
          },
          geo: mirrorGeo,
          logo: mirrorLogo || undefined,
        };
      }

      // Slow path: fetch the retailer's global profile to get address/geo.
      // Try retailers/{docId} first (may be stored as E164 "+91…" or bare 10-digit).
      // Fall back to profiles/{docId} which is always publicly readable.
      const retailerDocId = String(r.retailerDocId ?? d.id);
      // Derive the alternate phone format so we catch both stored forms.
      const altRetailerId = retailerDocId.startsWith("+91")
        ? retailerDocId.slice(3)
        : `+91${retailerDocId}`;

      const tryFetch = async (id: string) => {
        try {
          const snap = await getDoc(doc(db, "retailers", id));
          if (snap.exists()) return snap.data() as Record<string, unknown>;
        } catch { /* fall through */ }
        return null;
      };

      const tryProfileFetch = async (id: string) => {
        try {
          const snap = await getDoc(doc(db, "profiles", id));
          if (snap.exists()) return snap.data() as Record<string, unknown>;
        } catch { /* fall through */ }
        return null;
      };

      const rd =
        (await tryFetch(retailerDocId)) ??
        (retailerDocId !== altRetailerId ? await tryFetch(altRetailerId) : null) ??
        (await tryProfileFetch(retailerDocId)) ??
        (retailerDocId !== altRetailerId ? await tryProfileFetch(altRetailerId) : null);

      if (rd) {
        const rdAddr = (rd.address ?? {}) as Record<string, unknown>;
        return {
          phone: d.id,
          secondaryPhone: String(rd.secondaryPhone ?? r.secondaryPhone ?? ""),
          shopName: shopName || String(rd.shopName ?? rd.businessName ?? rd.ownerName ?? ""),
          ownerName: ownerName || String(rd.ownerName ?? ""),
          address: {
            city: String(rdAddr.city ?? rd.city ?? mirrorAddr.city ?? ""),
            state: String(rdAddr.state ?? rd.state ?? mirrorAddr.state ?? ""),
            line1: String(rdAddr.line1 ?? mirrorAddr.line1 ?? ""),
          },
          geo: parseGeo(rd.geo) ?? mirrorGeo,
          logo: String(rd.logo ?? "") || mirrorLogo || undefined,
        };
      }

      return {
        phone: d.id,
        secondaryPhone: String(r.secondaryPhone ?? ""),
        shopName,
        ownerName,
        address: {
          city: String(mirrorAddr.city ?? ""),
          state: String(mirrorAddr.state ?? ""),
          line1: String(mirrorAddr.line1 ?? ""),
        },
        geo: mirrorGeo,
        logo: mirrorLogo || undefined,
      };
    }),
  );

  return { brand, products, marketProducts, retailers };
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
        retailers={data.retailers}
      />
    </main>
  );
}
