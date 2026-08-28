// ─── Payment Terms → Promise Date ───────────────────────────────────────────────
//
// Single source of truth for turning a B2B invoice's `modeOfPayment` (the invoice
// payment TERM chosen at billing time — 'Cash', '15 Days', '30 Days', '45 Days',
// 'Credit', …) into the number of credit days, and for deriving a promise/expected
// payment date from an actual invoice date.
//
// This intentionally mirrors the billing system's own vocabulary (see
// B2BInvoicePage PAYMENT_MODES = ['Cash', '15 Days', '30 Days', '45 Days',
// 'Credit']). Immediate-payment terms — Cash (and any non-day term such as
// UPI/Cheque/Credit that carries no explicit "N Days" credit period) — resolve to
// 0 days, so the promise date equals the invoice date. We never invent an
// arbitrary default number of days.

/**
 * Extract the credit-period days from an invoice payment term / mode string.
 * "15 Days" → 15, "30 Days" → 30, "45 Days" → 45.
 * "Cash", "UPI", "Cheque", "Credit", blank/unknown → 0 (immediate).
 */
export function paymentTermDays(modeOfPayment?: string | null): number {
    if (!modeOfPayment) return 0;
    const m = String(modeOfPayment).trim().toLowerCase();
    const match = m.match(/(\d+)\s*day/); // "15 days", "30day", etc.
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * Promise Date = actual invoice date + payment-term days.
 * `invoiceDate` must be the real bill date (YYYY-MM-DD), never a createdAt stamp.
 * Returns a YYYY-MM-DD string, or undefined if the invoice date is missing/invalid.
 */
export function computePromiseDate(invoiceDate?: string, modeOfPayment?: string | null): string | undefined {
    if (!invoiceDate) return undefined;
    const d = new Date(invoiceDate);
    if (isNaN(d.getTime())) return undefined;
    d.setDate(d.getDate() + paymentTermDays(modeOfPayment));
    return d.toISOString().slice(0, 10);
}
