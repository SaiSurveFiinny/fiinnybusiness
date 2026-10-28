import { NextResponse } from "next/server";
import { httpStatusFor, resolveSellerAccess } from "../../../lib/seller-access";

/**
 * Shared server-side gate for the seller dashboard. This is the enforcement
 * point for the retailer/manufacturer paywall: access is decided by a verified
 * token + an active, unexpired subscription (or an assigned seat, for invited
 * retailers) checked HERE — never by the client-held `isPaid` flag or a
 * Razorpay success callback.
 *
 *   401 unauthenticated · 403 not a seller · 402 no active subscription
 *   200 active → { status, role, subscription }
 */
export async function GET(request: Request) {
  const access = await resolveSellerAccess(request);

  if (access.status !== "active") {
    return NextResponse.json(
      { status: access.status, needsSubscription: access.status === "no-subscription" },
      { status: httpStatusFor(access.status) },
    );
  }

  return NextResponse.json({
    status: "active",
    role: access.role,
    subscription: {
      expiry: access.expiry ? access.expiry.toISOString() : null,
    },
  });
}
