/**
 * Pays settlement adjustments to sellers who were paid by Route at checkout.
 *
 * WHY
 * A planned order's checkout transfer is the least its seller is owed
 * (docs/delivery-money-architecture.md). Two later events add to it:
 *   - no courier booked after all, so the seller delivers and the delivery
 *     money is theirs;
 *   - the courier cost less than quoted, so part of their offer share comes back.
 * For a seller with no Route transfer the payout run / pay-after-kyc pay the
 * plan and these together. A Route seller's transfer is already made, so the
 * extra goes as its own transfer from the platform's balance, here.
 *
 * WHEN (all of these)
 *   - settings/payouts.transfersEnabled AND autoPayout are on (the same
 *     switches as pay-after-kyc; both default off);
 *   - the order is delivered and PAYOUT_HOLD_DAYS have passed (the customer's
 *     refund window, same as every other payout);
 *   - the order's plan was routed and names a valid linked account;
 *   - there are unpaid adjustments for the order's CURRENT seller.
 *
 * NEVER TWICE
 *   Claimed in a transaction (settlementTopUpClaim) before money moves; the
 *   adjustments are marked paid with the transfer id in the same write that
 *   clears the claim. A crash after the transfer leaves the claim in place:
 *   the order is never paid again automatically and shows up for an admin.
 */
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { key10, markAdjustmentsPaid, readAdjustments, readPlan, toMillis } from "./settlement";

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
const REGION = "asia-south1";
const DAY = 24 * 60 * 60 * 1000;
/** Same hold as every other payout (seller-earnings.ts PAYOUT_HOLD_DAYS). */
export const TOPUP_HOLD_DAYS = 7;
export const TOPUP_RETRY_MS = 6 * 60 * 60 * 1000;
const LINKED_ID_RE = /^acc_[A-Za-z0-9]{14}$/;

type Order = admin.firestore.DocumentData;

export type TopUpDecision =
  | { action: "pay"; amountPaise: number; accountId: string; sellerKey: string }
  | { action: "wait" | "skip" | "done"; reason: string };

function deliveredAtMs(o: Order): number {
  const h = Array.isArray(o.statusHistory) ? o.statusHistory : [];
  for (let i = h.length - 1; i >= 0; i--) if (h[i]?.status === "delivered") return toMillis(h[i]?.at);
  return 0;
}

/** Whether to pay an order's adjustments now. Pure, so it is tested on its own. */
export function decideTopUp(o: Order, now: number): TopUpDecision {
  const plan = readPlan(o.settlement);
  if (!plan) return { action: "skip", reason: "no plan" };
  if (o.settlement?.routed !== true) return { action: "skip", reason: "not routed: the payout run pays it" };
  const accountId = String(o.settlement?.routedAccountId ?? "");
  if (!LINKED_ID_RE.test(accountId)) return { action: "skip", reason: "no linked account on the plan" };
  if (o.settlementTopUpClaim) return { action: "skip", reason: "claimed" };
  const status = String(o.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "rejected" || status === "refunded" || o.payment?.status === "refunded") {
    return { action: "done", reason: "not payable" };
  }
  const sellerKey = key10(o.sellerPhone ?? o.sellerId);
  const due = readAdjustments(o.settlementAdjustments)
    .filter((a) => key10(a.sellerKey) === sellerKey && !a.paidTransferId)
    .reduce((s, a) => s + a.netPaise, 0);
  if (due <= 0) return { action: "done", reason: "nothing owed" };
  if (status !== "delivered") return { action: "wait", reason: "not delivered" };
  const delivered = deliveredAtMs(o);
  if (!delivered || now - delivered < TOPUP_HOLD_DAYS * DAY) return { action: "wait", reason: "in hold after delivery" };
  const failedAt = toMillis(o.settlementTopUpErrorAt);
  if (failedAt && now - failedAt < TOPUP_RETRY_MS) return { action: "wait", reason: "retrying after a failure" };
  return { action: "pay", amountPaise: due, accountId, sellerKey };
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`).toString("base64")}`;
}

export async function paySettlementTopUpsNow(now = Date.now()) {
  const db = admin.firestore();
  const settings = (await db.doc("settings/payouts").get()).data() ?? {};
  if (settings.transfersEnabled !== true || settings.autoPayout !== true) {
    logger.info("[settlement-topups] off (settings/payouts.transfersEnabled and autoPayout)");
    return { paid: 0, failed: 0 };
  }
  const snap = await db.collection("orders").where("settlementTopUpDue", "==", true).limit(200).get();
  let paid = 0, failed = 0;
  for (const doc of snap.docs) {
    const decision = decideTopUp(doc.data(), now);
    if (decision.action === "done") {
      await doc.ref.update({ settlementTopUpDue: false }).catch(() => undefined);
      continue;
    }
    if (decision.action !== "pay") continue;

    const runId = `topup_${now}`;
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const d = decideTopUp(fresh.data() ?? {}, now);
      if (d.action !== "pay" || d.amountPaise !== decision.amountPaise) return false;
      tx.update(doc.ref, { settlementTopUpClaim: { run: runId, at: FieldValue.serverTimestamp(), amountPaise: d.amountPaise } });
      return true;
    });
    if (!claimed) continue;

    try {
      const res = await fetch("https://api.razorpay.com/v1/transfers", {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          account: decision.accountId,
          amount: decision.amountPaise,
          currency: "INR",
          notes: { orderId: doc.id, sellerKey: decision.sellerKey, via: "settlement_topup" },
        }),
      });
      if (!res.ok) throw new Error(`POST /transfers ${res.status}: ${(await res.text()).slice(0, 240)}`);
      const t = (await res.json()) as { id: string };
      const at = new Date(now).toISOString();
      await doc.ref.update({
        settlementAdjustments: markAdjustmentsPaid(readAdjustments(doc.get("settlementAdjustments")), decision.sellerKey, t.id, at, "topup"),
        settlementTopUpDue: false,
        settlementTopUpClaim: FieldValue.delete(),
        settlementTopUpError: FieldValue.delete(),
        settlementTopUpErrorAt: FieldValue.delete(),
      });
      paid++;
      logger.info("[settlement-topups] paid", { orderId: doc.id, transferId: t.id, amountPaise: decision.amountPaise });
    } catch (e) {
      failed++;
      const message = String(e instanceof Error ? e.message : e).slice(0, 300);
      logger.error("[settlement-topups] transfer failed", { orderId: doc.id, error: message });
      await doc.ref.update({
        settlementTopUpClaim: FieldValue.delete(),
        settlementTopUpError: message,
        settlementTopUpErrorAt: now,
      }).catch(() => undefined);
    }
  }
  logger.info("[settlement-topups] run", { candidates: snap.size, paid, failed });
  return { paid, failed };
}

export const paySettlementTopUps = onSchedule(
  { schedule: "every 60 minutes", region: REGION, timeZone: "Asia/Kolkata", secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET], timeoutSeconds: 540 },
  async () => {
    await paySettlementTopUpsNow();
  },
);
