import {
  formatCustomerAddress,
  normalizeOrderItems,
  paymentModeLabel,
  trackingIdTypeLabel,
} from "../../types/order";
import type { OrderDoc } from "../../types/order";
import { loadInvoiceFontsBase64 } from "./invoice-fonts";

/**
 * Invoice as an HTML document, rendered to PDF by Chromium (lib/invoice-pdf.ts).
 *
 * This replaces the old jsPDF builder (utils/invoice-generator.ts), which could
 * not render Indic scripts: jsPDF has no OpenType shaping engine, so Devanagari
 * (Marathi/Hindi) and Gujarati conjuncts / vowel signs came out broken or blank
 * and ₹ fell back to "Rs.". Chromium shapes complex scripts correctly (HarfBuzz)
 * and subsets+embeds the bundled Noto fonts, so the PDF reads the same on every
 * device.
 *
 * LAYOUT is a GST tax-invoice modelled on the Shiprocket reference: three info
 * columns (Shipping Address / Sold By / Invoice Details), an items table with
 * per-line Unit Price, Discount, Taxable Value and GST, a Shipping Charges line,
 * a Net Total, and an Authorized Signature block.
 *
 * The FINANCIAL logic — subtotal, delivery, GST split (added vs. included) and
 * the grand total — is read from the FINALIZED order and copied verbatim from
 * the previous builder, so invoices reconcile exactly as before. Only the
 * rendering backend, the font coverage and the visual layout changed. Fields
 * the catalog does not store (SKU, HSN, courier name, GST state code, CGST/SGST
 * split) are intentionally omitted rather than invented.
 */

// Brand colours.
const PRIMARY = "#154212";
const SECONDARY = "#705a4c";
const LIGHT_BG = "#f8f7f3";
const BORDER = "#dcdcd7";
const TEXT_DARK = "#1e1e1e";
const TEXT_GREY = "#6e6e69";

// ── Money / numbers ─────────────────────────────────────────────────────────
function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const WORD_ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const WORD_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n: number): string {
  if (n < 20) return WORD_ONES[n];
  return WORD_TENS[Math.floor(n / 10)] + (n % 10 ? " " + WORD_ONES[n % 10] : "");
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  let out = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) out += integerToWords(crore) + " Crore ";
  if (lakh) out += twoDigitsToWords(lakh) + " Lakh ";
  if (thousand) out += twoDigitsToWords(thousand) + " Thousand ";
  if (hundred) out += WORD_ONES[hundred] + " Hundred ";
  if (n) out += (out ? "" : "") + twoDigitsToWords(n) + " ";
  return out.trim();
}

/** e.g. 2200.5 → "Two Thousand Two Hundred Rupees and Fifty Paise Only" */
function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let s = `${integerToWords(rupees)} Rupee${rupees === 1 ? "" : "s"}`;
  if (paise > 0) s += ` and ${twoDigitsToWords(paise)} Paise`;
  return `${s} Only`;
}

function formatDate(createdAt: unknown): string {
  try {
    const d = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
}

export interface InvoiceSellerInfo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  gstin?: string;
}

export function resolveInvoiceNumber(order: OrderDoc): string {
  return order.invoiceNumber ?? `INV-${order.id.slice(0, 8).toUpperCase()}`;
}

// ── HTML escaping ────────────────────────────────────────────────────────────
// Every piece of order-supplied text (names, addresses, product/variant names)
// goes through this so the original characters are preserved and the markup can
// never break, whatever the customer typed.
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function fontFaceCss(): string {
  const f = loadInvoiceFontsBase64();
  const face = (family: string, b64: string, weight: number) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
    `src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  return [
    face("KDNoto", f.sansRegular, 400),
    face("KDNoto", f.sansBold, 700),
    face("KDNoto", f.devRegular, 400),
    face("KDNoto", f.devBold, 700),
    face("KDNoto", f.gujRegular, 400),
    face("KDNoto", f.gujBold, 700),
  ].join("");
}

// ── Builder ──────────────────────────────────────────────────────────────────
export function buildInvoiceHtml(order: OrderDoc, seller?: InvoiceSellerInfo): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const invoiceNum = resolveInvoiceNumber(order);

  // ── Items ──────────────────────────────────────────────────────────────────
  // Per line, straight from the finalized order:
  //  - net          = customer-facing line value (price x qty).
  //  - taxAmt       = GST on the line (per-unit gstAmount x qty).
  //  - taxable      = value excluding GST (net - taxAmt for inclusive lines; net
  //                   itself for exclusive lines, where GST is added on top).
  //  - lineTotal    = amount including GST.
  //  - unitDiscount = originalPrice - price per unit (only when a discount applied).
  const items = normalizeOrderItems(order.items as any);
  const bodyRows = items
    .map((item, i) => {
      const net = round2(item.lineTotal ?? item.price * item.qty);
      const applicable = !!(item.gstApplicable && item.gstRate);
      const included = applicable && item.gstIncluded !== false;
      const taxAmt = applicable ? round2((item.gstAmount ?? 0) * item.qty) : 0;
      const taxable = included ? round2(net - taxAmt) : net;
      const lineTotal = included ? net : round2(net + taxAmt);
      const unitDiscount =
        item.originalPrice && item.originalPrice > item.price
          ? round2(item.originalPrice - item.price)
          : 0;
      const name = item.variantUnit ? `${item.name} (${item.variantUnit})` : item.name;
      const gstCell = applicable
        ? `${formatINR(taxAmt)} | ${item.gstRate}%${included ? "<br><span class=\"sub\">incl.</span>" : ""}`
        : "—";
      return `<tr>
        <td class="c">${i + 1}</td>
        <td><div class="pname">${esc(name)}</div></td>
        <td class="c">${item.qty}</td>
        <td class="r">${formatINR(item.price)}</td>
        <td class="r">${unitDiscount > 0 ? formatINR(unitDiscount) : "0.00"}</td>
        <td class="r">${formatINR(taxable)}</td>
        <td class="r">${gstCell}</td>
        <td class="r">${formatINR(lineTotal)}</td>
      </tr>`;
    })
    .join("");

  // ── Summary figures (read from the FINALIZED order — never recomputed) ───────
  const subtotal = order.subtotal ?? 0;

  const bd = order.deliveryBreakdown;
  const deliveryFree = bd?.free ?? false;
  const deliverySlab = bd?.slab ?? 0;
  const deliveryExtra = bd?.extra ?? 0;
  const deliveryWaived = bd?.waived ?? 0;
  const deliveryPaid = deliveryFree ? 0 : (order.deliveryCharge ?? (deliverySlab + deliveryExtra));

  const gstItems = items.filter((i) => i.gstApplicable && i.gstRate);
  const gstRates = Array.from(new Set(gstItems.map((i) => i.gstRate).filter(Boolean)));
  const rateLabel = gstRates.length === 1 ? `${gstRates[0]}%` : "";

  const totalGstStored = round2(order.totalGst ?? 0);
  let addedGst = round2(order.totalGstAdded ?? 0);
  // Legacy orders pre-date `totalGstAdded` and charged GST on top. Infer that case
  // from the grand total so their invoices stay correct.
  if (order.totalGstAdded === undefined && totalGstStored > 0) {
    const noGstTotal = round2(subtotal + deliveryPaid);
    if ((order.grandTotal ?? noGstTotal) > noGstTotal + 0.01) addedGst = totalGstStored;
  }
  const includedGst = round2(totalGstStored - addedGst);
  const grand = order.grandTotal ?? round2(subtotal + deliveryPaid + addedGst);

  // ── Shipping charges table row (mirrors the reference invoice) ───────────────
  const shippingRow = (() => {
    if (deliveryFree) {
      const waived =
        deliveryWaived > 0
          ? `<span class="strike">${formatINR(deliveryWaived)}</span> <span class="free">FREE</span>`
          : `<span class="free">FREE</span>`;
      return `<tr class="shiprow">
        <td></td><td><div class="pname">Shipping Charges</div></td>
        <td class="c">—</td><td class="r">—</td><td class="r">0.00</td>
        <td class="r">${waived}</td><td class="r">0.00 | 0%</td><td class="r">${waived}</td>
      </tr>`;
    }
    return `<tr class="shiprow">
      <td></td><td><div class="pname">Shipping Charges</div></td>
      <td class="c">—</td><td class="r">—</td><td class="r">0.00</td>
      <td class="r">${formatINR(deliveryPaid)}</td><td class="r">0.00 | 0%</td><td class="r">${formatINR(deliveryPaid)}</td>
    </tr>`;
  })();

  // ── Notes under the totals ───────────────────────────────────────────────────
  const notes: string[] = [];
  if (includedGst > 0) {
    notes.push(
      `<div class="note accent">GST${rateLabel ? ` (${rateLabel} included)` : " (included)"}: ${formatINR(includedGst)}</div>`,
    );
    notes.push(
      `<div class="note">${
        addedGst > 0
          ? "Included GST is part of the product price. GST marked + is added on top."
          : "GST is included in the product price and is not charged separately."
      }</div>`,
    );
  }
  if (deliveryFree) {
    notes.push(
      `<div class="note accent">Free Delivery${deliveryWaived > 0 ? ` — ${formatINR(deliveryWaived)} waived` : ""}.</div>`,
    );
  } else if (deliveryExtra > 0) {
    notes.push(`<div class="note">Delivery: slab ${formatINR(deliverySlab)} + extra ${formatINR(deliveryExtra)}.</div>`);
  }
  if ((order.totalWeightKg ?? 0) > 0) {
    notes.push(`<div class="note">Est. weight: ${esc(order.totalWeightKg)} kg</div>`);
  }

  // ── Invoice-details column (right) ───────────────────────────────────────────
  // A manual order can be backed by several captured payments; show every linked id
  // so the invoice reflects the full split, falling back to the single-payment field.
  const linkedPaymentIds = order.payment?.razorpayPaymentIds?.length
    ? order.payment.razorpayPaymentIds
    : order.payment?.razorpayPaymentId
    ? [order.payment.razorpayPaymentId]
    : [];
  const paymentTxnId = linkedPaymentIds.length ? linkedPaymentIds.join(", ") : order.payment?.razorpayOrderId;
  const modeOfPayment = paymentModeLabel(order.payment);
  const orderNo = `#${order.id.slice(0, 10).toUpperCase()}`;
  const invoiceDate = formatDate(order.createdAt);
  const status = (order.status ?? "placed").replace(/_/g, " ").toUpperCase();

  // Courier / tracking — the catalog stores no courier NAME, only the tracking
  // identifier + its type (AWB / LR / consignment…). Shown only when present.
  const tr = order.tracking;
  const trackingLabel = tr?.id ? trackingIdTypeLabel(tr.idType, tr.idTypeLabel) : "";

  const detailRows: [string, string][] = [
    ["INVOICE NO.", invoiceNum],
    ["INVOICE DATE", invoiceDate],
    ["ORDER NO.", orderNo],
    ["ORDER DATE", invoiceDate],
    ["STATUS", status],
    ...(tr?.id ? ([[trackingLabel.toUpperCase(), tr.id]] as [string, string][]) : []),
    ["PAYMENT METHOD", modeOfPayment],
    ...(paymentTxnId ? ([["TRANSACTION ID", String(paymentTxnId)]] as [string, string][]) : []),
  ];

  // ── Info boxes ───────────────────────────────────────────────────────────────
  const sellerLines = [
    seller?.name ?? order.sellerName ?? "Seller",
    seller?.address ?? "",
    [seller?.city, seller?.state].filter(Boolean).join(", "),
    seller?.pincode ? `PIN: ${seller.pincode}` : "",
    seller?.phone ? `Ph: ${seller.phone}` : "",
    (seller?.gstin ?? order.sellerGstNumber) ? `GSTIN: ${seller?.gstin ?? order.sellerGstNumber}` : "",
  ].filter(Boolean);

  const customerLines = [
    order.customerName,
    formatCustomerAddress(order.customerAddress),
    order.customerPhone ? `Ph: ${order.customerPhone}` : "",
  ].filter(Boolean);

  const infoLines = (lines: string[]) =>
    lines.map((l) => `<div class="iline">${esc(l)}</div>`).join("");

  const detailLines = detailRows
    .map(
      ([k, v]) =>
        `<div class="drow"><div class="dk">${esc(k)}</div><div class="dv">${esc(v)}</div></div>`,
    )
    .join("");

  const genDate = new Date().toLocaleDateString("en-IN");

  // ── Document ─────────────────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{font-family:'KDNoto',sans-serif;color:${TEXT_DARK};-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4;margin:0;}
.page{width:210mm;min-height:297mm;position:relative;padding-bottom:16mm;}
.pad{padding:0 14mm;}
/* Header band */
.band{background:${PRIMARY};color:#fff;height:26mm;display:flex;align-items:center;justify-content:space-between;padding:0 14mm;}
.brand{font-size:15pt;font-weight:700;line-height:1;}
.brand small{display:block;font-size:7.5pt;font-weight:400;margin-top:1.8mm;opacity:.9;}
.htitle{text-align:right;}
.htitle b{font-size:17pt;font-weight:700;letter-spacing:1px;}
.htitle small{display:block;font-size:7.5pt;font-weight:400;margin-top:1.8mm;opacity:.9;}
/* Three info columns */
.cols{display:flex;gap:4mm;margin-top:7mm;}
.col{flex:1;border:0.3mm solid ${BORDER};border-radius:2mm;overflow:hidden;}
.col .ch{background:${LIGHT_BG};color:${PRIMARY};font-size:7pt;font-weight:700;letter-spacing:.4px;padding:1.8mm 3mm;border-bottom:0.3mm solid ${BORDER};}
.col .cb{padding:2.5mm 3mm;font-size:8pt;line-height:1.55;}
.iline{word-break:break-word;}
.drow{display:flex;justify-content:space-between;gap:2mm;padding:0.5mm 0;}
.drow .dk{color:${TEXT_GREY};font-size:7pt;font-weight:700;flex:none;}
.drow .dv{text-align:right;word-break:break-word;font-size:7.5pt;}
/* Items table */
table{width:100%;border-collapse:collapse;margin-top:7mm;font-size:7.5pt;}
th{background:${PRIMARY};color:#fff;font-weight:700;padding:2mm;border:0.2mm solid ${PRIMARY};text-align:left;font-size:6.8pt;letter-spacing:.2px;}
td{padding:2mm;border:0.2mm solid ${BORDER};vertical-align:top;word-break:break-word;}
tbody tr:nth-child(even){background:${LIGHT_BG};}
tr.shiprow td{background:#fff;color:${TEXT_GREY};}
.pname{font-weight:700;color:${TEXT_DARK};}
td .sub,span.sub{font-size:6pt;color:${TEXT_GREY};font-weight:400;}
td.r,th.r{text-align:right;}
td.c,th.c{text-align:center;}
.strike{text-decoration:line-through;color:${TEXT_GREY};}
.free{color:${PRIMARY};font-weight:700;}
/* Net total */
.nettotal{display:flex;justify-content:flex-end;align-items:center;gap:6mm;margin-top:4mm;padding:3mm 4mm;background:${PRIMARY};color:#fff;border-radius:2mm;}
.nettotal .lbl{font-size:10pt;font-weight:700;letter-spacing:.3px;}
.nettotal .val{font-size:13pt;font-weight:700;}
/* Words + notes row */
.below{display:flex;gap:6mm;margin-top:5mm;}
.words{flex:1;font-size:7.5pt;}
.words .k{color:${TEXT_GREY};font-size:7pt;}
.words .v{font-weight:700;margin-top:0.6mm;}
.notes{width:72mm;}
.note{font-size:6.8pt;color:${TEXT_GREY};line-height:1.4;margin-top:0.8mm;}
.note.accent{font-size:7.2pt;color:${PRIMARY};font-weight:700;}
.rc{font-size:7pt;color:${TEXT_GREY};margin-top:4mm;}
/* Footer */
.footer{position:absolute;bottom:0;left:0;right:0;height:11mm;background:${PRIMARY};color:#fff;font-size:7pt;display:flex;align-items:center;justify-content:space-between;padding:0 14mm;}
</style></head>
<body>
<div class="page">
  <div class="band">
    <div class="brand">KrishiDukan<small>Agricultural Marketplace</small></div>
    <div class="htitle"><b>TAX INVOICE</b></div>
  </div>
  <div class="pad">
    <div class="cols">
      <div class="col"><div class="ch">SHIPPING ADDRESS</div><div class="cb">${infoLines(customerLines)}</div></div>
      <div class="col"><div class="ch">SOLD BY</div><div class="cb">${infoLines(sellerLines)}</div></div>
      <div class="col"><div class="ch">INVOICE DETAILS</div><div class="cb">${detailLines}</div></div>
    </div>

    <table>
      <thead><tr>
        <th class="c">S.No.</th><th>Product Name</th><th class="c">Qty</th>
        <th class="r">Unit Price</th><th class="r">Discount</th>
        <th class="r">Taxable Value</th><th class="r">GST (Value&nbsp;|&nbsp;%)</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${bodyRows}${shippingRow}</tbody>
    </table>

    <div class="nettotal"><span class="lbl">NET TOTAL</span><span class="val">${formatINR(grand)}</span></div>

    <div class="below">
      <div class="words">
        <div class="k">Amount in Words</div>
        <div class="v">${esc(amountInWords(grand))}</div>
      </div>
      ${notes.length ? `<div class="notes">${notes.join("")}</div>` : ""}
    </div>

    <div class="rc">Whether tax is payable under reverse charge — No</div>
  </div>
  <div class="footer">
    <span>Generated by KrishiDukan · ${esc(genDate)}</span>
    <span>krishidukan.com</span>
  </div>
</div>
</body></html>`;
}
