import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { krishiDb } from './krishiFirebaseClient';
import type { GeoPoint, ManufacturerNetworkInfo, RetailAddress, RetailerNetworkEntry } from '../types';

/**
 * Read-only data access for the KrishiDukan retailer network — traced from
 * KrishiDukan-v2's app/brand/[slug]/page.tsx. Two base reads are performed:
 * (1) resolve the manufacturer doc by slug, (2) list its retailer mirror
 * subcollection. Both collections are public-read by KrishiDukan's own
 * firestore.rules (`manufacturers`: allow read: if true;
 * `manufacturers/{m}/retailers`: allow list: if true). No other
 * collections (products, brandPages, manufacturerRetailers junction,
 * reviews, etc.) are touched — this module deliberately reads the minimum
 * needed for a map + list display and nothing else.
 *
 * Some mirror docs under `manufacturers/{id}/retailers` were never written
 * with `geo`/`address` (confirmed live: e.g. "Dongre Patil Agro" and
 * "KaranArjun Krushi Seva Kendra Nandgaon" have neither field on their
 * mirror doc). The coordinates DO exist elsewhere in KrishiDukan though —
 * on the canonical `retailers/{phone}` doc, or on `profiles/{phone}` for
 * doc IDs that turn out to belong to a manufacturer-role profile instead.
 * `enrichMissingLocation()` below performs the same two-step fallback
 * KrishiDukan's own brand page does (page.tsx's retailer enrichment logic)
 * so a genuinely-missing mirror field doesn't surface as "no location"
 * when the location is actually on record. `getDoc()` on these two
 * collections is a single-document read (not a list), and KrishiDukan's
 * rules already allow public `read` on both `retailers/{id}` and
 * `profiles/{id}` (see firestore.rules), so no additional access is
 * required beyond what this integration already has.
 */

const KARAN_ARJUN_SLUG = 'karan-arjun-pvt-ltd-2751';

function toGeoPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { latitude?: unknown; longitude?: unknown };
  if (typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number') {
    return { latitude: candidate.latitude, longitude: candidate.longitude };
  }
  return null;
}

function toAddress(value: unknown): RetailAddress {
  if (!value || typeof value !== 'object') return { line1: '', city: '', state: '' };
  const candidate = value as Record<string, unknown>;
  return {
    line1: String(candidate.line1 ?? ''),
    city: String(candidate.city ?? ''),
    state: String(candidate.state ?? ''),
  };
}

/** Resolves the Karan Arjun manufacturer doc (ID + display fields) by its known brand-page slug. */
export async function fetchManufacturerBySlug(slug: string = KARAN_ARJUN_SLUG): Promise<ManufacturerNetworkInfo | null> {
  const manufacturersQuery = query(collection(krishiDb, 'manufacturers'), where('slug', '==', slug), limit(1));
  const snapshot = await getDocs(manufacturersQuery);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  return {
    id: docSnap.id,
    businessName: String(data.businessName ?? 'Karan Arjun Pvt. Ltd.'),
    address: toAddress(data.address),
    geo: toGeoPoint(data.geo),
  };
}

/**
 * Fills in `geo`/`address` for a single retailer when its mirror doc lacks
 * them, by trying the canonical `retailers/{id}` doc and then `profiles/{id}`
 * — the exact two-step fallback KrishiDukan's own brand page performs
 * (traced from app/brand/[slug]/page.tsx). Only called for entries that are
 * actually missing data, so retailers whose mirror already has geo/address
 * (the common case) never trigger an extra read.
 */
async function enrichMissingLocation(
  retailerId: string,
  geo: GeoPoint | null,
  address: RetailAddress,
): Promise<{ geo: GeoPoint | null; address: RetailAddress }> {
  if (geo && address.city) return { geo, address };

  // Best-effort only: if either fallback read fails for any reason (e.g. a
  // future rules change on KrishiDukan's side, transient network error),
  // this retailer simply falls back to whatever it already had (possibly
  // "Location unavailable") rather than throwing — a single retailer's
  // enrichment failing must never take down the other 24 in the same
  // Promise.all batch (see fetchManufacturerRetailers below).
  try {
    const retailerDoc = await getDoc(doc(krishiDb, 'retailers', retailerId));
    if (retailerDoc.exists()) {
      const data = retailerDoc.data();
      const fallbackGeo = geo ?? toGeoPoint(data.geo);
      const fallbackAddress = address.city ? address : toAddress(data.address);
      if (fallbackGeo || fallbackAddress.city) return { geo: fallbackGeo, address: fallbackAddress };
    }

    const profileDoc = await getDoc(doc(krishiDb, 'profiles', retailerId));
    if (profileDoc.exists()) {
      const data = profileDoc.data();
      return { geo: geo ?? toGeoPoint(data.geo), address: address.city ? address : toAddress(data.address) };
    }
  } catch {
    // Swallow — see comment above.
  }

  return { geo, address };
}

/**
 * Lists a manufacturer's active retailers via the public subcollection
 * mirror (`manufacturers/{id}/retailers`). Matches the exact read shape
 * KrishiDukan's own rules require: a collection-level list operation
 * (allowed unauthenticated) rather than per-document getDoc() calls (which
 * KrishiDukan's rules restrict to the manufacturer/retailer themselves).
 * Client-side filtering excludes revoked/removed/inactive entries, mirroring
 * app/brand/[slug]/page.tsx's own filter. Entries whose mirror doc lacks
 * geo/address are enriched from `retailers/{id}`/`profiles/{id}` — see
 * enrichMissingLocation() above.
 */
export async function fetchManufacturerRetailers(manufacturerId: string): Promise<RetailerNetworkEntry[]> {
  const retailersSnapshot = await getDocs(collection(krishiDb, 'manufacturers', manufacturerId, 'retailers'));

  const filtered = retailersSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((entry) => {
      const status = String((entry as Record<string, unknown>).status ?? 'invited');
      const onboardingStatus = String((entry as Record<string, unknown>).onboardingStatus ?? 'active');
      return status !== 'revoked' && onboardingStatus !== 'removed' && onboardingStatus !== 'inactive';
    });

  return Promise.all(
    filtered.map(async (entry): Promise<RetailerNetworkEntry> => {
      const data = entry as Record<string, unknown>;
      const { geo, address } = await enrichMissingLocation(entry.id, toGeoPoint(data.geo), toAddress(data.address));
      return {
        id: entry.id,
        selectionKey: `retailer:${entry.id}`,
        shopName: String(data.shopName ?? 'Retail Partner'),
        ownerName: String(data.ownerName ?? ''),
        address,
        geo,
        logo: data.logo ? String(data.logo) : undefined,
      };
    }),
  );
}
