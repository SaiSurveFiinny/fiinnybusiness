import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

import { db, storage } from "../../firebase";

export type ReelDoc = {
  id: string;
  shopOwnerId: string;
  shopName: string;
  shopProfilePic?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  linkedProductId?: string;
  linkedProductName?: string;
  linkedProductImageUrl?: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: Date | null;
};

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timestampToDate(value: unknown): Date | null {
  const t = value as Timestamp;
  return typeof t?.toDate === "function" ? t.toDate() : null;
}

function mapReel(id: string, data: Record<string, unknown>): ReelDoc {
  return {
    id,
    shopOwnerId: String(data.shopOwnerId ?? ""),
    shopName: String(data.shopName ?? ""),
    shopProfilePic: data.shopProfilePic ? String(data.shopProfilePic) : undefined,
    videoUrl: String(data.videoUrl ?? ""),
    thumbnailUrl: data.thumbnailUrl ? String(data.thumbnailUrl) : undefined,
    title: String(data.title ?? ""),
    caption: String(data.caption ?? ""),
    linkedProductId: data.linkedProductId ? String(data.linkedProductId) : undefined,
    linkedProductName: data.linkedProductName ? String(data.linkedProductName) : undefined,
    linkedProductImageUrl: data.linkedProductImageUrl ? String(data.linkedProductImageUrl) : undefined,
    likesCount: toNum(data.likesCount),
    commentsCount: toNum(data.commentsCount),
    viewsCount: toNum(data.viewsCount),
    createdAt: timestampToDate(data.createdAt),
  };
}

export async function fetchMyReels(phone: string): Promise<ReelDoc[]> {
  const q = query(
    collection(db, "reels"),
    where("shopOwnerId", "==", phone),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapReel(d.id, d.data()));
}

/** Admin-only: every reel, newest first, no ownership filter. */
export async function fetchAllReels(): Promise<ReelDoc[]> {
  const q = query(collection(db, "reels"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapReel(d.id, d.data()));
}

/** Reels-eligible products for a seller's own linked-product picker (dual-field ownership per schema). */
export async function fetchSellerProductsForPicker(
  phone: string,
): Promise<{ id: string; name: string; image: string }[]> {
  const fields = ["retailerPhone", "ownerId", "ownerPhone"];
  const snaps = await Promise.all(
    fields.map((field) => getDocs(query(collection(db, "products"), where(field, "==", phone)))),
  );
  const byId = new Map<string, { id: string; name: string; image: string }>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (byId.has(d.id)) continue;
      const data = d.data() as Record<string, unknown>;
      const images = Array.isArray(data.images) ? (data.images as string[]) : [];
      byId.set(d.id, {
        id: d.id,
        name: String(data.name ?? ""),
        image: images[0] || String(data.image ?? ""),
      });
    }
  }
  return Array.from(byId.values());
}

/** Uploads video (+ optional thumbnail) to Storage under reels/{docId}/, matching the mobile app's path layout. */
export async function uploadReelMedia(
  docId: string,
  videoFile: File,
  thumbBlob: Blob | null,
): Promise<{ videoUrl: string; thumbnailUrl?: string }> {
  const videoSnap = await uploadBytes(storageRef(storage, `reels/${docId}/video.mp4`), videoFile, {
    contentType: videoFile.type || "video/mp4",
  });
  const videoUrl = await getDownloadURL(videoSnap.ref);

  let thumbnailUrl: string | undefined;
  if (thumbBlob) {
    const thumbSnap = await uploadBytes(storageRef(storage, `reels/${docId}/thumb.jpg`), thumbBlob, {
      contentType: "image/jpeg",
    });
    thumbnailUrl = await getDownloadURL(thumbSnap.ref);
  }

  return { videoUrl, thumbnailUrl };
}

export type CreateReelInput = {
  shopOwnerId: string;
  shopName: string;
  shopProfilePic?: string;
  title: string;
  caption: string;
  linkedProductId?: string;
  linkedProductName?: string;
  linkedProductImageUrl?: string;
  videoFile: File;
  thumbBlob: Blob | null;
};

/** Pre-allocates the doc id (so the Storage path can embed it) then writes video + Firestore doc. */
export async function createReel(input: CreateReelInput): Promise<string> {
  const docRef = doc(collection(db, "reels"));
  const { videoUrl, thumbnailUrl } = await uploadReelMedia(docRef.id, input.videoFile, input.thumbBlob);

  const clean = Object.fromEntries(
    Object.entries({
      shopOwnerId: input.shopOwnerId,
      shopName: input.shopName,
      shopProfilePic: input.shopProfilePic,
      videoUrl,
      thumbnailUrl,
      title: input.title,
      caption: input.caption,
      linkedProductId: input.linkedProductId,
      linkedProductName: input.linkedProductName,
      linkedProductImageUrl: input.linkedProductImageUrl,
      likesCount: 0,
      commentsCount: 0,
      viewsCount: 0,
      createdAt: serverTimestamp(),
    }).filter(([, v]) => v !== undefined),
  );

  await setDoc(docRef, clean);
  return docRef.id;
}

export type UpdateReelInput = {
  title: string;
  caption: string;
  linkedProductId?: string;
  linkedProductName?: string;
  linkedProductImageUrl?: string;
};

/**
 * Mirrors the mobile app's updateReel field set exactly — only touches these
 * five fields so mobile-only fields (taggedShops, filterId, overlayText, etc)
 * on a reel created via mobile are never clobbered by a web edit.
 */
export async function updateReel(id: string, input: UpdateReelInput): Promise<void> {
  await updateDoc(doc(db, "reels", id), {
    title: input.title,
    caption: input.caption,
    linkedProductId: input.linkedProductId ?? null,
    linkedProductName: input.linkedProductName ?? null,
    linkedProductImageUrl: input.linkedProductImageUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReel(id: string): Promise<void> {
  await deleteDoc(doc(db, "reels", id));
  await deleteObject(storageRef(storage, `reels/${id}/video.mp4`)).catch(() => {});
  await deleteObject(storageRef(storage, `reels/${id}/thumb.jpg`)).catch(() => {});
}
