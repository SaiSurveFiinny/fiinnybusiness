"use client";

import Link from "next/link";
import { Phone, X, ExternalLink, Package } from "lucide-react";
import { money, CATEGORY_LABEL, PLATFORM_LABEL, type PaymentRow } from "../_lib/payments";
import { CATEGORY_BADGE } from "./payments-table";

/**
 * Full inspection of one unified row. For a gateway row, status/amount/refund
 * come from the Razorpay mirror; for an app-only row they come from the
 * checkout attempt. Either way we show the normalized category AND both raw
 * statuses + the source, so the classification is fully auditable.
 */

export function PaymentDetailsModal({ row, onClose }: { row: PaymentRow; onClose: () => void }) {
  const { payment: p, attempt: a, category } = row;
  const customerHref = row.phone ? `/admin/users?q=${encodeURIComponent(row.phone)}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline/15 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-on-surface">Payment details</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CATEGORY_BADGE[category]}`}>
                {CATEGORY_LABEL[category]}
              </span>
              <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                {PLATFORM_LABEL[row.platform]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              {row.createdAt ? row.createdAt.toLocaleString("en-IN") : "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-outline transition hover:bg-surface-container hover:text-on-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Classification (auditability) */}
          <div className="rounded-xl bg-surface-container/40 p-4">
            <SectionLabel>Classification</SectionLabel>
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Field label="Normalized category">{CATEGORY_LABEL[category]}</Field>
              <Field label="Source">{row.source === "razorpay" ? "Razorpay payment" : "App checkout (no gateway payment)"}</Field>
              <Field label="Razorpay status">{row.rawGatewayStatus || <span className="text-outline">— (no gateway payment)</span>}</Field>
              <Field label="App status">{row.rawAppStatus || <span className="text-outline">—</span>}</Field>
            </div>
            {row.category === "abandoned" && row.source === "app" && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Marked “{row.rawAppStatus}” by the app, but Razorpay has no payment for this order — so it is an abandoned checkout, not a failure.
              </p>
            )}
          </div>

          {/* Customer */}
          <Section title="Customer">
            <Field label="Name">
              {customerHref ? (
                <Link href={customerHref} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  {row.name}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                row.name
              )}
            </Field>
            <Field label="Phone">
              {row.phone ? (
                <a href={`tel:${row.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" />
                  {row.phone}
                </a>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Customer ID">
              <code className="break-all text-xs">{p?.userId || a?.userId || "—"}</code>
            </Field>
            {p?.email && <Field label="Email">{p.email}</Field>}
          </Section>

          {/* Products (from the attempt) */}
          {a && a.kind === "subscription" ? (
            <Section title="Subscription">
              <Field label="Seats">{a.seatCount ?? "—"}</Field>
              <Field label="Duration">{a.durationMonths != null ? `${a.durationMonths} month(s)` : "—"}</Field>
            </Section>
          ) : a && a.items.length > 0 ? (
            <div>
              <SectionLabel>
                <Package className="h-3.5 w-3.5" /> Products
              </SectionLabel>
              <div className="overflow-x-auto rounded-xl border border-outline/15">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-surface-container/50 text-left text-xs text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">Product ID</th>
                      <th className="px-3 py-2 font-semibold">Qty</th>
                      <th className="px-3 py-2 font-semibold">Price</th>
                      <th className="px-3 py-2 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.items.map((i, idx) => (
                      <tr key={idx} className="border-t border-outline/10">
                        <td className="px-3 py-2">{i.name}</td>
                        <td className="px-3 py-2">
                          <code className="text-xs text-outline">{i.productId || "—"}</code>
                        </td>
                        <td className="px-3 py-2">{i.qty}</td>
                        <td className="px-3 py-2">{money(i.unitPrice)}</td>
                        <td className="px-3 py-2">{money(i.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <Section title="Products">
              <Field label="Basket">
                <span className="text-outline">No matching checkout record for this order.</span>
              </Field>
            </Section>
          )}

          {/* Amounts */}
          <Section title="Amounts">
            {a?.subtotal != null && <Field label="Subtotal">{money(a.subtotal)}</Field>}
            {a?.deliveryCharge != null && <Field label="Delivery charges">{money(a.deliveryCharge)}</Field>}
            {a?.gstAdded != null && <Field label="GST">{money(a.gstAdded)}</Field>}
            <Field label="Total amount">
              <span className="font-bold">{money(row.amount)}</span>
            </Field>
            {p && p.amountRefunded > 0 && <Field label="Refunded">{money(p.amountRefunded)}</Field>}
          </Section>

          {/* Payment (gateway) */}
          <Section title="Payment">
            <Field label="Payment ID">
              <code className="break-all text-xs">{row.paymentId || <span className="text-outline">— (no gateway payment)</span>}</code>
            </Field>
            <Field label="Razorpay order ID">
              <code className="break-all text-xs">{row.orderId || "—"}</code>
            </Field>
            <Field label="Method">{p?.method || <span className="text-outline">—</span>}</Field>
            <Field label="Captured">
              {p?.capturedAt ? p.capturedAt.toLocaleString("en-IN") : <span className="text-outline">—</span>}
            </Field>
          </Section>

          {/* Refunds */}
          {p && p.refunds.length > 0 && (
            <div>
              <SectionLabel>Refunds</SectionLabel>
              <div className="overflow-x-auto rounded-xl border border-outline/15">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container/50 text-left text-xs text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Refund ID</th>
                      <th className="px-3 py-2 font-semibold">Amount</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.refunds.map((rf) => (
                      <tr key={rf.id} className="border-t border-outline/10">
                        <td className="px-3 py-2"><code className="text-xs">{rf.id}</code></td>
                        <td className="px-3 py-2">{money(rf.amount)}</td>
                        <td className="px-3 py-2">{rf.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Failure / abandonment detail */}
          {(category === "failed" || category === "abandoned") && (
            <div className="rounded-xl bg-red-50 p-4">
              <SectionLabel tone="error">{category === "failed" ? "Failure detail" : "Abandonment detail"}</SectionLabel>
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <Field label="Reason">{row.reason}</Field>
                {p && <Field label="Error code">{p.errorCode || "—"}</Field>}
                {p && <Field label="Error description">{p.errorDescription || "—"}</Field>}
                {p && <Field label="Error source">{p.errorSource || "—"}</Field>}
                {p && <Field label="Error step">{p.errorStep || "—"}</Field>}
                {p && <Field label="Error reason">{p.errorReason || "—"}</Field>}
                {!p && a?.error && <Field label="App error">{a.error.description || a.error.reason || "—"}</Field>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function SectionLabel({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <p
      className={`mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
        tone === "error" ? "text-red-700" : "text-outline"
      }`}
    >
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-outline">{label}</p>
      <div className="mt-0.5 break-words text-on-surface">{children}</div>
    </div>
  );
}
