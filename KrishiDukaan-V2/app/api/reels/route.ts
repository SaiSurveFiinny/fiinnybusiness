import { NextResponse } from "next/server";
import { getAdminDb } from "../../lib/firebase-admin";

export const dynamic = "force-dynamic";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "krishidukan-e8315";
const FIRESTORE_REST_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

async function fetchReelsViaREST(limitCount: number) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: "reels" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit: limitCount,
    },
  };

  const res = await fetch(FIRESTORE_REST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Firestore REST API returned status ${res.status}`);
  }

  const rows: any[] = await res.json();

  return rows
    .filter((r) => r.document)
    .map((r) => {
      const fields = r.document.fields ?? {};
      const str = (f: any) => f?.stringValue ?? "";
      const num = (f: any) => Number(f?.integerValue ?? f?.doubleValue ?? 0);

      return {
        id: r.document.name.split("/").pop(),
        shopOwnerId: str(fields.shopOwnerId),
        shopName: str(fields.shopName),
        videoUrl: str(fields.videoUrl),
        thumbnailUrl: str(fields.thumbnailUrl) || null,
        title: str(fields.title),
        caption: str(fields.caption),
        viewsCount: num(fields.viewsCount),
        likesCount: num(fields.likesCount),
        commentsCount: num(fields.commentsCount),
      };
    });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitCount = parseInt(url.searchParams.get("limit") || "10", 10);

  // 1. Try Firebase Admin SDK first
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("reels")
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();

    const reels = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        shopOwnerId: data.shopOwnerId ?? "",
        shopName: data.shopName ?? "",
        videoUrl: data.videoUrl ?? "",
        thumbnailUrl: data.thumbnailUrl ?? null,
        title: data.title ?? "",
        caption: data.caption ?? "",
        viewsCount: data.viewsCount ?? 0,
        likesCount: data.likesCount ?? 0,
        commentsCount: data.commentsCount ?? 0,
      };
    });

    return NextResponse.json({ reels });
  } catch (adminErr) {
    // 2. If Admin SDK fails (e.g. gcloud ADC token expired / invalid_rapt), fallback gracefully to Firestore REST API
    try {
      const reels = await fetchReelsViaREST(limitCount);
      return NextResponse.json({ reels });
    } catch (restErr) {
      console.error("GET /api/reels fallback error:", restErr);
      return NextResponse.json({ reels: [] });
    }
  }
}
