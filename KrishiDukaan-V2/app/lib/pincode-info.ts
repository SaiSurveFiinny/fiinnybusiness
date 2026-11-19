import { getAdminDb } from "./firebase-admin";

/**
 * Pincode → city, district, taluka, state (India Post's public directory).
 * Shared by GET /api/pincode/{pin} (checkout and profile address forms) and
 * the delivered-price endpoint (the state picks a seller's delivery slab).
 * A pincode's district/state never change, so each answer is kept in
 * Firestore (pincodes/{pin}) and in memory: every later lookup is free or
 * one read.
 */

export type PinInfo = { pincode: string; city: string; district: string; taluka: string; state: string; areas: string[] };
const mem = new Map<string, PinInfo>();
// "Not found" is remembered briefly only: India Post can fail for a moment, and a
// real pincode must not stay "not found" until the server restarts.
const missUntil = new Map<string, number>();

const tidy = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && s.toUpperCase() !== "NA" ? s : "";
};

async function fromIndiaPost(pin: string): Promise<PinInfo | null> {
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  const body = (await res.json()) as Array<{ Status?: string; PostOffice?: Array<Record<string, unknown>> | null }>;
  const offices = body?.[0]?.Status === "Success" ? body[0].PostOffice ?? [] : [];
  if (!offices.length) return null;
  const first = offices[0]!;
  const district = tidy(first.District);
  // India Post has no "city". Its Block is the taluka/mandal, which is wrong for
  // towns (Gurugram → "Sector -45", Hyderabad → "Asifnagar"), so the city is the
  // district and the taluka is returned on its own.
  const taluka = offices.map((o) => tidy(o.Block)).find(Boolean) ?? "";
  return {
    pincode: pin,
    city: district,
    district,
    taluka,
    state: tidy(first.State),
    areas: Array.from(new Set(offices.map((o) => tidy(o.Name)).filter(Boolean))).slice(0, 25),
  };
}


/** The pincode's info, or null when it doesn't exist. Throws when India Post is unreachable and nothing is cached. */
export async function pincodeInfo(pin: string): Promise<PinInfo | null> {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  const hit = mem.get(pin);
  if (hit) return hit;
  if ((missUntil.get(pin) ?? 0) > Date.now()) return null;
  const ref = getAdminDb().collection("pincodes").doc(pin);
  try {
    const saved = (await ref.get()).data() as PinInfo | undefined;
    if (saved?.state && saved.taluka !== undefined) {
      mem.set(pin, saved);
      return saved;
    }
  } catch { /* fall through to India Post */ }
  const info = await fromIndiaPost(pin);
  if (!info) {
    missUntil.set(pin, Date.now() + 10 * 60 * 1000);
    return null;
  }
  mem.set(pin, info);
  ref.set({ ...info, fetchedAt: new Date().toISOString() }).catch(() => undefined);
  return info;
}
