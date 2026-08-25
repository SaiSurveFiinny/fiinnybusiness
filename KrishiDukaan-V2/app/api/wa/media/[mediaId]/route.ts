import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";

const GRAPH_API_VERSION = "v20.0";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
): Promise<NextResponse> {
  const caller = await requireAdmin(req);
  if (caller instanceof NextResponse) return caller;

  const { mediaId } = await params;
  if (!mediaId) {
    return NextResponse.json({ error: "Missing mediaId" }, { status: 400 });
  }

  const accessToken = process.env.WA_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "WA_ACCESS_TOKEN not configured" }, { status: 500 });
  }

  // Step 1: Retrieve the media URL from Meta Graph API
  let downloadUrl: string;
  let contentType: string;
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (metaRes.status === 404 || metaRes.status === 400) {
      return NextResponse.json({ error: "Media not found or expired" }, { status: 410 });
    }
    if (!metaRes.ok) {
      const body = await metaRes.text().catch(() => "");
      console.error(`[WA Media] Meta URL lookup failed ${metaRes.status}:`, body.slice(0, 200));
      return NextResponse.json({ error: "Media unavailable" }, { status: 502 });
    }

    const metaData = (await metaRes.json()) as { url: string; mime_type?: string };
    downloadUrl = metaData.url;
    contentType = metaData.mime_type ?? "image/jpeg";
  } catch (err) {
    console.error("[WA Media] Meta URL lookup threw:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Media lookup failed" }, { status: 502 });
  }

  // Step 2: Download the actual media bytes from Meta's CDN
  try {
    const mediaRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mediaRes.ok) {
      console.error(`[WA Media] Media download failed ${mediaRes.status} for ${mediaId}`);
      return NextResponse.json({ error: "Media download failed" }, { status: 502 });
    }

    const buffer = await mediaRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache privately for 1 hour — Meta media URLs are short-lived but the
        // bytes themselves don't change. Revalidate after to catch expirations.
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=60",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[WA Media] Media download threw:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Media download failed" }, { status: 502 });
  }
}
