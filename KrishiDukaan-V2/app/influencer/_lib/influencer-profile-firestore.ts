import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

// ─── Influencer profile schema ──────────────────────────────────────────────
//
// Lives at influencerProfiles/{phone} where {phone} is the owner's normalized
// E.164 number — the SAME identity key as users/{phone} and profiles/{phone}
// (see the UID-vs-phone scheme). This keeps influencers consistent with the
// other phone-OTP roles (customer / retailer / manufacturer): the owner's
// Firestore rules resolve ownership through myPhone() == {phone}.
//
// Everything a creator self-reports (follower counts, collaboration charges)
// is stored verbatim and flagged `selfReported: true`. Nothing here is
// independently verified — do not render it as verified. No credentials or
// private auth data are stored in this doc; it is a public-facing profile.
//
// The shape is intentionally open-ended so later phases can add platforms,
// content categories, collaboration types, and analytics without a migration:
//   • `socials` is a map keyed by platform id, so a new platform is just a new
//     key — no schema change.
//   • `collaboration` is an object, so new collaboration types/fields slot in.

/** A single social presence. `url` is the public profile link; `followers`
 *  is the self-reported follower/subscriber count. */
export interface InfluencerSocial {
  url: string;
  /** Self-reported follower/subscriber count. Not verified. */
  followers: number;
}

/** Known platforms for Phase 1. `socials` is a map so more can be added later
 *  without changing this union — treat it as the current, not the exhaustive,
 *  set. */
export type InfluencerPlatform = "youtube" | "instagram" | "facebook";

export interface InfluencerCollaboration {
  /** Self-reported promotional / collaboration charge. null = not specified. */
  charge: number | null;
  /** ISO 4217 currency code. Defaults to INR. */
  currency: string;
}

export interface InfluencerLocation {
  state: string;
  district: string;
  city: string;
  /** Free-text working area / coverage region. */
  workingArea: string;
}

export interface InfluencerProfile {
  /** Normalized E.164 phone — equals the Firestore doc id. */
  phone: string;
  /** Linked Firebase Auth UID once the influencer has signed in, else null. */
  uid: string | null;
  /** Display / creator name shown publicly. */
  displayName: string;
  /** Profile photograph URL (Firebase Storage), or null. */
  photoUrl: string | null;
  /** Short bio / description. */
  bio: string;
  /** Primary content category / niche. */
  contentCategory: string;
  /** Languages used for content. */
  languages: string[];
  location: InfluencerLocation;
  /** Platform id → presence. Open-ended; see InfluencerPlatform. */
  socials: Partial<Record<InfluencerPlatform, InfluencerSocial>> & Record<string, InfluencerSocial>;
  collaboration: InfluencerCollaboration;
  isActive: boolean;
  /** Marks follower counts & charges as self-reported / unverified. */
  selfReported: true;
}

export const DEFAULT_CURRENCY = "INR";

export const CONTENT_CATEGORIES = [
  "Crop Farming",
  "Horticulture",
  "Livestock & Dairy",
  "Agri Machinery",
  "Agri Inputs (Seeds / Fertilizers / Pesticides)",
  "Organic Farming",
  "Agri Education & News",
  "Other",
] as const;

/** An empty, editable profile — used by the form before the first save. */
export function blankInfluencerProfile(phone: string, uid: string | null): InfluencerProfile {
  return {
    phone,
    uid,
    displayName: "",
    photoUrl: null,
    bio: "",
    contentCategory: "",
    languages: [],
    location: { state: "", district: "", city: "", workingArea: "" },
    socials: {},
    collaboration: { charge: null, currency: DEFAULT_CURRENCY },
    isActive: true,
    selfReported: true,
  };
}

/** Normalize a raw Firestore doc into InfluencerProfile, filling defaults so
 *  the editor never has to guard against missing fields. */
function fromDoc(phone: string, data: Record<string, unknown>): InfluencerProfile {
  const loc = (data.location as Partial<InfluencerLocation>) ?? {};
  const collab = (data.collaboration as Partial<InfluencerCollaboration>) ?? {};
  const rawSocials = (data.socials as Record<string, Partial<InfluencerSocial>>) ?? {};
  const socials: InfluencerProfile["socials"] = {};
  for (const [k, v] of Object.entries(rawSocials)) {
    if (!v || typeof v.url !== "string") continue;
    socials[k] = { url: v.url, followers: Number(v.followers) || 0 };
  }
  return {
    phone,
    uid: (data.uid as string | null) ?? null,
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
    collaboration: {
      charge: collab.charge == null ? null : Number(collab.charge),
      currency: String(collab.currency ?? DEFAULT_CURRENCY),
    },
    isActive: data.isActive !== false,
    selfReported: true,
  };
}

/** Load the influencer's own profile, or null if they haven't created it yet. */
export async function fetchInfluencerProfile(phone: string): Promise<InfluencerProfile | null> {
  const snap = await getDoc(doc(db, "influencerProfiles", phone));
  if (!snap.exists()) return null;
  return fromDoc(phone, snap.data() as Record<string, unknown>);
}

/** The editable slice of the profile — everything the influencer may change. */
export type InfluencerProfileInput = Omit<InfluencerProfile, "phone" | "uid" | "selfReported" | "isActive">;

/**
 * Create or update the caller's own profile at influencerProfiles/{phone}.
 * `uid` links the real Auth UID (mirrors saveUserProfile). Timestamps are set
 * server-side; createdAt is preserved on update via merge semantics.
 */
export async function saveInfluencerProfile(
  phone: string,
  uid: string | null,
  input: InfluencerProfileInput,
): Promise<void> {
  const ref = doc(db, "influencerProfiles", phone);
  const existing = await getDoc(ref);
  const now = serverTimestamp();

  // Strip empty socials so an untouched platform row never persists a blank URL.
  const socials: Record<string, InfluencerSocial> = {};
  for (const [k, v] of Object.entries(input.socials)) {
    if (v && v.url.trim()) socials[k] = { url: v.url.trim(), followers: Number(v.followers) || 0 };
  }

  const payload = {
    phone,
    displayName: input.displayName.trim(),
    photoUrl: input.photoUrl ?? null,
    bio: input.bio.trim(),
    contentCategory: input.contentCategory.trim(),
    languages: input.languages.map((l) => l.trim()).filter(Boolean),
    location: {
      state: input.location.state.trim(),
      district: input.location.district.trim(),
      city: input.location.city.trim(),
      workingArea: input.location.workingArea.trim(),
    },
    socials,
    collaboration: {
      charge: input.collaboration.charge == null ? null : Number(input.collaboration.charge),
      currency: (input.collaboration.currency || DEFAULT_CURRENCY).trim().toUpperCase(),
    },
    selfReported: true as const,
    updatedAt: now,
  };

  if (existing.exists()) {
    // Link the real uid on first authenticated save without clobbering it later.
    await updateDoc(ref, uid ? { ...payload, uid } : payload);
  } else {
    await setDoc(ref, {
      ...payload,
      uid: uid ?? null,
      isActive: true,
      createdAt: now,
    });
  }
}
