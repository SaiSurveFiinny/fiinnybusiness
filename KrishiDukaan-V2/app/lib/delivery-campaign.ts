import { getAdminDb } from "./firebase-admin";
import { activeCampaign, type ActiveCampaign, type CampaignDoc } from "../../functions/src/payouts/settlement";

/**
 * The platform's free-delivery campaign (_serverConfig/deliveryCampaign), as
 * checkout and the delivery estimate see it. The rules for "is it running"
 * live in functions/src/payouts/settlement.ts activeCampaign; this only reads
 * the document, cached for a minute so a busy checkout isn't a read per cart.
 *
 * A read failure means "no campaign": charging the normal delivery is the
 * safe side of an error (the customer sees the price before paying), whereas
 * a wrongly-free order would cost the platform without anyone deciding to.
 */
// Server-only (firestore.rules: _serverConfig): budget and spend are not public.
export const DELIVERY_CAMPAIGN_DOC = { collection: "_serverConfig", doc: "deliveryCampaign" } as const;

let cache: { at: number; doc: CampaignDoc | null } | null = null;
const CACHE_MS = 60_000;

export async function loadCampaignDoc(): Promise<CampaignDoc | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.doc;
  let doc: CampaignDoc | null = null;
  try {
    const snap = await getAdminDb().collection(DELIVERY_CAMPAIGN_DOC.collection).doc(DELIVERY_CAMPAIGN_DOC.doc).get();
    doc = snap.exists ? (snap.data() as CampaignDoc) : null;
  } catch (e) {
    console.warn("[delivery-campaign] read failed, no campaign applied:", e);
    doc = null;
  }
  cache = { at: Date.now(), doc };
  return doc;
}

export async function loadActiveCampaign(now = Date.now()): Promise<ActiveCampaign | null> {
  return activeCampaign(await loadCampaignDoc(), now);
}

/** After an admin saves the campaign, so this server instance sees it at once. */
export function clearCampaignCache(): void {
  cache = null;
}
