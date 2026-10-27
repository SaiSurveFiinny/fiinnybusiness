"use client";

import { auth } from "../../firebase";
import {
  MAX_TRACKING_SENDS,
  TRACKING_ID_TYPES,
  trackingIdTypeLabel,
  type OrderDoc,
  type TrackingIdType,
} from "../../../types/order";

export { MAX_TRACKING_SENDS, TRACKING_ID_TYPES, trackingIdTypeLabel };
export type { TrackingIdType };

/**
 * The editable shipment-tracking fields collected in the dispatch / tracking
 * modals. `customLabel` is only meaningful when `idType === "other"`.
 */
export type TrackingDraft = {
  url: string;
  idType: TrackingIdType;
  customLabel: string;
  id: string;
};

/** A blank draft, pre-filled from an order's saved tracking when present. */
export function emptyTrackingDraft(order?: Pick<OrderDoc, "tracking">): TrackingDraft {
  const t = order?.tracking;
  return {
    url: t?.url ?? "",
    idType: t?.idType ?? "awb",
    customLabel: t?.idType === "other" ? t?.idTypeLabel ?? "" : "",
    id: t?.id ?? "",
  };
}

/**
 * Client-side mirror of the server's send-time checks (the server stays
 * authoritative). Returns the first validation message, or null when the draft
 * is ready to send. Trimming matches the server so the UI never shows "valid"
 * for whitespace-only input.
 */
export function trackingDraftError(d: TrackingDraft): string | null {
  if (!isValidTrackingUrl(d.url)) return "Enter a valid http(s) tracking link.";
  if (d.idType === "other" && !d.customLabel.trim()) return "Enter a label for the custom tracking ID type.";
  if (!d.id.trim()) return "Enter the tracking ID.";
  return null;
}

/** Client-side mirror of the server's URL check (server remains authoritative). */
export function isValidTrackingUrl(raw: string | undefined | null): boolean {
  if (!raw || !raw.trim()) return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Successful sends recorded on the order so far. */
export function trackingSendsUsed(order: Pick<OrderDoc, "tracking">): number {
  return order.tracking?.sends?.length ?? 0;
}

export function trackingSendsRemaining(order: Pick<OrderDoc, "tracking">): number {
  return Math.max(0, MAX_TRACKING_SENDS - trackingSendsUsed(order));
}

/** UI hint only — the server (ORDER_TRACKING_LINK_ENABLED) is authoritative. */
export function isTrackingSendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORDER_TRACKING_LINK_ENABLED !== "false";
}

export type TrackingApiResult = {
  ok: true;
  saved: boolean;
  sent: boolean;
  duplicate?: boolean;
  metaMessageId?: string;
  sendsUsed: number;
  sendsRemaining: number;
};

/**
 * Calls POST /api/orders/tracking. `requestId` is generated here so repeated
 * clicks of the same action reuse one key and the server treats them as one
 * idempotent request.
 */
export async function callTrackingApi(args: {
  orderId: string;
  url?: string;
  idType?: TrackingIdType;
  /** Custom label, sent only when idType === "other". */
  idLabel?: string;
  id?: string;
  send: boolean;
  requestId: string;
}): Promise<TrackingApiResult> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/orders/tracking", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not update the tracking link.");
  return json as TrackingApiResult;
}

/** A fresh idempotency key for one logical send action. */
export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
