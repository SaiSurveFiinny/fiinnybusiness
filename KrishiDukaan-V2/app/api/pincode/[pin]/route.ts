import { NextRequest, NextResponse } from "next/server";
import { pincodeInfo } from "../../../lib/pincode-info";

/**
 * GET /api/pincode/{pin} → { pincode, city, district, state, areas[] }
 *
 * Fills the checkout address from the pincode (web cart and app checkout), so
 * the customer types only their area/locality. Source: India Post's public
 * pincode directory, cached in Firestore and memory (lib/pincode-info.ts).
 * 404 when the pincode doesn't exist; the form then stays editable as before.
 */
export async function GET(_req: NextRequest, { params }: { params: { pin: string } }) {
  const pin = String(params.pin ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(pin)) {
    return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }
  const headers = { "Cache-Control": "public, max-age=86400, s-maxage=604800" };
  try {
    const info = await pincodeInfo(pin);
    if (!info) return NextResponse.json({ error: "Pincode not found." }, { status: 404 });
    return NextResponse.json(info, { headers });
  } catch (e) {
    console.warn("[pincode] lookup failed", pin, e);
    return NextResponse.json({ error: "Pincode lookup is unavailable. Please type the address." }, { status: 503 });
  }
}
