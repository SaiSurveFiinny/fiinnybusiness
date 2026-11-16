import type { EnquiryDoc, EnquiryStatus } from "../../../dashboard/_lib/enquiries-firestore";
import type { AmountOp } from "../../orders/_lib/order-filters";
import type { EnquiryReason } from "./admin-enquiries-firestore";

/**
 * Client-side filter state for the Admin → Enquiries table. The server query
 * returns every enquiry newest-first (admin-enquiries-firestore.ts); these
 * narrow the loaded rows the same way Admin → Orders / Customer payments do,
 * with one popover per column header.
 */
export type EnquiryFilters = {
  /** Status tab — the primary filter. "all" shows every status. */
  status: EnquiryStatus | "all";
  /** Loss reason (OR). Empty = both failed and abandoned. */
  reasons: EnquiryReason[];
  customer: string;
  phone: string;
  product: string;
  retailer: string;
  amount: { op: AmountOp; min: string; max: string };
  fromMs: number | null;
  toMs: number | null;
};

export const EMPTY_ENQUIRY_FILTERS: EnquiryFilters = {
  status: "open",
  reasons: [],
  customer: "",
  phone: "",
  product: "",
  retailer: "",
  amount: { op: "range", min: "", max: "" },
  fromMs: null,
  toMs: null,
};

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** The product text a row is matched/searched against (summary + line names). */
function productHaystack(e: EnquiryDoc): string {
  return [e.itemSummary, ...e.items.map((i) => i.name)].filter(Boolean).join(" ").toLowerCase();
}

/** True when this enquiry satisfies every active filter group. */
export function matchesEnquiryFilters(e: EnquiryDoc, f: EnquiryFilters): boolean {
  // Status (the tab)
  if (f.status !== "all" && e.status !== f.status) return false;
  // Reason (OR)
  if (f.reasons.length > 0 && !f.reasons.includes(e.reason)) return false;
  // Date range on createdAt
  if (f.fromMs !== null || f.toMs !== null) {
    const ms = e.createdAt ? e.createdAt.getTime() : 0;
    if (f.fromMs !== null && ms < f.fromMs) return false;
    if (f.toMs !== null && ms > f.toMs) return false;
  }
  // Customer name (partial)
  if (f.customer.trim() && !(e.buyerName || "").toLowerCase().includes(f.customer.trim().toLowerCase())) return false;
  // Phone (digits-insensitive partial)
  if (f.phone.trim()) {
    const want = digitsOf(f.phone);
    if (want && !digitsOf(e.buyerPhone || "").includes(want)) return false;
  }
  // Product (partial over summary + line names)
  if (f.product.trim() && !productHaystack(e).includes(f.product.trim().toLowerCase())) return false;
  // Retailer (partial over shop name or seller phone)
  if (f.retailer.trim()) {
    const hay = `${e.sellerName || ""} ${e.sellerPhone || ""}`.toLowerCase();
    if (!hay.includes(f.retailer.trim().toLowerCase())) return false;
  }
  // Amount on the enquiry value
  if (f.amount.min.trim() !== "" || f.amount.max.trim() !== "") {
    const v = e.value;
    const min = f.amount.min.trim() === "" ? null : Number(f.amount.min);
    const max = f.amount.max.trim() === "" ? null : Number(f.amount.max);
    switch (f.amount.op) {
      case "gt": if (min !== null && !(v > min)) return false; break;
      case "lt": if (max !== null && !(v < max)) return false; break;
      case "eq": if (min !== null && Math.abs(v - min) > 0.5) return false; break;
      case "range":
        if (min !== null && v < min) return false;
        if (max !== null && v > max) return false;
        break;
    }
  }
  return true;
}
