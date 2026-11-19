/**
 * Settlement records against the Firestore emulator: stamping the plan from
 * the payment attempt, booking, cancelling, self-delivery, campaign spend, and
 * that every step is idempotent (triggers fire twice).
 *
 *   firebase emulators:exec --only firestore --project demo-settle --config firebase.uat.json \
 *     "npx tsx functions/scripts/settlement-store-test.ts"
 */
import assert from "node:assert/strict";
import * as admin from "firebase-admin";

admin.initializeApp({ projectId: "demo-settle" });
const db = admin.firestore();

async function main() {
  const { planSettlement } = await import("../src/payouts/settlement");
  const { settlementFor, recordBooked, recordCancelled, recordSelfDelivery } = await import("../src/payouts/settlement-store");
  const R = { commissionPercent: 2, gatewayFeePercent: 2, gatewayFeeGstPercent: 18, feeBearer: "seller" as const };
  const SELLER = "+918658031942";

  // Checkout: two sellers on one payment; only the first was routed.
  const p1 = planSettlement({ sellerKey: SELLER, goods: 1000, deliveryTo: "platform", customerDelivery: 0,
    sellerCourier: 40, campaign: 40, courierQuote: 80, sellerShare: 0.5, rates: R });
  const p2 = planSettlement({ sellerKey: "+919011842378", goods: 500, deliveryTo: "seller", customerDelivery: 50, rates: R });
  await db.collection("paymentAttempts").doc("order_A").set({
    settlements: [{ sellerKey: SELLER, plan: p1 }, { sellerKey: "+919011842378", plan: p2 }],
    routedSellers: [SELLER],
    routedAccounts: { [SELLER]: "acc_ABCDEFGHIJKLMN" },
  });
  await db.collection("orders").doc("o1").set({ sellerPhone: SELLER, payment: { razorpayOrderId: "order_A" }, status: "accepted" });
  await db.collection("orders").doc("o2").set({ sellerPhone: "9011842378", payment: { razorpayOrderId: "order_A" }, status: "accepted" });
  await db.collection("orders").doc("legacy").set({ sellerPhone: SELLER, payment: { razorpayOrderId: "order_OLD" }, status: "accepted" });
  await db.collection("_serverConfig").doc("deliveryCampaign").set({ spentPaise: 0 });

  // Stamp: each order gets its own seller's plan; routed only where Route split.
  const s1 = await settlementFor("o1");
  const s2 = await settlementFor("o2");
  assert.equal(s1?.plan.transferPaise, p1.transferPaise);
  assert.equal(s1?.routed, true);
  assert.equal(s2?.plan.deliveryTo, "seller");
  assert.equal(s2?.routed, false);
  assert.equal(await settlementFor("legacy"), null);                       // no plan → old rules
  const o1 = (await db.collection("orders").doc("o1").get()).data()!;
  assert.equal(o1.settlement.routedAccountId, "acc_ABCDEFGHIJKLMN");
  assert.equal(o1.settlement.razorpayOrderId, "order_A");
  // Stamping again changes nothing.
  const stampedAt = o1.settlement.stampedAt;
  await settlementFor("o1");
  assert.equal((await db.collection("orders").doc("o1").get()).data()!.settlement.stampedAt, stampedAt);

  // Booked cheaper (₹70 real cost): seller's share 35 not 40 → ₹5 back; campaign pays 35.
  const booking = { plan: p1, sellerKey: "8658031942", reference: "o1-1", carrier: "shiprocket", service: "x", cost: 70, simulated: false };
  await recordBooked("o1", booking);
  await recordBooked("o1", booking);                                       // trigger fired twice
  let o = (await db.collection("orders").doc("o1").get()).data()!;
  assert.equal(o.settlementAdjustments.length, 1);
  assert.equal(o.settlementAdjustments[0].netPaise, 500);
  assert.equal(o.settlementTopUpDue, true);                                // routed → the top-up job pays it
  assert.equal(o.shipment.sellerPaysCourier, 35);
  assert.equal(o.shipment.campaignPays, 35);
  let camp = (await db.collection("_serverConfig").doc("deliveryCampaign").get()).data()!;
  assert.equal(camp.spentPaise, 3500);                                     // counted once
  const ledger = await db.collection("deliveryLedger").where("orderId", "==", "o1").get();
  assert.equal(ledger.size, 1);

  // Cancelled before pickup: ledger reversed, campaign spend undone, once.
  await recordCancelled("o1", "o1-1");
  await recordCancelled("o1", "o1-1");
  camp = (await db.collection("_serverConfig").doc("deliveryCampaign").get()).data()!;
  assert.equal(camp.spentPaise, 0);
  assert.equal((await db.collection("deliveryLedger").where("orderId", "==", "o1").get()).size, 2);

  // A simulated booking never eats the campaign budget.
  await recordBooked("o1", { ...booking, reference: "o1-2", simulated: true });
  camp = (await db.collection("_serverConfig").doc("deliveryCampaign").get()).data()!;
  assert.equal(camp.spentPaise, 0);

  // No courier after all: seller delivers, gets their ₹40 share back (campaign: customer paid ₹0).
  assert.equal(await recordSelfDelivery("o1", p1, SELLER), true);
  assert.equal(await recordSelfDelivery("o1", p1, SELLER), false);        // never twice
  o = (await db.collection("orders").doc("o1").get()).data()!;
  const self = o.settlementAdjustments.find((a: { kind: string }) => a.kind === "self_delivery");
  assert.equal(self.netPaise, 4000);

  // Seller-delivery plan: nothing to add.
  assert.equal(await recordSelfDelivery("o2", p2, "9011842378"), false);

  console.log("settlement store (emulator): all checks passed");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
