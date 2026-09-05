import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import corsLib from 'cors';
import type { Request, Response } from 'express';

// ─── CORS ──────────────────────────────────────────────────────────────────────
// Hosted origins that may call these endpoints directly. Firebase Hosting rewrites
// invoke through a service account (no browser CORS at all), so these origins are
// only needed for local emulator development and direct-URL testing.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://finny-erp-uat.web.app',
  'https://karanarjun-pvt-ltd.web.app',
  'https://fiinny.com',
];

const cors = corsLib({ origin: ALLOWED_ORIGINS, methods: ['POST', 'OPTIONS'] });

// ─── Credentials (lazy) ────────────────────────────────────────────────────────
// Resolved inside each handler — never at module load — so the deploy-time local
// analysis step (which runs without env vars) doesn't crash on startup.
function getKeyId(): string {
  const v = process.env.RAZORPAY_KEY_ID;
  if (!v) throw httpError(500, 'Payment gateway not configured (RAZORPAY_KEY_ID missing)');
  return v;
}
function getKeySecret(): string {
  const v = process.env.RAZORPAY_KEY_SECRET;
  if (!v) throw httpError(500, 'Payment gateway not configured (RAZORPAY_KEY_SECRET missing)');
  return v;
}
function getRazorpay(): Razorpay {
  return new Razorpay({ key_id: getKeyId(), key_secret: getKeySecret() });
}

// ─── Plan catalogue ───────────────────────────────────────────────────────────
const PLAN_AMOUNTS: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 999,  yearly: 9990  },
  growth:  { monthly: 1999, yearly: 19990 },
  pro:     { monthly: 2999, yearly: 29990 },
};

const PRICING_TO_PLAN_ID: Record<string, string> = {
  starter: 'retailer',
  growth:  'distributor',
  pro:     'manufacturer',
};

const PLAN_MODULE_MAP: Record<string, string[]> = {
  starter: ['fast_checkout', 'vpay', 'whatsapp_integration', 'cash_drawer'],
  growth: [
    'fast_checkout', 'vpay', 'whatsapp_integration', 'cash_drawer',
    'cash_tender', 'multiple_payment_modes', 'customer_feedback',
    'returns_exchanges', 'loyalty', 'multiple_billing_counters',
  ],
  pro: [
    'fast_checkout', 'vpay', 'whatsapp_integration', 'cash_drawer',
    'cash_tender', 'multiple_payment_modes', 'customer_feedback',
    'returns_exchanges', 'loyalty', 'multiple_billing_counters',
    'weight_scale', 'multi_bill_tabs', 'offline_pos', 'vcheckout',
    'image_based_pos', 'in_store_online_orders',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function httpError(status: number, msg: string): HttpError {
  return new HttpError(status, msg);
}

/** Verify the Firebase ID token from the Authorization header. */
async function authenticate(req: Request): Promise<admin.auth.DecodedIdToken> {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError(401, 'Missing or malformed Authorization header');
  const token = header.slice(7);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    throw httpError(401, 'Invalid or expired ID token');
  }
}

/** Verify the caller's tenantId matches the one stored in Firestore. */
async function assertTenantOwnership(uid: string, claimedTenantId: string): Promise<void> {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (snap.data()?.tenantId !== claimedTenantId) {
    throw httpError(403, 'Caller does not belong to the specified tenant');
  }
}

async function activatePlanModules(tenantId: string, pricingTier: string, expiry: Date): Promise<void> {
  const modules = PLAN_MODULE_MAP[pricingTier] ?? [];
  if (!modules.length) return;
  const batch = admin.firestore().batch();
  for (const moduleId of modules) {
    batch.set(admin.firestore().doc(`tenants/${tenantId}/modules/${moduleId}`), {
      moduleId,
      status: 'active',
      billingCycle: 'plan_included',
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiry),
    }, { merge: true });
  }
  await batch.commit();
}

/** Wrap a handler with CORS + unified error handling. Returns an onRequest function. */
function withCors(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    cors(req, res, async () => {
      try {
        await handler(req, res);
      } catch (err) {
        if (err instanceof HttpError) {
          res.status(err.status).json({ error: err.message });
        } else {
          functions.logger.error('[payments] Unhandled error', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });
  };
}

// ─── getSaaSSubscription ──────────────────────────────────────────────────────
export const getSaaSSubscription = functions
  .region('asia-south1')
  .https.onRequest(withCors(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const decoded = await authenticate(req);
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) throw httpError(400, 'Missing tenantId');

    const snap = await admin.firestore().doc(`tenantSubscriptions/${tenantId}`).get();
    if (!snap.exists) { res.json({ plan: 'free', status: 'none', expiryAt: null }); return; }
    const sub = snap.data()!;
    // Silence unused variable warning (decoded used for auth side-effect)
    void decoded;
    res.json({
      plan: sub.planId ?? 'free',
      status: sub.status ?? 'none',
      expiryAt: sub.expiresAt ? (sub.expiresAt as admin.firestore.Timestamp).toDate().toISOString() : null,
    });
  }));

// ─── createSaaSOrder ──────────────────────────────────────────────────────────
// Creates a Razorpay order. Returns order_id + the PUBLIC key_id only.
// The secret key never leaves this function.
export const createSaaSOrder = functions
  .region('asia-south1')
  .https.onRequest(withCors(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const decoded = await authenticate(req);

    const { plan, cycle, tenantId } = req.body as {
      plan?: string; cycle?: string; tenantId?: string;
    };
    if (!plan || !cycle || !tenantId) throw httpError(400, 'Missing required parameters: plan, cycle, tenantId');

    const planAmounts = PLAN_AMOUNTS[plan];
    if (!planAmounts) throw httpError(400, `Unknown plan: ${plan}`);
    if (cycle !== 'monthly' && cycle !== 'yearly') throw httpError(400, `Unknown billing cycle: ${cycle}`);

    await assertTenantOwnership(decoded.uid, tenantId);

    const amountInPaise = (cycle === 'yearly' ? planAmounts.yearly : planAmounts.monthly) * 100;
    const rzp = getRazorpay();

    try {
      const order = await rzp.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${tenantId}_${Date.now()}`.substring(0, 40),
        notes: { tenantId, plan, cycle },
      });
      res.json({ order_id: order.id, key_id: getKeyId(), amount: order.amount });
    } catch (err: any) {
      functions.logger.error('[payments] Razorpay order creation failed', err);
      throw httpError(500, 'Could not create Razorpay order');
    }
  }));

// ─── verifySaaSPayment ────────────────────────────────────────────────────────
// Validates the Razorpay signature server-side (HMAC-SHA256), then writes the
// subscription to Firestore. The client never writes subscription data.
export const verifySaaSPayment = functions
  .region('asia-south1')
  .https.onRequest(withCors(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const decoded = await authenticate(req);

    const {
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      plan, cycle, tenantId,
    } = req.body as {
      razorpay_order_id?: string; razorpay_payment_id?: string;
      razorpay_signature?: string; plan?: string; cycle?: string; tenantId?: string;
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan || !cycle || !tenantId) {
      throw httpError(400, 'Missing verification parameters');
    }

    await assertTenantOwnership(decoded.uid, tenantId);

    // ── Strict HMAC-SHA256 — no bypass, no fallback, fail closed ─────────────
    const expectedSig = crypto
      .createHmac('sha256', getKeySecret())
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      functions.logger.warn('[payments] Signature mismatch', { tenantId, razorpay_order_id });
      throw httpError(400, 'Payment signature verification failed');
    }

    // ── Write subscription ────────────────────────────────────────────────────
    const durationDays = cycle === 'yearly' ? 365 : 30;
    const now = new Date();
    const expiry = new Date(now.getTime());
    expiry.setDate(expiry.getDate() + durationDays);

    const catalogPlanId = PRICING_TO_PLAN_ID[plan] ?? plan;
    const db = admin.firestore();

    // 1. tenantSubscriptions/{tenantId} — Phase 2A source of truth
    await db.doc(`tenantSubscriptions/${tenantId}`).set({
      tenantId, planId: catalogPlanId, status: 'active',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiry),
      assignedBy: `razorpay:${razorpay_payment_id}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 2. tenants/{tenantId} — backward-compat mirror
    await db.doc(`tenants/${tenantId}`).set({
      plan: catalogPlanId, planStatus: 'active',
      planExpiryAt: admin.firestore.Timestamp.fromDate(expiry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 3. posModule add-ons
    await activatePlanModules(tenantId, plan, expiry);

    functions.logger.info('[payments] Subscription activated', {
      tenantId, catalogPlanId, cycle, razorpay_payment_id,
    });
    res.json({ success: true, planId: catalogPlanId });
  }));
