/**
 * The shared courier-quote cache (app/lib/courier-quote.ts) against the
 * Firestore emulator: one bucket doc per customer pincode, merged writes,
 * in-flight dedupe, batched seller pincodes. Courier tokens are unset, so a
 * fetch answers "no courier" (null) without calling anyone.
 *
 *   firebase emulators:exec --only firestore --project demo-quotes \
 *     "npx tsx scripts/tests/quote-cache-emulator.ts"
 */
import assert from "node:assert/strict";

process.env.FIREBASE_PROJECT_ID = "demo-quotes";
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;
delete process.env.DELHIVERY_API_TOKEN;
delete process.env.SHIPROCKET_API_EMAIL;
delete process.env.SHIPROCKET_API_PASSWORD;
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run under the Firestore emulator");

async function main() {
  const { getAdminDb } = await import("../../app/lib/firebase-admin");
  const cq = await import("../../app/lib/courier-quote");
  const db = getAdminDb();

  const quote = { carrier: "delhivery" as const, service: "Surface", cost: 79, etaDays: 3 };
  const r1 = { pickup: "423106", drop: "411038", kg: 1.5 };
  const r2 = { pickup: "410201", drop: "411038", kg: 0.5 };
  const r3 = { pickup: "423106", drop: "560001", kg: 1.5 };

  // Two routes to one pincode → ONE doc; another pincode → its own doc.
  await cq.storeQuotes([{ route: r1, quote }, { route: r2, quote: null }, { route: r3, quote }]);
  const bucket = (await db.collection("deliveryQuotes").doc("411038").get()).data()!;
  assert.deepEqual(Object.keys(bucket.q).sort(), ["410201_0_5", "423106_1_5"]);
  assert.equal(bucket.q["423106_1_5"].quote.cost, 79);
  assert.equal(bucket.q["410201_0_5"].quote, null);
  assert.ok((await db.collection("deliveryQuotes").doc("560001").get()).exists);

  // A second write merges, never replaces the bucket.
  const r4 = { pickup: "400001", drop: "411038", kg: 2 };
  await cq.storeQuotes([{ route: r4, quote }]);
  assert.equal(Object.keys((await db.collection("deliveryQuotes").doc("411038").get()).data()!.q).length, 3);

  // cachedQuotes returns the stored answers, "no courier" as null.
  const got = await cq.cachedQuotes([r1, r2, r4]);
  assert.equal(got.get(cq.quoteRouteKey(r1))?.cost, 79);
  assert.equal(got.has(cq.quoteRouteKey(r2)), true);
  assert.equal(got.get(cq.quoteRouteKey(r2)), null);

  // Stale entries (older than 12 h) are not served.
  const old = { pickup: "110001", drop: "122001", kg: 1 };
  await db.collection("deliveryQuotes").doc("122001").set({
    q: { "110001_1_0": { at: Date.now() - cq.QUOTE_CACHE_MS - 1000, quote } },
  });
  assert.equal((await cq.cachedQuotes([old])).has(cq.quoteRouteKey(old)), false);

  // In-flight dedupe: the same route asked twice at once is one fetch.
  const fresh = { pickup: "422001", drop: "411038", kg: 1 };
  const a = cq.fetchRoute(fresh, 100);
  const b = cq.fetchRoute(fresh, 100);
  assert.equal(a, b);
  assert.equal(await a, null); // no courier tokens → no courier
  // cheapestQuote then serves it from memory (no second fetch, no write needed).
  assert.equal(await cq.cheapestQuote("422001", "411038", 1, 100), null);

  // Batched seller pincodes: manufacturers/retailers first, then profiles/users.
  await db.collection("retailers").doc("+919000000001").set({ address: { pincode: "423106" } });
  await db.collection("manufacturers").doc("9000000002").set({ pincode: "410201" });
  await db.collection("users").doc("+919000000003").set({ address: "Shop 4, Main Rd, Nashik 422001" });
  const pins = await cq.pickupPincodesFor(["+919000000001", "9000000002", "+91 90000 00003", "+919000000009"]);
  assert.equal(pins.get("9000000001"), "423106");
  assert.equal(pins.get("9000000002"), "410201");
  assert.equal(pins.get("9000000003"), "422001");
  assert.equal(pins.get("9000000009"), null);
  // Same answer as the one-seller lookup checkout uses.
  assert.equal(await cq.pickupPincodeFor("+919000000001"), "423106");

  console.log("quote cache (emulator): all checks passed");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
