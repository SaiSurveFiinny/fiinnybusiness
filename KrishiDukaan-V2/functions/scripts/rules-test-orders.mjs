// Order rules for courier automation, with real seller/customer identities.
//   firebase emulators:exec --only firestore --project demo-rules --config firebase.uat.json "node functions/scripts/rules-test-orders.mjs"
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getFirestore, setDoc, updateDoc } from "firebase/firestore";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("../node_modules/firebase-admin");

const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const adb = admin.initializeApp({ projectId: "demo-rules" }).firestore();
const client = (uid, n) => {
  const db = getFirestore(initializeApp({ projectId: "demo-rules", apiKey: "x" }, n));
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { user_id: uid, sub: uid } });
  return db;
};
await adb.collection("uidIndex").doc("seller").set({ phone: "+919000000002" });
await adb.collection("uidIndex").doc("cust").set({ phone: "+919000000001" });
await adb.collection("users").doc("+919000000002").set({ role: "retailer" });
await adb.collection("users").doc("+919000000001").set({ role: "consumer" });
const base = { customerId: "cust", customerPhone: "+919000000001", sellerId: "seller", sellerPhone: "+919000000002", sellerType: "retailer", status: "accepted" };
const courier = { ...base, shipment: { mode: "courier", stage: "booked" } };
const self = { ...base, shipment: { mode: "self", stage: "self" } };
await adb.collection("orders").doc("c").set(courier);
await adb.collection("orders").doc("s").set(self);
await adb.collection("orders").doc("n").set(base);
await adb.collection("orders").doc("p").set({ ...base, status: "placed" });

const seller = client("seller", "a"), cust = client("cust", "b");
let fail = 0;
const t = async (name, allow, fn) => {
  let ok = true; try { await fn(); } catch (e) { if (e.code !== "permission-denied") console.log(e.code); ok = false; }
  const good = ok === allow; if (!good) fail++;
  console.log(`  ${good ? "PASS" : "FAIL"}  ${name} (${ok ? "allowed" : "denied"})`);
};
const u = (db, id, d) => updateDoc(doc(db, "orders", id), d);
await t("seller accepts a placed order", true, () => u(seller, "p", { status: "accepted" }));
await t("seller may NOT mark a courier order dispatched", false, () => u(seller, "c", { status: "dispatched" }));
await t("seller may NOT mark a courier order delivered", false, () => u(seller, "c", { status: "delivered" }));
await t("seller may NOT edit the shipment", false, () => u(seller, "c", { "shipment.stage": "delivered" }));
await t("seller may NOT clear the shipment", false, () => u(seller, "c", { shipment: null }));
await t("seller may NOT write shipment history", false, () => u(seller, "c", { shipmentHistory: [] }));
await t("seller may NOT write tracking", false, () => u(seller, "c", { tracking: {} }));
await t("seller may ask for pickup", true, () => u(seller, "c", { shipmentRequest: { id: "1", action: "pickup" } }));
await t("seller-delivered order: seller still moves status", true, () => u(seller, "s", { status: "delivered" }));
await t("no courier involved: seller still moves status", true, () => u(seller, "n", { status: "dispatched" }));
await t("customer may NOT ask for pickup", false, () => u(cust, "c", { shipmentRequest: { id: "2", action: "pickup" } }));
await t("customer may NOT edit the shipment", false, () => u(cust, "c", { shipment: {} }));
await t("customer may NOT create an order with a shipment", false, () => setDoc(doc(cust, "orders", "x"), { ...base, status: "placed", shipment: { mode: "self" } }));
await t("customer may NOT create an order with a request", false, () => setDoc(doc(cust, "orders", "y"), { ...base, status: "placed", shipmentRequest: {} }));
// Who gets which rupee is the server's (docs/delivery-money-architecture.md).
const plan = { v: 1, goodsPaise: 100000, transferPaise: 999999, deliveryTo: "seller" };
await t("customer may NOT create an order with a settlement plan", false, () => setDoc(doc(cust, "orders", "z1"), { ...base, status: "placed", settlement: plan }));
await t("customer may NOT create an order with adjustments", false, () => setDoc(doc(cust, "orders", "z2"), { ...base, status: "placed", settlementAdjustments: [{ id: "x", netPaise: 100000 }] }));
await t("customer may NOT flag a top-up", false, () => setDoc(doc(cust, "orders", "z3"), { ...base, status: "placed", settlementTopUpDue: true }));
await t("customer may still create a normal order", true, () => setDoc(doc(cust, "orders", "z4"), { ...base, status: "placed" }));
await t("seller may NOT write the settlement plan", false, () => u(seller, "n", { settlement: plan }));
await t("seller may NOT add adjustments", false, () => u(seller, "n", { settlementAdjustments: [{ id: "x", netPaise: 100000 }] }));
await t("seller may NOT claim a top-up", false, () => u(seller, "n", { settlementTopUpClaim: { run: "x" } }));
await t("customer may NOT write the settlement plan", false, () => u(cust, "n", { settlement: plan }));
await t("customer may NOT read the delivery ledger", false, async () => {
  const { getDoc } = await import("firebase/firestore");
  await adb.collection("deliveryLedger").doc("l1").set({ kind: "booked" });
  await getDoc(doc(cust, "deliveryLedger", "l1"));
});
console.log(fail ? `${fail} FAILED` : "rules: all passed");
process.exit(fail ? 1 : 0);
