import { NextResponse } from "next/server";
import { getAdminDb } from "../../lib/firebase-admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitCount = parseInt(url.searchParams.get("limit") || "4", 10);

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
  } catch (err) {
    console.error("GET /api/reels error:", err);
    return NextResponse.json({ reels: [] }, { status: 500 });
  }
}
