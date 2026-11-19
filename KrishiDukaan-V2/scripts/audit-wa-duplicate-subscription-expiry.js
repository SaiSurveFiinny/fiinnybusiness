/**
 * READ-ONLY audit — duplicate subscription_expiry WhatsApp messages.
 *
 * Does NOT write/modify anything. Pulls waNotifications + subscriptions for the
 * recipient and prints a timeline + the duplicate analysis.
 *
 * Run:  node scripts/audit-wa-duplicate-subscription-expiry.js [phone]
 * Default phone: 917276769367 (WA_TEST_RECIPIENTS)
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "krishidukan-e8315" });
const db = admin.firestore();

const RAW = process.argv[2] || "917276769367";
function variants(p) {
  const d = p.replace(/\D/g, "");
  const ten = d.startsWith("91") ? d.slice(2) : d;
  return Array.from(new Set([p, d, ten, `91${ten}`, `+91${ten}`, `+${d}`]));
}
const V = variants(RAW);

// 7 Nov 2026, full IST day → UTC
const dayStart = new Date("2026-11-06T18:30:00.000Z"); // 7 Nov 00:00 IST
const dayEnd = new Date("2026-11-07T18:30:00.000Z"); // 8 Nov 00:00 IST
const fmt = (ts) =>
  ts && ts.toDate
    ? ts.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }) + " IST"
    : String(ts);

(async () => {
  console.log("Recipient variants:", V.join(", "));
  console.log("Window: 7 Nov 2026 IST (full day)\n");

  // ── waNotifications for this recipient on 7 Nov ──────────────────────────
  const seen = new Map();
  for (const ph of V) {
    const snap = await db
      .collection("waNotifications")
      .where("phone", "==", ph)
      .get();
    snap.forEach((d) => seen.set(d.id, d.data()));
  }

  const ms0 = dayStart.getTime();
  const ms1 = dayEnd.getTime();
  const all = Array.from(seen.entries())
    .map(([id, d]) => ({ id, ...d }))
    .filter((d) => {
      const t = d.createdAt?.toMillis?.() ?? 0;
      return t >= ms0 && t <= ms1;
    });
  const subExp = all.filter((d) => d.template === "subscription_expiry");
  subExp.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

  console.log(`=== waNotifications on 7 Nov: ${all.length} total, ${subExp.length} subscription_expiry ===\n`);

  const statusCounts = {};
  const srcEvents = {};
  const entityIds = {};
  for (const d of subExp) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    const ev = d.source?.event ?? "(none)";
    srcEvents[ev] = (srcEvents[ev] || 0) + 1;
    const eid = d.source?.entityId ?? "(none)";
    entityIds[eid] = (entityIds[eid] || 0) + 1;

    console.log(`doc ${d.id}`);
    console.log(`  phone        : ${d.phone}`);
    console.log(`  template     : ${d.template}`);
    console.log(`  status       : ${d.status}   retryCount=${d.retryCount}/${d.maxRetries}`);
    console.log(`  metaMessageId: ${d.metaMessageId}`);
    console.log(`  source.event : ${ev}`);
    console.log(`  source.entity: ${d.source?.entityType}/${eid}`);
    console.log(`  createdAt    : ${fmt(d.createdAt)}`);
    console.log(`  sentAt       : ${fmt(d.sentAt)}`);
    console.log(`  deliveredAt  : ${fmt(d.deliveredAt)}`);
    console.log(`  readAt       : ${fmt(d.readAt)}`);
    console.log(`  failedAt     : ${fmt(d.failedAt)}`);
    console.log(`  lastError    : ${d.lastError ?? "—"}`);
    console.log(`  payload      : ${JSON.stringify(d.payload)}`);
    console.log("");
  }

  console.log("── Summary ──");
  console.log("status counts   :", JSON.stringify(statusCounts));
  console.log("source.event    :", JSON.stringify(srcEvents));
  console.log("source.entityId :", JSON.stringify(entityIds));
  console.log("distinct metaMessageIds:", new Set(subExp.map((d) => d.metaMessageId).filter(Boolean)).size);
  console.log("");

  // ── subscriptions owned by this recipient ────────────────────────────────
  const subs = new Map();
  for (const field of ["ownerPhone", "ownerId"]) {
    for (const ph of V) {
      const snap = await db.collection("subscriptions").where(field, "==", ph).get();
      snap.forEach((d) => subs.set(d.id, d.data()));
    }
  }
  const subList = Array.from(subs.entries()).map(([id, d]) => ({ id, ...d }));
  const active = subList.filter((s) => s.subscriptionStatus === "active");
  console.log(`=== subscriptions for recipient: ${subList.length} total, ${active.length} active ===\n`);
  for (const s of subList) {
    console.log(`sub ${s.id}`);
    console.log(`  status        : ${s.subscriptionStatus}`);
    console.log(`  ownerPhone    : ${s.ownerPhone}   ownerId=${s.ownerId}`);
    console.log(`  expiryDate    : ${fmt(s.expiryDate)}`);
    console.log(`  reminderSent2d: ${s.reminderSent2d}`);
    console.log(`  isPromotional : ${s.isPromotional}   seats=${s.seatsPurchased}`);
    console.log("");
  }

  process.exit(0);
})().catch((e) => {
  console.error("AUDIT FAILED:", e.message);
  process.exit(1);
});
