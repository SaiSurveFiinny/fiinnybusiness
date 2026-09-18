/**
 * Generates a poster frame for reels that have none.
 *
 * WHY THIS EXISTS
 * ---------------
 * transcodeReel makes a thumbnail as part of optimizing a fresh upload, and
 * backfillReelTranscodes can re-run that for a reel whose original source is
 * still in Storage. Neither can help a reel that is already optimized but has
 * no poster — the original was deleted after the encode, and the thumbnail
 * step either failed or predates the feature. backfillReelTranscodes reports
 * those as `posterlessWithoutSource` and explicitly leaves them to "a separate
 * job". This is that job.
 *
 * Those reels are what a user sees as "thumbnails not loading": the web feed
 * renders a <video> with no src outside its warm window, so with no poster it
 * is a black rectangle, and the app's reel cards have no image to draw.
 *
 * HOW IT WORKS
 * ------------
 * No re-encode. It downloads whichever video object the reel has (optimized
 * preferred, original as a fallback), extracts a single frame with the same
 * ffmpeg invocation transcodeReel uses, uploads it as reels/{id}/thumb.jpg and
 * writes thumbnailUrl on the doc. A few MB in, one JPEG out.
 *
 * SAFETY — same posture as backfillReelTranscodes
 * -----------------------------------------------
 * Admin only. dryRun is the DEFAULT: call once for the list, again with
 * dryRun:false to act. Small hard-capped batches so the cost of a run is
 * always observable. Idempotent: a reel that already has a thumbnailUrl is
 * never touched, so re-running cannot redo finished work.
 */
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { unlink } from "fs/promises";
import ffmpegPath from "ffmpeg-static";
import { run, downloadUrl } from "./transcodeReel";
import { callerIsAdmin } from "./backfillReelTranscodes";

const OUTPUT_NAME = "video_optimized.mp4";
const SOURCE_NAME = "video.mp4";
const THUMB_NAME = "thumb.jpg";
/** Same width transcodeReel scales posters to, so a backfilled thumb is
 *  indistinguishable from a freshly generated one. */
const THUMB_WIDTH = 720;
/** Marker transcodeReel checks so its own outputs never re-trigger it. */
const PROCESSED_MARKER = "reelOptimized";

const MAX_BATCH = 50;
const DEFAULT_BATCH = 10;

interface ThumbnailReport {
  dryRun: boolean;
  /** Reels with no thumbnailUrl at the start of this run. */
  pending: number;
  /** Reels given a poster on this run (empty when dryRun). */
  repaired: string[];
  /** Reels with no thumbnail AND no video object at all — nothing to frame. */
  noVideo: string[];
  /** Reels whose frame extraction or upload failed this run; retried next time. */
  failed: string[];
  remainingAfterThisRun: number;
}

export const backfillReelThumbnails = onCall(
  {
    // Extracting one frame is light, but each reel still means downloading a
    // multi-MB video to /tmp first — give it room.
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async (request): Promise<ThumbnailReport> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    if (!(await callerIsAdmin(uid, request.auth?.token?.phone_number as string))) {
      throw new HttpsError("permission-denied", "Admins only.");
    }
    if (!ffmpegPath) {
      throw new HttpsError("failed-precondition", "ffmpeg binary not available.");
    }

    const dryRun = request.data?.dryRun !== false;
    const requested = Number(request.data?.limit ?? DEFAULT_BATCH);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_BATCH, 1),
      MAX_BATCH,
    );

    const db = admin.firestore();
    const bucket = request.data?.bucket
      ? admin.storage().bucket(String(request.data.bucket))
      : admin.storage().bucket();
    const bucketName = bucket.name;

    // Every reel missing a poster. `select` keeps the read to one field.
    const reelDocs = await db.collection("reels").select("thumbnailUrl").get();
    const pending = reelDocs.docs
      .filter((d) => !d.data()?.thumbnailUrl)
      .map((d) => d.id);

    const repaired: string[] = [];
    const noVideo: string[] = [];
    const failed: string[] = [];

    if (!dryRun) {
      for (const reelId of pending.slice(0, limit)) {
        // Optimized first — it's what the feed plays, so the frame matches what
        // the user sees. The original is only there if the encode never ran.
        let videoPath: string | null = null;
        for (const name of [OUTPUT_NAME, SOURCE_NAME]) {
          const [exists] = await bucket.file(`reels/${reelId}/${name}`).exists();
          if (exists) {
            videoPath = `reels/${reelId}/${name}`;
            break;
          }
        }
        if (!videoPath) {
          noVideo.push(reelId);
          continue;
        }

        const localVideo = join(tmpdir(), `${reelId}-thumbsrc.mp4`);
        const localThumb = join(tmpdir(), `${reelId}-thumb.jpg`);
        try {
          await bucket.file(videoPath).download({ destination: localVideo });

          // Identical frame selection to transcodeReel's poster step.
          await run(ffmpegPath, [
            "-i", localVideo,
            "-ss", "00:00:01",
            "-vframes", "1",
            "-vf", `scale=${THUMB_WIDTH}:-2`,
            "-q:v", "5",
            "-y", localThumb,
          ]);

          const token = randomUUID();
          const thumbPath = `reels/${reelId}/${THUMB_NAME}`;
          await bucket.upload(localThumb, {
            destination: thumbPath,
            metadata: {
              contentType: "image/jpeg",
              cacheControl: "public, max-age=31536000, immutable",
              metadata: {
                [PROCESSED_MARKER]: "true",
                firebaseStorageDownloadTokens: token,
              },
            },
          });

          await db.doc(`reels/${reelId}`).update({
            thumbnailUrl: downloadUrl(bucketName, thumbPath, token),
            thumbnailBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          repaired.push(reelId);
          logger.info("[backfill-thumbs] poster generated", { reelId, from: videoPath });
        } catch (err) {
          // One bad reel must not end the run; it stays pending for next time.
          failed.push(reelId);
          logger.error("[backfill-thumbs] failed", {
            reelId,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          await Promise.all(
            [localVideo, localThumb].map((f) => unlink(f).catch(() => undefined)),
          );
        }
      }
    }

    const report: ThumbnailReport = {
      dryRun,
      pending: pending.length,
      repaired,
      noVideo,
      failed,
      remainingAfterThisRun: pending.length - repaired.length,
    };

    logger.info("[backfill-thumbs] run complete", {
      dryRun,
      pending: report.pending,
      repaired: repaired.length,
      noVideo: noVideo.length,
      failed: failed.length,
      remaining: report.remainingAfterThisRun,
    });

    return report;
  },
);
