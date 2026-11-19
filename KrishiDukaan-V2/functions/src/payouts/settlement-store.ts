import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import {
  bookingSplit, courierShareRefund, key10, readAdjustments, readPlan, selfDeliveryAdjustment, withAdjustment,
  type SettlementAdjustment, type SettlementPlan,
} from "./settlement";

/**
 * The settlement plan on the order, and the money records around a booking.
 * Design: docs/delivery-money-architecture.md.
 *
 *   order.settlement             the plan for the order's current seller, plus
 *                                `routed` (a Route transfer was made at
 *                                checkout) and `razorpayOrderId`. Server-only.
 *   order.settlementAdjustments  what later events added for a seller.
 *                                Server-only, append-only, unique by id.
 *   deliveryLedger/{id}          one entry per booking, cancellation and
 *                                switch to self-delivery. Server-only.
 *   _serverConfig/deliveryCampaign  spentPaise kept here, on real bookings.
 *
 * Every write here is idempotent: triggers fire twice, and the engine's own
 * writes re-fire its trigger.
 */

const REGION = "asia-south1";
const db = () => admin.firestore();
const orderRef = (id: string) => db().collection("orders").doc(id);
const nowIso = () => new Date().toISOString();

export interface OrderSettlement {
  plan: SettlementPlan;
  adjustments: SettlementAdjustment[];
  /** A Route transfer for this seller was created at checkout. */
  routed: boolean;
}

function fromOrder(o: FirebaseFirestore.DocumentData | undefined): OrderSettlement | null {
  const plan = readPlan(o?.settlement);
  if (!plan) return null;
  return { plan, adjustments: readAdjustments(o?.settlementAdjustments), routed: o?.settlement?.routed === true };
}

/** The seller this order is for now, in settlement-key form. */
export function orderSellerKey(o: FirebaseFirestore.DocumentData | undefined): string {
  return key10(o?.sellerPhone ?? o?.sellerId);
}

/**
 * The order's plan, copying it from the payment attempt first if it isn't
 * there yet. Null for orders that never had one (old app builds, manual admin
 * orders, anything paid before plans existed): those keep the old rules.
 */
export async function settlementFor(orderId: string): Promise<OrderSettlement | null> {
  const snap = await orderRef(orderId).get();
  const existing = fromOrder(snap.data());
  if (existing) return existing;
  const o = snap.data();
  const rzpOrderId = String(o?.payment?.razorpayOrderId ?? "").trim();
  if (!o || !rzpOrderId) return null;

  const attempt = (await db().collection("paymentAttempts").doc(rzpOrderId).get()).data();
  const list = Array.isArray(attempt?.settlements) ? (attempt!.settlements as Array<{ sellerKey?: unknown; plan?: unknown }>) : [];
  if (!list.length) return null;
  const want = orderSellerKey(o);
  const entry = list.find((e) => key10(e.sellerKey) === want) ?? (list.length === 1 && !want ? list[0] : undefined);
  const plan = readPlan(entry?.plan);
  if (!entry || !plan) {
    logger.warn("[settlement] no plan for this seller on the payment", { orderId, rzpOrderId, seller: want });
    return null;
  }
  const routed = Array.isArray(attempt?.routedSellers)
    && (attempt!.routedSellers as unknown[]).some((k) => key10(k) === key10(entry.sellerKey));
  const accounts = (attempt?.routedAccounts ?? {}) as Record<string, unknown>;
  const routedAccountId = routed
    ? String(Object.entries(accounts).find(([k]) => key10(k) === key10(entry.sellerKey))?.[1] ?? "")
    : "";

  return db().runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef(orderId));
    const already = fromOrder(fresh.data());
    if (already) return already;
    tx.update(orderRef(orderId), {
      settlement: { ...plan, routed, routedAccountId, razorpayOrderId: rzpOrderId, stampedAt: nowIso() },
    });
    return { plan, adjustments: [], routed };
  });
}

/** Copies the checkout plan onto every new order (customer clients can't write it). */
export const stampOrderSettlement = onDocumentCreated(
  { document: "orders/{orderId}", region: REGION },
  async (event) => {
    try {
      await settlementFor(event.params.orderId);
    } catch (e) {
      // The engine and payout code call settlementFor again before they use it.
      logger.error("[settlement] stamp failed", { orderId: event.params.orderId, e: String(e) });
    }
  },
);

async function addAdjustment(
  tx: FirebaseFirestore.Transaction,
  orderId: string,
  current: FirebaseFirestore.DocumentData | undefined,
  adj: SettlementAdjustment | null,
): Promise<boolean> {
  if (!adj) return false;
  const { list, added } = withAdjustment(readAdjustments(current?.settlementAdjustments), adj);
  if (added) {
    tx.update(orderRef(orderId), {
      settlementAdjustments: list,
      // A seller paid by Route at checkout gets adjustments by a separate
      // top-up (payouts/settlement-topups.ts), which finds orders by this flag.
      // Others are paid by the payout run, which includes them.
      ...(current?.settlement?.routed === true ? { settlementTopUpDue: true } : {}),
    });
  }
  return added;
}

type LedgerKind = "booked" | "cancelled" | "self_delivery";

function ledgerRef(orderId: string, ref: string, kind: LedgerKind) {
  return db().collection("deliveryLedger").doc(`${orderId}_${ref}_${kind}`.replace(/[/]/g, "_"));
}

const campaignRef = () => db().collection("_serverConfig").doc("deliveryCampaign");

/**
 * After a courier is booked on a planned order: the seller's actual share of
 * the real cost (a cheaper booking gives some of it back), the ledger entry,
 * and the campaign spend. Nothing is clawed back: the checkout transfer never
 * carried the delivery money.
 */
export async function recordBooked(orderId: string, input: {
  plan: SettlementPlan;
  sellerKey: string;
  reference: string;
  carrier: string;
  service: string;
  cost: number;
  simulated: boolean;
}): Promise<void> {
  const split = bookingSplit(input.plan, input.cost);
  const at = nowIso();
  await db().runTransaction(async (tx) => {
    const [snap, ledger] = await Promise.all([tx.get(orderRef(orderId)), tx.get(ledgerRef(orderId, input.reference, "booked"))]);
    const o = snap.data();
    if (!o) return;
    await addAdjustment(tx, orderId, o, courierShareRefund(input.plan, input.cost, input.sellerKey, at));
    tx.update(orderRef(orderId), {
      "shipment.platformKeptDelivery": true,
      "shipment.sellerPaysCourier": split.sellerPaise / 100,
      "shipment.campaignPays": split.campaignPaise / 100,
    });
    if (ledger.exists) return;
    tx.set(ledgerRef(orderId, input.reference, "booked"), {
      orderId, kind: "booked", at, sellerKey: input.sellerKey, reference: input.reference,
      carrier: input.carrier, service: input.service, simulated: input.simulated,
      ...split, campaignApplied: input.plan.campaignApplied,
    });
    // Real money only: a simulated booking costs nothing, so it never eats the budget.
    if (!input.simulated && split.campaignPaise > 0) {
      tx.set(campaignRef(), { spentPaise: FieldValue.increment(split.campaignPaise) }, { merge: true });
    }
  });
}

/** A booked parcel was cancelled before it left: its ledger entry and campaign spend are undone. */
export async function recordCancelled(orderId: string, reference: string): Promise<void> {
  if (!reference) return;
  await db().runTransaction(async (tx) => {
    const [booked, cancelled] = await Promise.all([
      tx.get(ledgerRef(orderId, reference, "booked")),
      tx.get(ledgerRef(orderId, reference, "cancelled")),
    ]);
    if (!booked.exists || cancelled.exists) return;
    const b = booked.data()!;
    const neg = (v: unknown) => -(Number(v) || 0);
    tx.set(ledgerRef(orderId, reference, "cancelled"), {
      orderId, kind: "cancelled", at: nowIso(), sellerKey: b.sellerKey ?? "", reference,
      carrier: b.carrier ?? "", service: b.service ?? "", simulated: b.simulated === true,
      costPaise: neg(b.costPaise), customerNetPaise: neg(b.customerNetPaise), sellerPaise: neg(b.sellerPaise),
      campaignPaise: neg(b.campaignPaise), platformPaise: neg(b.platformPaise), campaignApplied: b.campaignApplied === true,
    });
    if (b.simulated !== true && Number(b.campaignPaise) > 0) {
      tx.set(campaignRef(), { spentPaise: FieldValue.increment(-Number(b.campaignPaise)) }, { merge: true });
    }
  });
}

/**
 * The platform was to ship but no courier booked: the seller delivers, so the
 * delivery money and their courier share become theirs (an adjustment, paid
 * after delivery). Returns whether anything was added.
 */
export async function recordSelfDelivery(orderId: string, plan: SettlementPlan, sellerKey: string): Promise<boolean> {
  if (plan.deliveryTo !== "platform") return false;
  const at = nowIso();
  const adj = selfDeliveryAdjustment(plan, sellerKey, at);
  return db().runTransaction(async (tx) => {
    const [snap, ledger] = await Promise.all([tx.get(orderRef(orderId)), tx.get(ledgerRef(orderId, key10(sellerKey) || "seller", "self_delivery"))]);
    const added = await addAdjustment(tx, orderId, snap.data(), adj);
    if (!ledger.exists) {
      tx.set(ledgerRef(orderId, key10(sellerKey) || "seller", "self_delivery"), {
        orderId, kind: "self_delivery", at, sellerKey: key10(sellerKey), reference: "",
        carrier: "", service: "", simulated: false,
        costPaise: 0, customerNetPaise: 0, sellerPaise: 0, campaignPaise: 0, platformPaise: 0,
        // Delivery money the platform held, now owed to the seller who delivers.
        toSellerPaise: adj?.netPaise ?? 0,
        campaignApplied: plan.campaignApplied,
      });
    }
    return added;
  });
}
