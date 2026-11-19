import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { notify } from "../notify";
import { queueWaNotification } from "../wa-notify";
import { SHIPROCKET_API_EMAIL, SHIPROCKET_API_PASSWORD, shiprocketWalletBalance } from "./carriers";
import { estimateWalletPaise, toMillis, walletAlertDue, type LedgerEntry } from "../payouts/settlement";

/**
 * Courier wallets: the platform pays couriers from pre-funded wallets, topped
 * up by hand (docs/delivery-money-architecture.md §3.7). This keeps an eye on
 * them so a wallet never runs dry unnoticed.
 *
 *   _serverConfig/courierWallets
 *     shiprocket   { balancePaise, at, error? }          read from Shiprocket's API
 *     delhivery    { recordedPaise, recordedAt,          entered by an admin from
 *                    estimatePaise, at }                 Delhivery's panel (no API),
 *                                                        less real bookings since
 *     alertBelow   ₹, default 5000
 *     alertPhones  admins to tell (in-app + WhatsApp)
 *     lastAlert    { shiprocket: ms, delhivery: ms }     at most one per 12 h each
 *
 * A booking that fails for lack of balance already falls through to the other
 * courier, then to the seller (engine.ts); this is the early warning.
 */

const REGION = "asia-south1";
export const WALLETS_DOC = () => admin.firestore().collection("_serverConfig").doc("courierWallets");
const DEFAULT_ALERT_BELOW = 5000;

async function ledgerSince(ms: number): Promise<LedgerEntry[]> {
  const snap = await admin.firestore().collection("deliveryLedger")
    .where("at", ">", new Date(ms).toISOString()).limit(5000).get();
  return snap.docs.map((d) => d.data() as LedgerEntry);
}

export async function checkCourierWallets(now = Date.now()) {
  const ref = WALLETS_DOC();
  const cfg = (await ref.get()).data() ?? {};
  const alertBelow = Number(cfg.alertBelow) > 0 ? Number(cfg.alertBelow) : DEFAULT_ALERT_BELOW;
  const phones: string[] = Array.isArray(cfg.alertPhones) ? cfg.alertPhones.map(String).filter(Boolean) : [];
  const update: Record<string, unknown> = {};

  let shiprocketPaise: number | null = null;
  try {
    shiprocketPaise = Math.round((await shiprocketWalletBalance()) * 100);
    update.shiprocket = { balancePaise: shiprocketPaise, at: new Date(now).toISOString() };
  } catch (e) {
    logger.warn("[wallets] Shiprocket balance unreadable", { e: String(e) });
    update.shiprocket = { ...(cfg.shiprocket ?? {}), error: String(e).slice(0, 200), errorAt: new Date(now).toISOString() };
  }

  let delhiveryPaise: number | null = null;
  const recordedAt = toMillis(cfg.delhivery?.recordedAt);
  if (recordedAt > 0 && Number.isFinite(Number(cfg.delhivery?.recordedPaise))) {
    delhiveryPaise = estimateWalletPaise(Number(cfg.delhivery.recordedPaise), recordedAt, await ledgerSince(recordedAt), "delhivery");
    update["delhivery.estimatePaise"] = delhiveryPaise;
    update["delhivery.at"] = new Date(now).toISOString();
  }

  const lastAlert = (cfg.lastAlert ?? {}) as Record<string, unknown>;
  for (const [carrier, paise, label] of [
    ["shiprocket", shiprocketPaise, "Shiprocket"],
    ["delhivery", delhiveryPaise, "Delhivery (estimated)"],
  ] as const) {
    if (!walletAlertDue(paise, alertBelow, Number(lastAlert[carrier]) || 0, now)) continue;
    const text = `${label} wallet is low: ₹${((paise ?? 0) / 100).toFixed(2)} (alert below ₹${alertBelow}). Top it up so courier bookings don't fail.`;
    for (const phone of phones) {
      await notify(phone, "courier_wallet", "Courier wallet low", text, { carrier }).catch(() => undefined);
      await queueWaNotification(phone, text).catch(() => undefined);
    }
    update[`lastAlert.${carrier}`] = now;
    logger.warn("[wallets] low balance alert", { carrier, paise, alertBelow, recipients: phones.length });
  }

  // `delhivery.*` paths need update(), which needs the doc to exist.
  await ref.set({ checkedAt: new Date(now).toISOString() }, { merge: true });
  await ref.update(update);
  return { shiprocketPaise, delhiveryPaise };
}

export const courierWalletWatch = onSchedule(
  { schedule: "every 60 minutes", region: REGION, timeZone: "Asia/Kolkata", secrets: [SHIPROCKET_API_EMAIL, SHIPROCKET_API_PASSWORD] },
  async () => {
    await checkCourierWallets();
  },
);
