"use client";

/**
 * Admin → Customer History. A read-only profile for a single buyer, reached by
 * clicking a customer's name anywhere in Admin → Orders. Keyed by the order's
 * `customerId` (the buyer's Auth UID), never the phone — a phone is not a stable
 * identifier and several accounts can share one.
 *
 * Reuses the existing customer (users) records and order relationships — it does
 * NOT create a parallel customer store:
 *   - fetchCustomerById      → the users/{…} doc behind the customerId
 *   - fetchOrdersForCustomer → every order with customerId == this id
 *   - order-display helpers + openInvoice for identical rendering to the ledger
 *
 * View only: no writes, no money actions (those stay on Admin → Orders).
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, User, Phone, MapPin, Hash, ShieldCheck, Package,
  ShoppingBag, Wallet, CalendarClock, FileText, Eye, AlertTriangle,
} from "lucide-react";
import { fetchCustomerById, type AdminUser } from "../../_lib/admin-queries";
import { fetchOrdersForCustomer } from "../../../firebase";
import { formatCustomerAddress, type OrderDoc } from "../../../../types/order";
import { openInvoice } from "../../../utils/invoice-generator";
import {
  StatusBadge, PaymentBadge, SellerName,
  formatDate, inr, orderTotal, itemsOf, productSummary, toMillis,
} from "../../_lib/order-display";

const PAGE_SIZE = 15;

/** "consumer" is the mobile-app alias for "customer" — show one label for both. */
function accountTypeLabel(role: unknown): string {
  const r = String(role ?? "").toLowerCase();
  if (!r || r === "consumer") return "Customer";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** Account status from whatever the user doc carries; defaults to Active. */
function accountStatus(user: AdminUser | null): { label: string; ok: boolean } {
  if (!user) return { label: "Unknown", ok: false };
  if (user.isActive === false || user.disabled === true || user.isBlocked === true) {
    return { label: "Inactive", ok: false };
  }
  return { label: "Active", ok: true };
}

/** The address stored on the customer's own profile (what the checkout writes). */
function profileAddress(user: AdminUser | null): string {
  if (!user) return "";
  const joined = [user.addressArea, user.addressCity, user.addressDistrict, user.addressState, user.addressPincode]
    .filter(Boolean).join(", ").trim();
  if (joined) return joined;
  // Fall back to the seller-style flat address fields some accounts carry.
  return [user.address, user.city, user.state, user.pincode].filter(Boolean).join(", ").trim();
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</p>
        <div className="text-sm font-semibold text-on-surface break-words">{value}</div>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1.5 text-xl font-black text-on-surface">{value}</p>
    </div>
  );
}

export default function CustomerHistoryPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = decodeURIComponent(String(params?.customerId ?? ""));
  const router = useRouter();

  const [customer, setCustomer] = useState<AdminUser | null>(null);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!customerId) { setError("No customer id in the URL."); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCustomerById(customerId).catch(() => null),
      fetchOrdersForCustomer(customerId).catch((e) => { throw e; }),
    ])
      .then(([c, os]) => {
        if (cancelled) return;
        setCustomer(c);
        // Newest first — fetchOrdersForCustomer already sorts, but be defensive.
        setOrders([...os].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customer history."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  const stats = useMemo(() => {
    const totalValue = orders.reduce((s, o) => s + orderTotal(o), 0);
    const lastOrderMs = orders.reduce((m, o) => Math.max(m, toMillis(o.createdAt)), 0);
    return { count: orders.length, totalValue, lastOrderMs };
  }, [orders]);

  // Name/phone: prefer the customer record, fall back to what the orders carry
  // (a record may be missing, but the orders always snapshot name + phone).
  const displayName = customer?.name || orders[0]?.customerName || "Unknown customer";
  const displayPhone = customer?.phone || orders.find((o) => o.customerPhone)?.customerPhone || "—";
  const savedAddress = profileAddress(customer);
  // Distinct delivery addresses actually used across this customer's orders.
  const orderAddresses = useMemo(() => {
    const seen = new Set<string>();
    for (const o of orders) {
      const a = formatCustomerAddress(o.customerAddress);
      if (a) seen.add(a);
    }
    return Array.from(seen);
  }, [orders]);
  const status = accountStatus(customer);
  const shownOrders = orders.slice(0, visible);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-bold">Could not load this customer</p>
            <p className="mt-0.5 text-xs text-red-700/90">{error}</p>
          </div>
        </div>
      )}

      {/* ── Customer information ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-on-surface sm:text-2xl">{displayName}</h1>
            <p className="text-xs text-on-surface-variant">Customer history</p>
          </div>
        </div>

        {!customer && (
          <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            No customer profile found for this id — showing details captured on their orders.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow icon={Phone} label="Phone" value={
            displayPhone !== "—"
              ? <a href={`tel:${displayPhone}`} className="hover:text-primary">{displayPhone}</a>
              : "—"
          } />
          <InfoRow icon={Hash} label="Customer ID" value={<span className="font-mono text-xs">{customerId}</span>} />
          <InfoRow icon={User} label="Account type" value={accountTypeLabel(customer?.role)} />
          <InfoRow icon={ShieldCheck} label="Account status" value={
            <span className={status.ok ? "text-green-700" : "text-red-700"}>{status.label}</span>
          } />
          <div className="sm:col-span-2 lg:col-span-3">
            <InfoRow icon={MapPin} label="Saved delivery addresses" value={
              savedAddress || orderAddresses.length > 0 ? (
                <ul className="space-y-1">
                  {savedAddress && <li>{savedAddress}</li>}
                  {orderAddresses
                    .filter((a) => a !== savedAddress)
                    .map((a) => <li key={a} className="text-on-surface-variant">{a}</li>)}
                </ul>
              ) : "—"
            } />
          </div>
        </div>
      </div>

      {/* ── Statistics ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={ShoppingBag} label="Total orders" value={stats.count.toLocaleString("en-IN")} />
        <StatTile icon={Wallet} label="Total order value" value={inr(stats.totalValue)} />
        <StatTile icon={CalendarClock} label="Most recent order"
          value={stats.lastOrderMs ? formatDate(orders[0]?.createdAt) : "—"} />
      </div>

      {/* ── Recent orders ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-on-surface">
          <Package className="h-4 w-4 text-primary" /> Recent orders
        </h2>

        <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
          {orders.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="mx-auto h-10 w-10 text-on-surface-variant/40" />
              <p className="mt-3 text-sm font-bold text-on-surface">No orders yet</p>
              <p className="mt-1 text-xs text-on-surface-variant">This customer hasn&apos;t placed any orders.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead className="bg-surface-container-low">
                    <tr className="border-b border-outline-variant/20 text-left text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">Seller</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="px-4 py-2.5">Payment</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Order / Invoice</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownOrders.map((o) => {
                      const prod = productSummary(o);
                      return (
                        <tr key={o.id} className="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/70">
                          <td className="px-4 py-3 align-top whitespace-nowrap text-[11px] text-on-surface-variant">{formatDate(o.createdAt)}</td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium text-on-surface truncate max-w-[220px]">{prod.label}</p>
                            <p className="text-[11px] text-on-surface-variant">
                              {prod.units} {prod.units === 1 ? "unit" : "units"}{prod.more ? ` · ${prod.more}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="block max-w-[180px] truncate text-xs"><SellerName order={o} /></span>
                          </td>
                          <td className="px-4 py-3 align-top text-right font-black text-on-surface whitespace-nowrap">{inr(orderTotal(o))}</td>
                          <td className="px-4 py-3 align-top"><PaymentBadge order={o} /></td>
                          <td className="px-4 py-3 align-top"><StatusBadge status={o.status} /></td>
                          <td className="px-4 py-3 align-top">
                            <span className="font-mono text-[11px] font-bold text-primary">{o.invoiceNumber || o.id.slice(0, 8).toUpperCase()}</span>
                          </td>
                          <td className="px-4 py-3 align-top text-right">
                            <button
                              type="button"
                              onClick={() => openInvoice(o)}
                              aria-label="Open invoice"
                              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-white px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"
                            >
                              <FileText className="h-3.5 w-3.5" /> Invoice
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-outline-variant/10">
                {shownOrders.map((o) => {
                  const prod = productSummary(o);
                  return (
                    <div key={o.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] text-on-surface-variant">{formatDate(o.createdAt)}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-1 font-semibold text-on-surface truncate">{prod.label}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        {prod.units} {prod.units === 1 ? "unit" : "units"}{prod.more ? ` · ${prod.more}` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="block min-w-0 truncate text-[11px] text-on-surface-variant">
                          {o.sellerName || o.sellerId || "—"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-black text-on-surface whitespace-nowrap">{inr(orderTotal(o))}</span>
                          <button
                            type="button"
                            onClick={() => openInvoice(o)}
                            aria-label="Open invoice"
                            className="rounded-lg border border-outline-variant/40 bg-white p-1.5 text-primary hover:bg-primary/10"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
                        {o.invoiceNumber || o.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  );
                })}
              </div>

              {visible < orders.length && (
                <div className="flex justify-center border-t border-outline-variant/20 py-3">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-5 py-2 text-sm font-bold text-on-surface hover:bg-surface-container"
                  >
                    <Eye className="h-4 w-4" /> Show more ({orders.length - visible} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
