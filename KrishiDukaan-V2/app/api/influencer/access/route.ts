import { NextResponse } from "next/server";
import { httpStatusFor, resolveInfluencerAccess } from "../../../lib/influencer-access";

/**
 * Shared server-side gate for every protected influencer page (dashboard AND
 * profile). This is the enforcement point for the paywall: a page must call
 * this and render its content only on 200, so access is decided by a verified
 * token + an active subscription checked HERE — never by a client-held flag or
 * a Razorpay success callback.
 *
 *   401 unauthenticated · 403 not an influencer · 402 no active subscription
 *   200 active → { status, subscription }
 */
export async function GET(request: Request) {
  const access = await resolveInfluencerAccess(request);

  if (access.status !== "active") {
    return NextResponse.json(
      { status: access.status, needsSubscription: access.status === "no-subscription" },
      { status: httpStatusFor(access.status) },
    );
  }

  return NextResponse.json({
    status: "active",
    subscription: {
      planName: access.planName,
      expiry: access.expiry ? access.expiry.toISOString() : null,
    },
  });
}
