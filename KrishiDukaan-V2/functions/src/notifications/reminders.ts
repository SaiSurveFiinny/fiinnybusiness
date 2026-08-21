import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { firstPhone, notify } from "../notify";

const db = (): admin.firestore.Firestore => admin.firestore();

/** `YYYY-MM-DD` in IST — the once-per-day dedupe key for both reminders. */
function istDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ─── Incomplete profile ──────────────────────────────────────────────────────

const SELLER_ROLES = ["retailer", "manufacturer"];

/**
 * Fields the app's profile editor asks for. Kept in the same order the form
 * shows them so the reminder names the first thing the user will actually see.
 * Mirrors UserModel.isProfileComplete in the mobile app.
 */
function missingProfileFields(d: Record<string, unknown>): string[] {
  const has = (k: string) => String(d[k] ?? "").trim().length > 0;
  const missing: string[] = [];
  if (!has("name")) missing.push("your name");
  if (!has("businessName")) missing.push("business name");
  if (!has("city") && !has("address")) missing.push("store address");
  if (!has("pincode")) missing.push("pincode");
  return missing;
}

/**
 * Reminds sellers with an incomplete profile, at most once a day, until the
 * profile is complete. `profileReminderOn` on the user doc is the dedupe key,
 * so a retry or a second deploy on the same day cannot double-send.
 */
export const remindIncompleteProfiles = onSchedule(
  { schedule: "0 10 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    const today = istDayKey();
    let sent = 0;

    for (const role of SELLER_ROLES) {
      const snap = await db().collection("users").where("role", "==", role).get();

      for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (d.profileCompleted === true) continue;

        const missing = missingProfileFields(d);
        if (missing.length === 0) continue;
        if (String(d.profileReminderOn ?? "") === today) continue;

        const phone = String(d.phone ?? doc.id).trim();
        if (!phone) continue;

        const list =
          missing.length === 1
            ? missing[0]
            : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

        try {
          await notify(
            phone,
            "profile_incomplete",
            "Complete your profile 📝",
            `Still missing: ${list}. A complete profile helps buyers find your store.`,
            { missing: missing.join("|") }
          );
          await doc.ref.update({ profileReminderOn: today });
          sent++;
        } catch (err) {
          logger.error(`[remindIncompleteProfiles] failed for ${phone}`, err);
        }
      }
    }

    logger.info(`[remindIncompleteProfiles] sent ${sent}`);
  }
);

// ─── Subscription expiry ─────────────────────────────────────────────────────

/** Milestone reminders; below the smallest one it becomes a daily nudge. */
const MILESTONE_DAYS = [10, 5, 3];

/**
 * Duration in months, preferring an explicit field and falling back to the
 * start→expiry span. Admin-created subscriptions do not always store one.
 */
function durationMonths(d: Record<string, unknown>): number {
  for (const key of ["durationMonths", "planMonths", "months"]) {
    const v = d[key];
    if (typeof v === "number" && v > 0) return v;
  }
  const start = d.startDate as admin.firestore.Timestamp | undefined;
  const expiry = d.expiryDate as admin.firestore.Timestamp | undefined;
  if (start && expiry) {
    const days = (expiry.toMillis() - start.toMillis()) / (24 * 60 * 60 * 1000);
    const months = Math.round(days / 30);
    if (months > 0) return months;
  }
  return 1;
}

/**
 * Subscription expiry reminders at 10, 5 and 3 days out, then every day until
 * expiry. The notification carries the seller's current seat count and plan
 * length so the app can open the renewal screen pre-configured — the user only
 * has to pay.
 *
 * Separate from `remindExpiringSubscriptions` in index.ts, which sends the
 * WhatsApp message on its own (2-day) cadence and is left untouched.
 */
export const remindSubscriptionRenewal = onSchedule(
  { schedule: "0 11 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    const today = istDayKey();
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    // Everything expiring within the widest milestone. Single range clause on
    // top of one equality — matches the existing subscriptions index.
    const horizon = admin.firestore.Timestamp.fromMillis(
      now + (Math.max(...MILESTONE_DAYS) + 1) * msPerDay
    );
    const snap = await db()
      .collection("subscriptions")
      .where("subscriptionStatus", "==", "active")
      .where("expiryDate", "<=", horizon)
      .get();

    let sent = 0;
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const expiry = d.expiryDate as admin.firestore.Timestamp | undefined;
      if (!expiry) continue;

      // Whole days remaining; already-expired docs are left to expireSubscriptions.
      const daysLeft = Math.ceil((expiry.toMillis() - now) / msPerDay);
      if (daysLeft < 0) continue;

      const isMilestone = MILESTONE_DAYS.includes(daysLeft);
      const isDailyNudge = daysLeft < Math.min(...MILESTONE_DAYS);
      if (!isMilestone && !isDailyNudge) continue;

      // One reminder per subscription per day, whichever branch matched.
      if (String(d.renewalRemindedOn ?? "") === today) continue;

      const ownerPhone = firstPhone(d.ownerPhone, d.ownerId);
      if (!ownerPhone) continue;

      const seats = Number(d.seatsPurchased) || 1;
      const months = durationMonths(d);

      const when =
        daysLeft === 0
          ? "today"
          : daysLeft === 1
          ? "tomorrow"
          : `in ${daysLeft} days`;

      try {
        await notify(
          ownerPhone,
          "subscription_expiry",
          daysLeft <= 1 ? "Your subscription expires today ⏳" : "Subscription expiring soon ⏳",
          `Your Krishi Dukan plan ends ${when}. Renew now to keep your dashboard and listings live.`,
          {
            subscriptionId: doc.id,
            daysLeft: String(daysLeft),
            seats: String(seats),
            months: String(months),
          }
        );
        await doc.ref.update({ renewalRemindedOn: today });
        sent++;
      } catch (err) {
        logger.error(`[remindSubscriptionRenewal] failed for ${ownerPhone}`, err);
      }
    }

    logger.info(`[remindSubscriptionRenewal] sent ${sent}`);
  }
);
