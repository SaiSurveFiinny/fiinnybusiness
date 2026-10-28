/**
 * GET the eligible influencers a business (manufacturer / retailer) may browse
 * for collaboration, with KrishiDukan-configured prices attached.
 *
 * PRIVACY IS ENFORCED HERE, NOT IN THE UI
 * ---------------------------------------
 * influencerProfiles/{phone} is a public-read document whose id IS the owner's
 * phone number, and it carries the influencer's PRIVATE self-reported quotation
 * (`collaboration.charge`). Neither may reach a business. So the collaboration
 * page NEVER queries that collection directly — it calls this route, which runs
 * on the Admin SDK and returns a hand-picked, sanitised projection:
 *   • no phone (the doc id is replaced by an opaque, non-reversible id),
 *   • no email / private contact detail (none are stored, and none are added),
 *   • NO influencer-submitted charge — only the admin-set collaboration prices.
 *
 * ELIGIBILITY
 * -----------
 * An influencer is shown only when BOTH hold:
 *   1. they hold an ACTIVE, unexpired influencer subscription (the same
 *      authoritative `subscriptions` source influencer-access.ts trusts), and
 *   2. their profile is COMPLETE (name, category, state, ≥1 social presence) and
 *      active.
 *
 * ACCESS
 * ------
 * Caller must be an authenticated manufacturer, retailer (or admin). Any other
 * role is refused — a signed-in customer or influencer cannot pull this list.
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import {
  COLLABORATION_PRICING_DOC_PATH,
  DEFAULT_COLLABORATION_PRICING,
  headlineFollowers,
  parseCollaborationPricing,
  resolveCollaborationOffers,
} from "../../../lib/collaboration-pricing";

export const dynamic = "force-dynamic";

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** uid → (role, phone), resolving uid-keyed then uidIndex→phone-keyed user docs. */
async function loadCallerRole(uid: string): Promise<string | null> {
  const adminDb = getAdminDb();
  const [byUid, idx] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("uidIndex").doc(uid).get(),
  ]);
  if (byUid.exists) return (byUid.data()?.role as string) ?? null;
  const phone = idx.exists ? String(idx.data()?.phone ?? "") : "";
  if (phone) {
    const byPhone = await adminDb.collection("users").doc(phone).get();
    if (byPhone.exists) return (byPhone.data()?.role as string) ?? null;
  }
  return null;
}

/** Opaque, stable, non-reversible card id derived from the phone doc id. */
function opaqueId(phone: string): string {
  return createHash("sha256").update(`collab:${phone}`).digest("hex").slice(0, 16);
}

/** Phones of influencers holding an active, unexpired subscription. */
async function eligiblePhones(): Promise<Set<string>> {
  const adminDb = getAdminDb();
  const now = Date.now();
  const phones = new Set<string>();
  // Single equality filter (ownerType) — status & expiry filtered in code so no
  // composite index is required.
  const snap = await adminDb
    .collection("subscriptions")
    .where("ownerType", "==", "influencer")
    .get();
  for (const d of snap.docs) {
    const x = d.data() as Record<string, unknown>;
    if (x.subscriptionStatus !== "active") continue;
    const exp = x.expiryDate as { toMillis?: () => number } | undefined;
    const expMs = exp && typeof exp.toMillis === "function" ? exp.toMillis() : null;
    if (expMs == null || expMs <= now) continue;
    const phone = String(x.ownerPhone ?? "");
    if (phone) phones.add(phone);
  }
  return phones;
}

function isComplete(data: Record<string, unknown>): boolean {
  const displayName = String(data.displayName ?? "").trim();
  const contentCategory = String(data.contentCategory ?? "").trim();
  const loc = (data.location as Record<string, unknown>) ?? {};
  const state = String(loc.state ?? "").trim();
  const socials = (data.socials as Record<string, { url?: string }>) ?? {};
  const hasSocial = Object.values(socials).some((s) => s && typeof s.url === "string" && s.url.trim());
  return !!displayName && !!contentCategory && !!state && hasSocial && data.isActive !== false;
}

export async function GET(request: Request) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired authorization token." }, { status: 401 });
  }

  const role = await loadCallerRole(uid);
  if (role !== "manufacturer" && role !== "retailer" && role !== "admin") {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  try {
    const adminDb = getAdminDb();

    // Live collaboration pricing (fall back to defaults on missing/corrupt doc).
    const priceSnap = await adminDb
      .collection(COLLABORATION_PRICING_DOC_PATH.collection)
      .doc(COLLABORATION_PRICING_DOC_PATH.doc)
      .get();
    const pricing =
      (priceSnap.exists ? parseCollaborationPricing(priceSnap.data()) : null) ??
      DEFAULT_COLLABORATION_PRICING;

    const phones = await eligiblePhones();
    if (phones.size === 0) {
      return NextResponse.json({ influencers: [], pricing });
    }

    // Batch-read the eligible profiles.
    const refs = Array.from(phones, (p) =>
      adminDb.collection("influencerProfiles").doc(p),
    );
    const snaps = await adminDb.getAll(...refs);

    const influencers = snaps
      .filter((s) => s.exists)
      .map((s) => ({ phone: s.id, data: s.data() as Record<string, unknown> }))
      .filter(({ data }) => isComplete(data))
      .map(({ phone, data }) => {
        const rawSocials = (data.socials as Record<string, { url?: string; followers?: number }>) ?? {};
        // Platform → follower count ONLY (drop the public URL so future bookings
        // route through the platform, and never any contact detail).
        const socials: Record<string, { followers: number }> = {};
        for (const [k, v] of Object.entries(rawSocials)) {
          if (v && typeof v.url === "string" && v.url.trim()) {
            socials[k] = { followers: Number(v.followers) || 0 };
          }
        }
        const followers = headlineFollowers(rawSocials);
        const resolved = resolveCollaborationOffers(pricing, followers);
        const loc = (data.location as Record<string, unknown>) ?? {};
        return {
          id: opaqueId(phone),
          displayName: String(data.displayName ?? ""),
          photoUrl: (data.photoUrl as string | null) ?? null,
          bio: String(data.bio ?? ""),
          contentCategory: String(data.contentCategory ?? ""),
          languages: Array.isArray(data.languages) ? (data.languages as unknown[]).map(String) : [],
          location: {
            state: String(loc.state ?? ""),
            district: String(loc.district ?? ""),
            city: String(loc.city ?? ""),
            workingArea: String(loc.workingArea ?? ""),
          },
          socials,
          followers,
          selfReported: true as const,
          collaboration: {
            tierLabel: resolved.tier?.label ?? null,
            offers: resolved.offers,
            requiresCustomQuote: resolved.requiresCustomQuote,
          },
        };
      })
      .sort((a, b) => b.followers - a.followers);

    return NextResponse.json({ influencers, pricing });
  } catch (e) {
    console.error("[api/collaboration/influencers GET]", e);
    return NextResponse.json({ error: "Failed to load influencers." }, { status: 500 });
  }
}
