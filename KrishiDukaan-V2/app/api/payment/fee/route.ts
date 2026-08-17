/**
 * POST /api/payment/fee — the real payment-gateway charge on one order.
 *
 * The seller's payout is `order total − gateway fee`, with a ₹0 KrishiDukan
 * commission. Showing that honestly needs Razorpay's ACTUAL fee, which is not
 * in the payment-success payload the client sees — it only appears on the
 * payment entity after capture. So it is fetched here with the key secret and
 * cached onto the order doc, which also gives reconciliation a stored number
 * rather than a recomputed guess.
 *
 * Authorisation: the caller must be the seller on that order (or an admin).
 * Fee data is business-sensitive and this route runs with the key secret, so
 * it verifies a Firebase ID token rather than trusting anything in the body.
 */
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Razorpay returns paise; the order docs store rupees. */
const toRupees = (paise: unknown): number =>
  typeof paise === "number" ? Math.round(paise) / 100 : 0;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, any>;
    const callerPhone = String(decoded.phone_number ?? "").trim();

    // Admins can see any order's fee; everyone else must own the sale.
    let isAdmin = false;
    try {
      const userSnap = await db.collection("users").doc(callerPhone || decoded.uid).get();
      isAdmin = String(userSnap.data()?.role ?? "") === "admin";
    } catch {
      /* non-fatal — falls back to the seller check below */
    }

    const isSeller =
      (callerPhone && String(order.sellerPhone ?? "") === callerPhone) ||
      String(order.sellerId ?? "") === decoded.uid ||
      (callerPhone && String(order.sellerId ?? "") === callerPhone);

    if (!isSeller && !isAdmin) {
      return NextResponse.json({ error: "Not your order" }, { status: 403 });
    }

    // Already cached — Razorpay's fee never changes once captured.
    if (typeof order.payment?.gatewayFee === "number") {
      return NextResponse.json({
        gatewayFee: order.payment.gatewayFee,
        gatewayTax: order.payment.gatewayTax ?? 0,
        platformFee: 0,
        cached: true,
      });
    }

    const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
    if (!paymentId) {
      // Legacy or unpaid order — no gateway charge to report.
      return NextResponse.json({ gatewayFee: null, gatewayTax: null, platformFee: 0 });
    }

    const payment = await razorpay.payments.fetch(paymentId);

    // `fee` is only populated once the payment is captured; a pending or
    // failed payment has none yet, and caching a 0 would be wrong.
    if (payment.fee == null) {
      return NextResponse.json({ gatewayFee: null, gatewayTax: null, platformFee: 0 });
    }

    const gatewayFee = toRupees(payment.fee);
    const gatewayTax = toRupees(payment.tax);

    await orderRef.update({
      "payment.gatewayFee": gatewayFee,
      "payment.gatewayTax": gatewayTax,
      "payment.feeFetchedAt": new Date().toISOString(),
    });

    return NextResponse.json({ gatewayFee, gatewayTax, platformFee: 0, cached: false });
  } catch (error) {
    console.error("[api/payment/fee] failed:", error);
    return NextResponse.json({ error: "Could not fetch the payment fee" }, { status: 500 });
  }
}
