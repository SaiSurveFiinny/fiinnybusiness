import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "./firebase-admin";
import { renderInvoicePdf } from "./invoice-pdf";
import type { InvoiceSellerInfo } from "./invoice-html";
import { isInvoiceReady, type OrderDoc } from "../../types/order";

/**
 * Server-side invoice PDF for ANY order.
 *
 * The web used to build the invoice inside the customer's browser, right after
 * writing the order — so an order written by the mobile app, or rebuilt by the
 * payment webhook, never got a PDF and its /invoice/{orderId} link (the one in
 * the WhatsApp message) answered "not yet generated". This runs the invoice
 * builder on the server, so every order, from every client, gets the same
 * invoice, stored where /invoice/[orderId] already looks:
 *
 *   Storage   invoices/{orderId}/{invoiceNumber}.pdf
 *   Firestore orders/{orderId}.invoice { invoiceNumber, storagePath, generatedAt, version }
 *
 * The PDF is rendered from HTML by headless Chromium (lib/invoice-pdf.ts), which
 * shapes Indic scripts correctly — Marathi/Hindi customer & product names and ₹
 * render properly, which the old jsPDF builder could not do.
 *
 * Idempotent: an order that already has an invoice is left alone unless `force`
 * is set (used to regenerate after a correction).
 */

/**
 * Enrich the invoice "Sold By" block with the seller's full address/GSTIN.
 *
 * The order document only carries sellerName + sellerGstNumber, but the seller's
 * address/city/state/pincode live on their retailers/manufacturers doc. Resolve
 * that doc the same way the web does (sellerPhone → uidIndex → sellerId-as-phone)
 * so the invoice can print a complete registered address. Best-effort: any miss
 * degrades to whatever the order itself holds (never throws).
 */
async function loadSellerInfo(db: Firestore, order: OrderDoc): Promise<InvoiceSellerInfo | undefined> {
  const fallback: InvoiceSellerInfo | undefined = order.sellerName
    ? { name: order.sellerName, gstin: order.sellerGstNumber }
    : undefined;
  try {
    const sellerId = order.sellerId;
    if (!sellerId) return fallback;
    let phone: string | null = order.sellerPhone || null;
    if (!phone) {
      const idx = await db.collection("uidIndex").doc(sellerId).get();
      phone = idx.exists ? String(idx.data()?.phone ?? "") || null : null;
    }
    if (!phone && /^(\+91)?[6-9]\d{9}$/.test(String(sellerId).replace(/\s/g, ""))) {
      phone = sellerId;
    }
    const col = order.sellerType === "manufacturer" ? "manufacturers" : "retailers";
    const snap = await db.collection(col).doc(phone || sellerId).get();
    if (!snap.exists) return fallback;
    const d = snap.data()!;
    const gstin = String(d.gstin ?? "").trim() || order.sellerGstNumber || undefined;
    return {
      name: d.shopName || d.businessName || d.ownerName || d.name || order.sellerName || "Seller",
      address: d.address || undefined,
      city: d.city || undefined,
      state: d.state || undefined,
      pincode: d.pincode || undefined,
      phone: d.phone || phone || order.sellerPhone || undefined,
      gstin,
    };
  } catch {
    return fallback;
  }
}
export type InvoiceOutcome =
  | { ok: true; generated: boolean; storagePath: string; invoiceNumber: string; pending?: false }
  /** The seller hasn't accepted yet: nothing generated, it will be on accept. */
  | { ok: true; generated: false; storagePath: ""; invoiceNumber: string; pending: true }
  | { ok: false; status: number; error: string };

export async function ensureOrderInvoice(
  orderId: string,
  opts: { force?: boolean } = {},
): Promise<InvoiceOutcome> {
  const db = getAdminDb();
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: "Order not found." };

  const data = snap.data() as Record<string, unknown>;
  const invoiceNumber = String(data.invoiceNumber ?? `INV-${orderId.slice(0, 8).toUpperCase()}`);
  const existing = (data.invoice as { storagePath?: string } | undefined)?.storagePath;
  if (existing && !opts.force) {
    return { ok: true, generated: false, storagePath: existing, invoiceNumber };
  }
  // Invoices are issued once the seller accepts (generateInvoiceOnAccept
  // calls this then). A placed, rejected or cancelled order gets none.
  if (!isInvoiceReady(data.status as string | undefined)) {
    return { ok: true, generated: false, storagePath: "", invoiceNumber, pending: true };
  }

  try {
    const order = { id: orderId, ...data, invoiceNumber } as unknown as OrderDoc;
    const seller = await loadSellerInfo(db, order);
    const bytes = await renderInvoicePdf(order, seller);
    const storagePath = `invoices/${orderId}/${invoiceNumber}.pdf`;
    await getAdminStorage()
      .bucket()
      .file(storagePath)
      .save(bytes, { contentType: "application/pdf", resumable: false });

    await ref.update({
      // An order that never had a number (recovered / older app orders) gets
      // the same one the invoice shows.
      ...(data.invoiceNumber ? {} : { invoiceNumber }),
      invoice: { invoiceNumber, storagePath, generatedAt: FieldValue.serverTimestamp(), version: 1 },
    });
    return { ok: true, generated: true, storagePath, invoiceNumber };
  } catch (e) {
    console.error("[order-invoice] generation failed", orderId, e);
    return { ok: false, status: 500, error: "Could not generate the invoice." };
  }
}
