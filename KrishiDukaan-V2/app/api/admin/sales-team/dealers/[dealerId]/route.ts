import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../../lib/firebase-admin";
import { requireSection } from "../../../../../lib/admin-auth";
import { writeAuditLog, auditMeta } from "../../../../../lib/audit-log-service";

type Params = { params: { dealerId: string } };

// ─── PATCH /api/admin/sales-team/dealers/[dealerId] ──────────────────────────
// Edit a dealer record. Requires the salesDealerEdit section.
// Writes an UPDATE audit log entry in the same request.

export async function PATCH(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesDealerEdit");
  if (caller instanceof NextResponse) return caller;

  const { dealerId } = params;
  if (!dealerId) return NextResponse.json({ error: "Missing dealerId." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { shopName, ownerName, phone, address, type, interest, geo } = body as {
    shopName?: string;
    ownerName?: string;
    phone?: string;
    address?: string;
    type?: string;
    interest?: string;
    geo?: { latitude: number; longitude: number } | null;
  };

  if (!shopName?.trim()) return NextResponse.json({ error: "Shop name is required." }, { status: 400 });
  if (!ownerName?.trim()) return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: "Phone is required." }, { status: 400 });
  if (!address?.trim()) return NextResponse.json({ error: "Address is required." }, { status: 400 });

  const phoneClean = phone.trim().replace(/[\s\-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(phoneClean)) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("dealers").doc(dealerId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Dealer not found." }, { status: 404 });

  const before = snap.data() ?? {};

  const update: Record<string, unknown> = {
    shopName: shopName.trim(),
    ownerName: ownerName.trim(),
    phone: phoneClean,
    address: address.trim(),
    type: type ?? before.type ?? "retailer",
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (interest !== undefined) update.interest = interest || null;
  if (geo !== undefined) {
    update.geo = geo ? { latitude: geo.latitude, longitude: geo.longitude } : null;
  }

  const changedFields = Object.keys(update).filter(
    (k) => k !== "updatedAt" && JSON.stringify(update[k]) !== JSON.stringify(before[k]),
  );

  await ref.update(update);

  // Resolve actor name for the audit log
  const actorDoc = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const actorName = String(actorDoc?.data()?.name ?? actorDoc?.data()?.email ?? caller.uid);

  await writeAuditLog({
    actorId: caller.uid,
    actorName,
    actorRole: actorDoc?.data()?.role ?? "admin",
    action: "UPDATE",
    module: "sales_team",
    entityType: "dealer",
    entityId: dealerId,
    entityName: String(before.shopName ?? ""),
    before,
    after: { ...before, ...update },
    changedFields,
    ...auditMeta(req),
  });

  return NextResponse.json({ success: true, changedFields });
}

// ─── DELETE /api/admin/sales-team/dealers/[dealerId] ─────────────────────────
// Soft-delete a dealer (active: false + deletedAt/deletedBy). Requires salesDealerDelete.

export async function DELETE(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesDealerDelete");
  if (caller instanceof NextResponse) return caller;

  const { dealerId } = params;
  if (!dealerId) return NextResponse.json({ error: "Missing dealerId." }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection("dealers").doc(dealerId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Dealer not found." }, { status: 404 });

  const before = snap.data() ?? {};
  if (before.active === false) {
    return NextResponse.json({ error: "Dealer is already deleted." }, { status: 409 });
  }

  await ref.update({
    active: false,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const actorDoc = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const actorName = String(actorDoc?.data()?.name ?? actorDoc?.data()?.email ?? caller.uid);

  await writeAuditLog({
    actorId: caller.uid,
    actorName,
    actorRole: actorDoc?.data()?.role ?? "admin",
    action: "DELETE",
    module: "sales_team",
    entityType: "dealer",
    entityId: dealerId,
    entityName: String(before.shopName ?? ""),
    before,
    after: null,
    changedFields: ["active", "deletedAt", "deletedBy"],
    ...auditMeta(req),
  });

  return NextResponse.json({ success: true });
}
