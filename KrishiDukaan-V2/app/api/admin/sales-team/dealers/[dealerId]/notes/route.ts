import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../lib/firebase-admin";
import { requireSection } from "../../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

// GET /api/admin/sales-team/dealers/[dealerId]/notes
// Returns dealer notes from the `dealerNotes` collection, newest first.
// Query params:
//   limit   — rows per page (default 30, max 100)
//   cursor  — doc ID to start after (for next-page)
type Params = { params: { dealerId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesTeam");
  if (caller instanceof NextResponse) return caller;

  const { dealerId } = params;
  if (!dealerId) return NextResponse.json({ error: "Missing dealerId." }, { status: 400 });

  const url = new URL(req.url);
  const pageSize = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
  const cursor = url.searchParams.get("cursor");

  const db = getAdminDb();

  let q = db
    .collection("dealerNotes")
    .where("dealerId", "==", dealerId)
    .orderBy("createdAt", "desc") as FirebaseFirestore.Query;

  if (cursor) {
    const cursorDoc = await db.collection("dealerNotes").doc(cursor).get();
    if (cursorDoc.exists) q = q.startAfter(cursorDoc);
  }

  q = q.limit(pageSize + 1);

  const snap = await q.get();
  const hasMore = snap.size > pageSize;
  const docs = snap.docs.slice(0, pageSize);

  const notes = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      dealerId: data.dealerId ?? "",
      salesExecutiveId: data.salesExecutiveId ?? "",
      note: data.note ?? "",
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  const nextCursor = hasMore ? docs[docs.length - 1]?.id ?? null : null;
  return NextResponse.json({ notes, nextCursor, hasMore });
}
