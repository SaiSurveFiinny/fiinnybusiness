import {
  collection,
  getCountFromServer,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { db } from "../../../firebase";
import type { EnquiryStatus } from "../../../dashboard/_lib/enquiries-firestore";

/**
 * Admin-facing reads over the SAME `enquiries` collection the seller dashboard
 * uses (app/dashboard/_lib/enquiries-firestore.ts) — no separate collection,
 * no duplicated records. The difference is scope: the seller query is pinned to
 * their own `sellerPhones`; admin sees every retailer's enquiries. Writes
 * (mark contacted / close) go through the shared `setEnquiryStatus`, so a status
 * change is the same document update either dashboard makes and stays
 * consistent across both. firestore.rules already grants `isAdmin()` the
 * unfiltered `list`/`get`/`update` these queries rely on.
 */

export type EnquiryReason = "abandoned" | "failed";

/**
 * Every retailer's enquiries, newest first, for a paged list. Status, reason,
 * customer/retailer/product and amount are filtered client-side (same approach
 * as Admin → Orders / Customer payments) — the single `createdAt desc` order
 * needs only the automatic single-field index, so no composite index has to be
 * deployed for this page to load.
 */
export function adminEnquiriesQuery(): Query<DocumentData> {
  return query(collection(db, "enquiries"), orderBy("createdAt", "desc"));
}

/** Platform-wide enquiry counts per status (server-side count queries). */
export async function countAdminEnquiries(): Promise<Record<EnquiryStatus | "all", number>> {
  const base = collection(db, "enquiries");
  const [all, open, contacted, closed] = await Promise.all([
    getCountFromServer(base),
    ...(["open", "contacted", "closed"] as const).map((st) =>
      getCountFromServer(query(base, where("status", "==", st))),
    ),
  ]);
  return {
    all: all.data().count,
    open: open.data().count,
    contacted: contacted.data().count,
    closed: closed.data().count,
  };
}
