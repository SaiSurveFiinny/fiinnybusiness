"use client";

/**
 * Admin → Orders → Create order manually.
 *
 * Reconstructs an order for a customer whose Razorpay payment SUCCEEDED but whose
 * order was never written by the normal checkout. Step-by-step:
 *   Customer → Retailer → Products → Review → Payment → Create.
 *
 * Nothing authoritative lives here — every price and every check comes back from
 * the server (/api/admin/manual-order/*). The UI only collects the selections and
 * surfaces the server's blockers. The order is created ONLY against a verified,
 * captured payment whose amount equals the computed total; a mismatch is shown and
 * blocks creation. Re-submitting a created order returns the same order (the
 * server keys it deterministically), so retries never double-create or double-notify.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Search, User, Store, Package, Trash2,
  CreditCard, FileText, AlertTriangle, CheckCircle2, RefreshCw, IndianRupee, X,
  UserPlus, Pencil, Save, Phone, MapPin,
} from "lucide-react";
import { authedJsonHeaders } from "../../../lib/authed-fetch";
import { CreateUserModal, type CreatedUser } from "../../_components/create-user-modal";
import { adminSaveCustomerAddress } from "../../../firebase";

const inr = (n: number | undefined | null) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Server payload types ──────────────────────────────────────────────────────
type Customer = {
  id: string; name: string; phone: string; email: string | null; city: string | null; state: string | null; address: string | null;
  // Structured delivery address (checkout-written fields); the order's customerAddress is composed from these.
  addressArea?: string | null; addressCity?: string | null; addressDistrict?: string | null; addressState?: string | null; addressPincode?: string | null;
};
type Retailer = { id: string; phone: string; shopName: string; city: string | null; state: string | null; gstin: string | null; address: string | null };
/** Editable customer delivery address, matching the users/{phone} field schema. */
type CustAddr = { area: string; city: string; district: string; state: string; pincode: string };
type ProductRow = { copyId: string; productId: string; name: string; price: number; image: string | null; variants: { unit: string; price: number }[]; gstApplicable: boolean; gstRate: number };
type CartLine = { productId: string; copyId: string; name: string; qty: number; variantUnit: string; variants: { unit: string; price: number }[]; price: number };

type Pricing = {
  lines: { productId: string; name: string; unitPrice: number; qty: number; lineTotal: number; variantUnit?: string; gstApplicable: boolean; gstRate: number; priceSource: string }[];
  subtotal: number; totalGst: number; totalGstAdded: number; deliveryCharge: number;
  deliveryCalculated: number; deliveryOverridden: boolean;
  deliveryBreakdown: { slab: number; extra: number; free: boolean; waived: number }; deliveryType: string; grandTotal: number;
};
type Verification = {
  ok: boolean; blocking: string[]; warnings: string[]; razorpayPaymentId: string; razorpayOrderId: string | null;
  status: string | null; amountPaise: number | null; amountRupees: number | null; method: string | null;
  contact: string | null; email: string | null; createdAt: number | null; notesUserId: string | null;
  existingOrderIds: string[]; isOwnManualOrder: boolean; verifiedVia: "razorpay" | "internal_record" | "admin_override";
};
type PaymentRow = {
  id: string; razorpayOrderId: string | null; amount: number; amountPaise: number; status: string;
  method: string | null; contact: string | null; email: string | null; createdAt: number | null;
  buyerUserId: string | null; isSubscription: boolean; alreadyLinked: boolean; linkedOrderIds: string[]; note: string | null;
  fromInternal?: boolean;
};
// Combined verification of the 1–N payments backing one order (server mirror of
// ManualMultiPaymentVerification). `payments` carries the per-payment detail.
type MultiVerification = {
  ok: boolean; blocking: string[]; warnings: string[];
  payments: Verification[];
  combinedAmountPaise: number | null; combinedAmountRupees: number | null;
  expectedTotalRupees: number | null; orderId: string | null;
};
type LinkedPaymentDetail = { razorpayPaymentId: string; razorpayOrderId: string | null; amount: number; method: string | null; contact: string | null; email: string | null; createdAt: number | null };
type PaymentSummary = { mode: "razorpay" | "offline"; status: string; amount: number; method: string | null; razorpayPaymentId: string | null; razorpayPaymentIds: string[]; payments: LinkedPaymentDetail[] };
type CreateResult = { ok: true; orderId: string; alreadyExisted: boolean; status: string; grandTotal: number; payment: PaymentSummary; invoice: { ok: boolean; generated?: boolean; pending?: boolean; invoiceNumber?: string; error?: string } };

type OfflineMethod = "cash" | "upi" | "other";
const OFFLINE_METHOD_LABEL: Record<OfflineMethod, string> = { cash: "Cash", upi: "UPI", other: "Other (offline)" };

const STEPS = ["Customer", "Retailer", "Products", "Review", "Payment", "Confirm", "Create"] as const;

const emptyAddr = (): CustAddr => ({ area: "", city: "", district: "", state: "", pincode: "" });
const addrFromCustomer = (c: Customer): CustAddr => ({
  area:     c.addressArea     ?? "",
  city:     c.addressCity     ?? c.city ?? "",
  district: c.addressDistrict ?? "",
  state:    c.addressState    ?? c.state ?? "",
  pincode:  c.addressPincode  ?? "",
});
const composeAddr = (a: CustAddr): string =>
  [a.area, a.city, a.district, a.state, a.pincode].map((s) => s.trim()).filter(Boolean).join(", ");

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authedJsonHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed.");
  return json as T;
}
async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: await authedJsonHeaders(), body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed.");
  return json as T;
}

// ── Generic server-backed autocomplete ────────────────────────────────────────
function AsyncSearch<T extends { id?: string; copyId?: string }>({
  placeholder, fetcher, renderOption, onPick, icon: Icon, minChars = 2,
}: {
  placeholder: string;
  fetcher: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  icon: React.ElementType;
  /** 0 = browse mode: load the full list immediately and filter as you type. */
  minChars?: number;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (q.trim().length < minChars) { if (minChars > 0) setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetcher(q.trim())
        .then((r) => { if (!cancelled) { setResults(r); setOpen(true); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, fetcher, minChars]);

  // Browse mode: load the full list once on mount so the dropdown is populated
  // before the user types anything.
  useEffect(() => {
    if (minChars > 0) return;
    let cancelled = false;
    setLoading(true);
    fetcher("")
      .then((r) => { if (!cancelled) setResults(r); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetcher, minChars]);

  return (
    <div ref={wrapRef} className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-9 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
      {open && (results.length > 0 || (!loading && q.trim().length >= minChars)) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-outline-variant/40 bg-white shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-4 text-sm text-on-surface-variant text-center">
              {loading ? "Loading…" : q.trim() ? `No results for “${q.trim()}”.` : "No products found for this retailer."}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-outline-variant/10">
              {results.map((item, i) => (
                <li key={(item.id ?? item.copyId ?? String(i))}>
                  <button
                    type="button"
                    onMouseDown={() => { onPick(item); setOpen(false); if (minChars > 0) { setQ(""); setResults([]); } }}
                    className="w-full px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors"
                  >
                    {renderOption(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            i === step ? "bg-primary text-white" : i < step ? "bg-green-100 text-green-700" : "bg-surface-container text-on-surface-variant"
          }`}>
            {i < step ? <Check className="h-3 w-3" /> : <span className="font-black">{i + 1}</span>}
            {label}
          </span>
          {i < STEPS.length - 1 && <span className="text-on-surface-variant/40">›</span>}
        </div>
      ))}
    </div>
  );
}

function Banner({ tone, children }: { tone: "error" | "warn" | "ok" | "info"; children: React.ReactNode }) {
  const map = {
    error: "bg-red-50 border-red-200 text-red-800",
    warn: "bg-amber-50 border-amber-200 text-amber-800",
    ok: "bg-green-50 border-green-200 text-green-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  } as const;
  const Icon = tone === "ok" ? CheckCircle2 : tone === "error" || tone === "warn" ? AlertTriangle : FileText;
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${map[tone]}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function CreateManualOrderPage() {
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  // Editable customer delivery address, seeded from the selected customer and
  // saved back to Firestore (and used on the order) from the Confirm step.
  const [custAddr, setCustAddr] = useState<CustAddr>(emptyAddr());
  const [editingAddr, setEditingAddr] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrMsg, setAddrMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  // Select a customer (from search or just-created) and seed the editable address.
  const pickCustomer = (c: Customer) => {
    setCustomer(c);
    setCustAddr(addrFromCustomer(c));
    setEditingAddr(false);
    setAddrMsg(null);
  };
  const clearCustomer = () => { setCustomer(null); setCustAddr(emptyAddr()); setEditingAddr(false); setAddrMsg(null); };

  // Map a newly-created customer (CreateUserModal) onto the wizard's Customer shape.
  const onCustomerCreated = (u: CreatedUser | null) => {
    if (!u) return;
    pickCustomer({
      id: u.id, name: u.name, phone: u.phone, email: u.email,
      city: u.city, state: u.state, address: u.address,
      addressArea: null, addressCity: u.city, addressDistrict: null, addressState: u.state, addressPincode: null,
    });
    setShowCreateCustomer(false);
  };
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [pricingBusy, setPricingBusy] = useState(false);
  // null = use the calculated delivery; a number = admin override (₹), incl. 0.
  const [deliveryOverride, setDeliveryOverride] = useState<number | null>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsBusy, setPaymentsBusy] = useState(false);
  const [paymentIdInput, setPaymentIdInput] = useState("");
  // Date window for the captured-payment list. Defaults to yesterday → today so a
  // payment received yesterday is in range out of the box.
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [payFrom, setPayFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); });
  const [payTo, setPayTo] = useState(() => ymd(new Date()));
  // The 1–N captured payments the admin has selected to back this order. Their
  // combined amount must equal the order total; each is verified individually and
  // the combined result lives in `multiVerification`.
  const [selectedPayments, setSelectedPayments] = useState<PaymentRow[]>([]);
  const [multiVerification, setMultiVerification] = useState<MultiVerification | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const selectedPaymentIds = selectedPayments.map((p) => p.id);
  // Offline payment collected by the retailer (cash/UPI/other). Mutually exclusive
  // with a linked Razorpay payment. `key` is a one-time idempotency token so a
  // retry/double-submit returns the same order instead of creating a second one.
  const [offlineMethod, setOfflineMethod] = useState<OfflineMethod>("cash");
  const [offlinePay, setOfflinePay] = useState<{ method: OfflineMethod; key: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    const r = await apiGet<{ results: Customer[] }>(`/api/admin/manual-order/search?type=customer&q=${encodeURIComponent(q)}`);
    return r.results;
  }, []);
  const searchRetailers = useCallback(async (q: string) => {
    const r = await apiGet<{ results: Retailer[] }>(`/api/admin/manual-order/search?type=retailer&q=${encodeURIComponent(q)}`);
    return r.results;
  }, []);
  const searchProducts = useCallback(async (q: string) => {
    if (!retailer) return [];
    const r = await apiGet<{ results: ProductRow[] }>(`/api/admin/manual-order/search?type=product&retailerPhone=${encodeURIComponent(retailer.phone)}&q=${encodeURIComponent(q)}`);
    return r.results;
  }, [retailer]);

  const itemsPayload = () => cart.map((l) => ({ productId: l.productId, copyId: l.copyId, qty: l.qty, variantUnit: l.variantUnit || undefined }));

  // Re-price whenever the Review or Payment step is active and the cart changes.
  // When payment ids are supplied, the server also returns the combined
  // verification for that exact set of payments against the re-priced total.
  const review = useCallback(async (razorpayPaymentIds?: string[]) => {
    if (!retailer || cart.length === 0) return;
    setPricingBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ pricing: Pricing; multiVerification: MultiVerification | null }>("/api/admin/manual-order/review", {
        sellerPhone: retailer.phone,
        items: itemsPayload(),
        customerId: customer?.id,
        customerDeliveryState: (custAddr.state || customer?.state) ?? undefined,
        deliveryCharge: deliveryOverride,
        razorpayPaymentIds,
      });
      setPricing(r.pricing);
      if (razorpayPaymentIds) setMultiVerification(r.multiVerification);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not price the order.");
    } finally {
      setPricingBusy(false);
    }
  }, [retailer, cart, customer, custAddr.state, deliveryOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const goReview = async () => { await review(); setStep(3); };

  const loadPayments = async () => {
    setPaymentsBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (payFrom) params.set("from", String(Math.floor(new Date(`${payFrom}T00:00:00`).getTime() / 1000)));
      if (payTo) params.set("to", String(Math.floor(new Date(`${payTo}T23:59:59`).getTime() / 1000)));
      const r = await apiGet<{ payments: PaymentRow[] }>(`/api/admin/manual-order/payments?${params.toString()}`);
      setPayments(r.payments.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.");
    } finally {
      setPaymentsBusy(false);
    }
  };

  const lookupPaymentId = async () => {
    const id = paymentIdInput.trim();
    if (!id) return;
    setPaymentsBusy(true);
    setError(null);
    try {
      const r = await apiGet<{ payment: PaymentRow }>(`/api/admin/manual-order/payments?paymentId=${encodeURIComponent(id)}`);
      setPayments((prev) => [r.payment, ...prev.filter((p) => p.id !== r.payment.id)]);
      setPaymentIdInput("");
      await addPayment(r.payment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment not found.");
    } finally {
      setPaymentsBusy(false);
    }
  };

  // Re-verify the given set of selected payments against the current order total.
  const verifySelection = async (rows: PaymentRow[]) => {
    if (rows.length === 0) { setMultiVerification(null); return; }
    setVerifyBusy(true);
    try {
      await review(rows.map((p) => p.id));
    } finally {
      setVerifyBusy(false);
    }
  };

  // Toggle a payment in/out of the selection. Razorpay and offline are mutually
  // exclusive, so selecting a payment clears any offline record. A payment that is
  // already linked / a subscription can't be added (guarded by the caller too).
  const togglePayment = async (row: PaymentRow) => {
    setOfflinePay(null);
    const already = selectedPayments.some((p) => p.id === row.id);
    const next = already
      ? selectedPayments.filter((p) => p.id !== row.id)
      : [...selectedPayments, row];
    setSelectedPayments(next);
    await verifySelection(next);
  };

  // Add a payment (from the manual-id lookup) to the selection if not present.
  const addPayment = async (row: PaymentRow) => {
    if (selectedPayments.some((p) => p.id === row.id)) return;
    setOfflinePay(null);
    const next = [...selectedPayments, row];
    setSelectedPayments(next);
    await verifySelection(next);
  };

  const removePayment = async (paymentId: string) => {
    const next = selectedPayments.filter((p) => p.id !== paymentId);
    setSelectedPayments(next);
    await verifySelection(next);
  };

  const create = async () => {
    if (!customer || !retailer || !(selectedPaymentIds.length > 0 || offlinePay)) return;
    setCreating(true);
    setError(null);
    try {
      const r = await apiPost<CreateResult>("/api/admin/manual-order", {
        sellerPhone: retailer.phone,
        // Exactly one payment path: an offline retailer-collected payment, or the
        // set of verified Razorpay payments backing this order.
        ...(offlinePay
          ? { offline: { method: offlinePay.method, idempotencyKey: offlinePay.key } }
          : { razorpayPaymentIds: selectedPaymentIds }),
        customer: {
          id: customer.id, name: customer.name, phone: customer.phone,
          email: customer.email,
          // The composed, possibly-edited delivery address; falls back to the flat
          // address field, and ultimately the server's "pending" placeholder.
          address: composeAddr(custAddr) || customer.address || null,
          deliveryState: (custAddr.state || customer.state) ?? null,
        },
        items: itemsPayload(),
        deliveryCharge: deliveryOverride,
      });
      setResult(r);
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order creation failed.");
    } finally {
      setCreating(false);
    }
  };

  const addProduct = (p: ProductRow) => {
    setCart((prev) => {
      if (prev.some((l) => l.copyId === p.copyId)) return prev;
      const defaultVariant = p.variants[0]?.unit ?? "";
      return [...prev, { productId: p.productId, copyId: p.copyId, name: p.name, qty: 1, variantUnit: defaultVariant, variants: p.variants, price: p.price }];
    });
    setPricing(null);
    setMultiVerification(null);
  };
  const updateLine = (copyId: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => (l.copyId === copyId ? { ...l, ...patch } : l)));
    setPricing(null);
    setMultiVerification(null);
  };
  const removeLine = (copyId: string) => {
    setCart((prev) => prev.filter((l) => l.copyId !== copyId));
    setPricing(null);
    setMultiVerification(null);
  };

  // Delivery can be overridden by the admin. Subtotal and GST don't depend on it,
  // so the effective total is recomputed on the client the instant it changes; the
  // server re-prices authoritatively at payment-verify and at create.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const effectiveDelivery = pricing ? (deliveryOverride !== null ? deliveryOverride : pricing.deliveryCalculated) : 0;
  const effectiveTotal = pricing ? round2(pricing.subtotal + pricing.totalGstAdded + effectiveDelivery) : 0;

  // Changing delivery changes the payable total, so any payment picked against the
  // old total must be re-confirmed — drop the Razorpay selection AND any offline
  // record when the override changes.
  useEffect(() => {
    setSelectedPayments([]);
    setMultiVerification(null);
    setOfflinePay(null);
  }, [deliveryOverride]);

  // Entering the Payment step: load the recent captured-payments list up front so
  // the primary "Browse" option is populated without an extra click.
  useEffect(() => {
    if (step === 4 && payments.length === 0 && !paymentsBusy) void loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Record the retailer-collected offline payment, clearing any Razorpay selection.
  const recordOffline = () => {
    setSelectedPayments([]);
    setMultiVerification(null);
    setOfflinePay({ method: offlineMethod, key: (crypto as Crypto).randomUUID() });
  };
  const clearOffline = () => setOfflinePay(null);

  const setDelivery = (raw: string) => {
    const t = raw.trim();
    if (t === "") { setDeliveryOverride(pricing ? round2(pricing.deliveryCalculated) : 0); return; }
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) setDeliveryOverride(round2(n));
  };

  // Persist the edited delivery address to the customer's Firestore record (the
  // existing users/{phone} schema, via the shared adminSaveCustomerAddress helper),
  // then re-price in case the state changed the delivery slab.
  const saveAddress = async () => {
    if (!customer) return;
    setSavingAddr(true); setAddrMsg(null);
    try {
      await adminSaveCustomerAddress(customer.id, custAddr);
      setCustomer((c) => c ? {
        ...c,
        addressArea: custAddr.area || null, addressCity: custAddr.city || null,
        addressDistrict: custAddr.district || null, addressState: custAddr.state || null,
        addressPincode: custAddr.pincode || null,
      } : c);
      setEditingAddr(false);
      setAddrMsg({ ok: true, text: "Delivery address saved to the customer's record." });
      await review(selectedPaymentIds.length > 0 ? selectedPaymentIds : undefined);
    } catch (e) {
      setAddrMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save address." });
    } finally {
      setSavingAddr(false);
    }
  };

  // A payment is "linked" when either the selected Razorpay payment(s) verify OK as
  // a set (combined amount matches), or an offline payment has been recorded.
  const canLink = Boolean(
    customer && retailer && cart.length > 0 &&
      ((selectedPaymentIds.length > 0 && multiVerification?.ok) || offlinePay),
  );
  const canCreate = Boolean(canLink && !editingAddr && !creating);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-surface-container">
          <ArrowLeft className="h-3.5 w-3.5" /> Orders
        </Link>
        <h1 className="text-lg sm:text-2xl font-black text-on-surface">Create order manually</h1>
      </div>
      <p className="text-xs sm:text-sm text-on-surface-variant -mt-2">
        For a customer whose payment succeeded but whose order was never created. The order is placed only against a verified captured payment.
      </p>

      <StepHeader step={step} />

      {error && <Banner tone="error"><p className="whitespace-pre-wrap">{error}</p></Banner>}

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:p-5 space-y-4">
        {/* STEP 0 — Customer */}
        {step === 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Select customer</p>
              {!customer && (
                <button type="button" onClick={() => setShowCreateCustomer(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
                  <UserPlus className="h-3.5 w-3.5" /> Create customer
                </button>
              )}
            </div>
            {customer ? (
              <>
                <SelectedCard onClear={clearCustomer} icon={User}>
                  <p className="font-bold text-on-surface">{customer.name}</p>
                  <p className="text-xs text-on-surface-variant">{customer.phone}{customer.city ? ` · ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""}</p>
                  <p className="text-[11px] text-on-surface-variant font-mono break-all">{customer.id}</p>
                </SelectedCard>
                <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Delivery address</p>
                  <CustomerAddressEditor
                    addr={custAddr} setAddr={setCustAddr}
                    editing={editingAddr} setEditing={(v) => { setEditingAddr(v); setAddrMsg(null); }}
                    onReset={() => { setCustAddr(addrFromCustomer(customer)); setEditingAddr(false); setAddrMsg(null); }}
                    onSave={() => void saveAddress()} saving={savingAddr} msg={addrMsg}
                  />
                </div>
              </>
            ) : (
              <AsyncSearch<Customer>
                placeholder="Search customer by phone, name or email…"
                icon={Search}
                fetcher={searchCustomers}
                onPick={pickCustomer}
                renderOption={(c) => (
                  <div><p className="font-semibold text-on-surface text-sm">{c.name}</p>
                    <p className="text-xs text-on-surface-variant">{c.phone}{c.city ? ` · ${c.city}` : ""}</p></div>
                )}
              />
            )}
            <p className="text-[11px] text-on-surface-variant">
              Can&apos;t find the customer? Use <span className="font-bold">Create customer</span> — they&apos;re registered as a regular user and selected here automatically.
            </p>
          </div>
        )}

        {/* STEP 1 — Retailer */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Select retailer (fulfils the order)</p>
            {retailer ? (
              <SelectedCard onClear={() => { setRetailer(null); setCart([]); setPricing(null); setDeliveryOverride(null); }} icon={Store}>
                <p className="font-bold text-on-surface">{retailer.shopName}</p>
                <p className="text-xs text-on-surface-variant flex items-center gap-1"><Phone className="h-3 w-3" />{retailer.phone}</p>
                {(retailer.address || retailer.city || retailer.state) && (
                  <p className="text-xs text-on-surface-variant flex items-start gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    {retailer.address || [retailer.city, retailer.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {retailer.gstin && <p className="text-[11px] text-on-surface-variant mt-0.5">GSTIN: {retailer.gstin}</p>}
              </SelectedCard>
            ) : (
              <AsyncSearch<Retailer>
                placeholder="Search retailer by shop name, phone or city…"
                icon={Search}
                fetcher={searchRetailers}
                onPick={(r) => { setRetailer(r); setCart([]); setDeliveryOverride(null); }}
                renderOption={(r) => (
                  <div><p className="font-semibold text-on-surface text-sm">{r.shopName}</p>
                    <p className="text-xs text-on-surface-variant">{r.phone}{r.city ? ` · ${r.city}` : ""}</p></div>
                )}
              />
            )}
          </div>
        )}

        {/* STEP 2 — Products */}
        {step === 2 && retailer && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Add {retailer.shopName}&apos;s products</p>
            <AsyncSearch<ProductRow>
              placeholder="Search or browse this retailer's products…"
              icon={Package}
              minChars={0}
              fetcher={searchProducts}
              onPick={addProduct}
              renderOption={(p) => (
                <div className="flex items-center justify-between gap-2">
                  <div><p className="font-semibold text-on-surface text-sm">{p.name}</p>
                    <p className="text-[11px] text-on-surface-variant font-mono">{p.productId}</p></div>
                  <span className="text-xs font-bold text-on-surface">{inr(p.price)}</span>
                </div>
              )}
            />
            {cart.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No products added yet.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((l) => (
                  <div key={l.copyId} className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/30 bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-on-surface truncate">{l.name}</p>
                      <p className="text-[11px] text-on-surface-variant font-mono">{l.productId}</p>
                    </div>
                    {l.variants.length > 0 && (
                      <select
                        value={l.variantUnit}
                        onChange={(e) => updateLine(l.copyId, { variantUnit: e.target.value })}
                        className="rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs"
                      >
                        {l.variants.map((v) => <option key={v.unit} value={v.unit}>{v.unit} ({inr(v.price)})</option>)}
                      </select>
                    )}
                    <input
                      type="number" min={1} value={l.qty}
                      onChange={(e) => updateLine(l.copyId, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      className="w-16 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs text-center"
                    />
                    <button type="button" onClick={() => removeLine(l.copyId)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Review order</p>
            {pricingBusy ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Pricing…</div>
            ) : pricing ? (
              <PricingTable
                pricing={pricing}
                effectiveDelivery={effectiveDelivery}
                effectiveTotal={effectiveTotal}
                overridden={deliveryOverride !== null && round2(deliveryOverride) !== round2(pricing.deliveryCalculated)}
                onDeliveryChange={setDelivery}
                onResetDelivery={() => setDeliveryOverride(null)}
              />
            ) : (
              <button type="button" onClick={() => void review()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">
                <RefreshCw className="h-3.5 w-3.5" /> Price order
              </button>
            )}
          </div>
        )}

        {/* STEP 4 — Payment */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base sm:text-lg font-black text-on-surface">Payment for this order</h2>
              <p className="text-sm text-on-surface-variant">Choose how this order was paid. You can link one Razorpay payment, split it across several, or record an offline payment.</p>
            </div>
            {pricing && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-sm text-on-surface-variant">Order total to match</p>
                <p className="text-2xl font-black text-on-surface">{inr(effectiveTotal)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  subtotal {inr(pricing.subtotal)}{pricing.totalGstAdded > 0 ? ` + GST ${inr(pricing.totalGstAdded)}` : ""} + delivery {inr(effectiveDelivery)}
                </p>
                {!offlinePay && selectedPayments.length > 0 && (() => {
                  const combined = round2(selectedPayments.reduce((s, p) => s + p.amount, 0));
                  const diff = round2(combined - effectiveTotal);
                  return (
                    <div className="mt-2 border-t border-primary/20 pt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-on-surface-variant">
                        {selectedPayments.length} payment{selectedPayments.length > 1 ? "s" : ""} selected · combined{" "}
                        <span className="font-black text-on-surface">{inr(combined)}</span>
                      </span>
                      {diff === 0 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-green-700"><CheckCircle2 className="h-4 w-4" /> Matches total</span>
                      ) : (
                        <span className="font-bold text-red-700">
                          {diff > 0 ? "Over" : "Short"} by {inr(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Option 1 (primary): browse recent captured Razorpay payments ── */}
            <OptionCard n={1} title="Browse recent captured payments"
              desc="Tick the online payment(s) the customer made through Razorpay. Select several to split one order across multiple payments — their combined amount must equal the order total." icon={CreditCard}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-xs font-bold text-on-surface-variant">
                  From
                  <input type="date" value={payFrom} max={payTo || undefined} onChange={(e) => setPayFrom(e.target.value)}
                    className="mt-1 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-2 text-sm font-semibold text-on-surface" />
                </label>
                <label className="flex flex-col text-xs font-bold text-on-surface-variant">
                  To
                  <input type="date" value={payTo} min={payFrom || undefined} onChange={(e) => setPayTo(e.target.value)}
                    className="mt-1 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-2 text-sm font-semibold text-on-surface" />
                </label>
                <button type="button" onClick={() => void loadPayments()} disabled={paymentsBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-white px-3 py-2 text-sm font-bold text-on-surface hover:bg-surface-container disabled:opacity-50">
                  {paymentsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh list
                </button>
              </div>

              {payments.length > 0 ? (
                <div className="divide-y divide-outline-variant/15 rounded-xl border border-outline-variant/30 bg-white max-h-80 overflow-y-auto">
                  {payments.map((p) => {
                    const blocked = p.alreadyLinked || p.isSubscription;
                    const sel = !offlinePay && selectedPaymentIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" disabled={blocked}
                        onClick={() => void togglePayment(p)}
                        className={`w-full px-3 py-2.5 text-left transition-colors ${sel ? "bg-primary/10" : "hover:bg-surface-container-low"} ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}>
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${sel ? "border-primary bg-primary text-white" : "border-outline-variant/60 bg-white"}`}>
                            {sel && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-bold text-on-surface">{p.id}</p>
                              <p className="text-xs text-on-surface-variant">
                                {p.contact ?? "—"} · {p.method ?? "—"} · {p.createdAt ? new Date(p.createdAt * 1000).toLocaleDateString("en-IN") : "—"}
                                {p.fromInternal ? " · via internal ledger" : ""}
                              </p>
                              {p.note && <p className="text-xs text-on-surface-variant/80">{p.note}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-base text-on-surface">{inr(p.amount)}</p>
                              {p.isSubscription && <p className="text-[11px] font-bold text-amber-700">subscription</p>}
                              {p.alreadyLinked && <p className="text-[11px] font-bold text-red-700">linked → {p.linkedOrderIds.join(", ") || "order"}</p>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">{paymentsBusy ? "Loading captured payments…" : "No captured payments in this date range. Widen the dates, or use one of the options below."}</p>
              )}
            </OptionCard>

            {/* ── Option 2: paste a Razorpay payment ID not in the list ── */}
            <OptionCard n={2} title="Add a Payment ID manually"
              desc="Paste a Razorpay Payment ID that isn't in the list to add it to the selection. It's verified directly with Razorpay before linking." icon={Search}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                  <input
                    value={paymentIdInput}
                    onChange={(e) => setPaymentIdInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void lookupPaymentId(); }}
                    placeholder="pay_XXXXXXXXXXXXXX"
                    className="w-full rounded-lg border border-outline-variant/40 bg-white pl-9 pr-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button type="button" onClick={() => void lookupPaymentId()} disabled={paymentsBusy || !paymentIdInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-40">
                  {paymentsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Verify &amp; add
                </button>
              </div>
              <p className="text-sm text-on-surface-variant">Only payments that Razorpay confirms as successful (captured, INR, same customer) can be linked, and the combined amount must equal the order total.</p>
            </OptionCard>

            {/* ── Option 3: offline payment collected by the retailer ── */}
            <OptionCard n={3} title="Payment collected by retailer"
              desc="Use when the customer paid the retailer directly — cash, UPI, or another offline method." icon={Store} accent="amber">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-xs font-bold text-on-surface-variant">
                  Method
                  <select value={offlineMethod} onChange={(e) => setOfflineMethod(e.target.value as OfflineMethod)}
                    className="mt-1 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-2 text-sm font-semibold text-on-surface">
                    {(Object.keys(OFFLINE_METHOD_LABEL) as OfflineMethod[]).map((m) => (
                      <option key={m} value={m}>{OFFLINE_METHOD_LABEL[m]}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={recordOffline}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700">
                  <Check className="h-4 w-4" /> Record offline payment
                </button>
              </div>
              <p className="text-sm text-on-surface-variant">Recorded as an <span className="font-bold">offline</span> payment for {inr(effectiveTotal)} — it is <span className="font-bold">not</span> a Razorpay payment.</p>
            </OptionCard>

            {/* ── Linked-payment status (whichever option was chosen) ── */}
            {offlinePay ? (
              <div className="space-y-2">
                <Banner tone="ok">Offline payment recorded: <span className="font-bold">{OFFLINE_METHOD_LABEL[offlinePay.method]}</span> collected by the retailer, {inr(effectiveTotal)}.</Banner>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-sm font-semibold text-amber-900">Retailer-collected · {OFFLINE_METHOD_LABEL[offlinePay.method]} · {inr(effectiveTotal)}</span>
                  <button type="button" onClick={clearOffline} className="text-xs font-bold text-amber-800 hover:underline">Change</button>
                </div>
              </div>
            ) : (
              <>
                {/* Selected payments — each with id, amount, date, customer info. */}
                {selectedPayments.length > 0 && (
                  <div className="rounded-xl border border-outline-variant/30 bg-white divide-y divide-outline-variant/10">
                    {selectedPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-bold text-on-surface break-all">{p.id}</p>
                          <p className="text-xs text-on-surface-variant">
                            {p.contact ?? "—"} · {p.method ?? "—"} · {p.createdAt ? new Date(p.createdAt * 1000).toLocaleDateString("en-IN") : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-black text-on-surface">{inr(p.amount)}</span>
                          <button type="button" onClick={() => void removePayment(p.id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Remove payment">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {verifyBusy && <div className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Verifying against Razorpay…</div>}
                {multiVerification && !verifyBusy && (
                  <div className="space-y-2">
                    {multiVerification.ok
                      ? <Banner tone="ok">
                          {selectedPayments.length > 1
                            ? `All ${selectedPayments.length} payments verified — combined ${inr(multiVerification.combinedAmountRupees ?? 0)} matches the order total.`
                            : "Payment verified and matches the order total."}
                        </Banner>
                      : <Banner tone="error"><p className="font-bold mb-1">Cannot use {selectedPayments.length > 1 ? "these payments" : "this payment"}:</p><ul className="list-disc pl-4 space-y-0.5">{multiVerification.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul></Banner>}
                    {multiVerification.warnings.length > 0 && (
                      <Banner tone="warn"><ul className="list-disc pl-4 space-y-0.5">{multiVerification.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Banner>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 5 — Confirm */}
        {step === 5 && customer && retailer && pricing && (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Final review</p>

            {/* Customer */}
            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Customer</p>
              <p className="font-bold text-on-surface text-sm">{customer.name}</p>
              <p className="text-xs text-on-surface-variant flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</p>
              <CustomerAddressEditor
                addr={custAddr} setAddr={setCustAddr}
                editing={editingAddr} setEditing={(v) => { setEditingAddr(v); setAddrMsg(null); }}
                onReset={() => { setCustAddr(addrFromCustomer(customer)); setEditingAddr(false); setAddrMsg(null); }}
                onSave={() => void saveAddress()} saving={savingAddr} msg={addrMsg}
              />
            </div>

            {/* Retailer */}
            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><Store className="h-3.5 w-3.5" /> Retailer</p>
              <p className="font-bold text-on-surface text-sm">{retailer.shopName}</p>
              <p className="text-xs text-on-surface-variant flex items-center gap-1"><Phone className="h-3 w-3" />{retailer.phone}</p>
              {(retailer.address || retailer.city || retailer.state) && (
                <p className="text-xs text-on-surface-variant flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  {retailer.address || [retailer.city, retailer.state].filter(Boolean).join(", ")}
                </p>
              )}
            </div>

            {/* Order */}
            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Order</p>
              <PricingTable
                pricing={pricing}
                effectiveDelivery={effectiveDelivery}
                effectiveTotal={effectiveTotal}
                overridden={deliveryOverride !== null && round2(deliveryOverride) !== round2(pricing.deliveryCalculated)}
                onDeliveryChange={setDelivery}
                onResetDelivery={() => setDeliveryOverride(null)}
                readOnly
              />
            </div>

            {/* Payment */}
            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payment</p>
              {offlinePay ? (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                    <Store className="h-3.5 w-3.5" /> Retailer-collected (offline)
                  </span>
                  <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest divide-y divide-outline-variant/10">
                    {([["Method", OFFLINE_METHOD_LABEL[offlinePay.method]], ["Amount", inr(effectiveTotal)], ["Status", "Collected"]] as [string, string][]).map(([k, val]) => (
                      <div key={k} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="text-on-surface-variant">{k}</span><span className="text-on-surface font-semibold text-right">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : multiVerification?.ok && selectedPayments.length > 0 ? (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-black text-green-800">
                    <CreditCard className="h-3.5 w-3.5" /> Razorpay — {selectedPayments.length > 1 ? `${selectedPayments.length} payments verified` : "verified"}
                  </span>
                  <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest divide-y divide-outline-variant/10">
                    {selectedPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="font-mono text-on-surface-variant break-all">{p.id}</span>
                        <span className="text-on-surface font-semibold text-right shrink-0">{inr(p.amount)}</span>
                      </div>
                    ))}
                    {selectedPayments.length > 1 && (
                      <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs bg-green-50">
                        <span className="text-on-surface-variant font-bold">Combined</span>
                        <span className="text-on-surface font-black text-right">{inr(multiVerification.combinedAmountRupees ?? effectiveTotal)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Banner tone="warn">No payment linked. Go back and choose one.</Banner>
              )}
            </div>

            {!canLink && <Banner tone="warn">Link or record a payment before creating the order.</Banner>}
          </div>
        )}

        {/* STEP 6 — Result */}
        {step === 6 && result && (
          <div className="space-y-3">
            <Banner tone="ok">
              <p className="font-bold">{result.alreadyExisted ? "Order already existed (not re-created)." : "Order created."}</p>
              <p className="mt-1">Order ID <span className="font-mono font-bold">{result.orderId}</span> · status <span className="font-bold">{result.status}</span> · {inr(result.grandTotal)}</p>
            </Banner>
            <div className="rounded-xl border border-outline-variant/30 bg-white p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant mb-1.5">Payment</p>
              {result.payment.mode === "offline" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                  <Store className="h-3.5 w-3.5" /> Retailer-collected (offline) · {result.payment.method ?? "—"} · {inr(result.payment.amount)}
                </span>
              ) : (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-black text-green-800">
                    <CreditCard className="h-3.5 w-3.5" /> Razorpay · {result.payment.method ?? "—"} · {inr(result.payment.amount)}
                    {(result.payment.razorpayPaymentIds?.length ?? 0) > 1 ? ` · ${result.payment.razorpayPaymentIds.length} payments` : ""}
                  </span>
                  {(result.payment.payments?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest divide-y divide-outline-variant/10">
                      {result.payment.payments.map((p) => (
                        <div key={p.razorpayPaymentId} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                          <span className="font-mono text-on-surface-variant break-all">{p.razorpayPaymentId}</span>
                          <span className="text-on-surface font-semibold text-right shrink-0">{inr(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {result.invoice.ok && result.invoice.pending
              ? <Banner tone="info">The invoice will be created when the seller accepts the order.</Banner>
              : result.invoice.ok
              ? <Banner tone="info">Invoice {result.invoice.generated ? "generated" : "already present"}{result.invoice.invoiceNumber ? `: ${result.invoice.invoiceNumber}` : ""}.</Banner>
              : <Banner tone="warn">Invoice not generated: {result.invoice.error ?? "unknown error"}. You can safely re-run Create to retry — it will not duplicate the order or notifications.</Banner>}
            <Banner tone="info">Customer and seller WhatsApp notifications and inventory are handled automatically by the existing order triggers — exactly once.</Banner>
            <div className="flex gap-2">
              <Link href="/admin/orders" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Go to Orders</Link>
            </div>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      {step < 6 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-bold text-on-surface-variant disabled:opacity-40">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          {step === 0 && <NextBtn disabled={!customer} onClick={() => setStep(1)} />}
          {step === 1 && <NextBtn disabled={!retailer} onClick={() => setStep(2)} />}
          {step === 2 && <NextBtn disabled={cart.length === 0} onClick={() => void goReview()} label="Review" />}
          {step === 3 && <NextBtn disabled={!pricing || pricingBusy} onClick={() => setStep(4)} label="Choose payment" icon={CreditCard} />}
          {step === 4 && <NextBtn disabled={!canLink} onClick={() => setStep(5)} label="Review & confirm" />}
          {step === 5 && (
            <button type="button" disabled={!canCreate} onClick={() => void create()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="h-3.5 w-3.5" />} Create order
            </button>
          )}
        </div>
      )}

      {/* Create-customer modal — reuses the shared Create User form, locked to the
          customer role; the new customer is selected automatically on success. */}
      <CreateUserModal
        open={showCreateCustomer}
        onClose={() => setShowCreateCustomer(false)}
        onCreated={onCustomerCreated}
        lockRole="customer"
        title="Create customer"
      />
    </div>
  );
}

/**
 * Customer delivery-address viewer/editor. Shown on both the Customer step (edit
 * early, no payment needed) and the final Confirm step. Saving writes to the
 * customer's Firestore record via the parent's onSave.
 */
function CustomerAddressEditor({
  addr, setAddr, editing, setEditing, onReset, onSave, saving, msg,
}: {
  addr: CustAddr;
  setAddr: (fn: (a: CustAddr) => CustAddr) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  msg: { ok: boolean; text: string } | null;
}) {
  return (
    <div className="space-y-2">
      {!editing ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-on-surface-variant flex items-start gap-1 min-w-0">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            {composeAddr(addr) || <span className="text-amber-700 font-semibold">No delivery address saved — add one.</span>}
          </p>
          <button type="button" onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/5 shrink-0">
            <Pencil className="h-3 w-3" /> Edit address
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <AddrField label="Area / street" value={addr.area} onChange={(v) => setAddr((a) => ({ ...a, area: v }))} />
            <AddrField label="City" value={addr.city} onChange={(v) => setAddr((a) => ({ ...a, city: v }))} />
            <AddrField label="District" value={addr.district} onChange={(v) => setAddr((a) => ({ ...a, district: v }))} />
            <AddrField label="State" value={addr.state} onChange={(v) => setAddr((a) => ({ ...a, state: v }))} />
            <AddrField label="Pincode" value={addr.pincode} onChange={(v) => setAddr((a) => ({ ...a, pincode: v }))} />
          </div>
          <p className="text-[10px] text-on-surface-variant">Saved to the customer&apos;s record and used on this order. Changing the state may re-price delivery.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSave} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save address
            </button>
            <button type="button" onClick={onReset} disabled={saving}
              className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-bold text-on-surface-variant disabled:opacity-50">Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-[11px] font-semibold ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

/** One of the three clearly separated payment options, with a numbered heading. */
function OptionCard({
  n, title, desc, icon: Icon, accent = "primary", children,
}: {
  n: number; title: string; desc: string; icon: React.ElementType;
  accent?: "primary" | "amber"; children: React.ReactNode;
}) {
  const ring = accent === "amber" ? "border-amber-300" : "border-outline-variant/40";
  const badge = accent === "amber" ? "bg-amber-600" : "bg-primary";
  return (
    <div className={`rounded-2xl border ${ring} bg-surface-container-lowest p-4 space-y-3`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${badge} text-sm font-black text-white`}>{n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-on-surface flex items-center gap-1.5"><Icon className="h-4 w-4" /> {title}</h3>
          <p className="text-sm text-on-surface-variant">{desc}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AddrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-on-surface-variant">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </label>
  );
}

function NextBtn({ disabled, onClick, label = "Next", icon: Icon = ArrowRight }: { disabled: boolean; onClick: () => void; label?: string; icon?: React.ElementType }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
      {label} <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function SelectedCard({ children, icon: Icon, onClear }: { children: React.ReactNode; icon: React.ElementType; onClear: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" onClick={onClear} className="rounded-lg p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
    </div>
  );
}

function PricingTable({
  pricing, effectiveDelivery, effectiveTotal, overridden, onDeliveryChange, onResetDelivery, readOnly = false,
}: {
  pricing: Pricing;
  effectiveDelivery: number;
  effectiveTotal: number;
  overridden: boolean;
  onDeliveryChange: (raw: string) => void;
  onResetDelivery: () => void;
  /** Confirm step: delivery is already set — render it as a read-only figure. */
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-white">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container-low">
              <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Product</th>
              <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Pack</th>
              <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Price</th>
              <th className="px-3 py-2 text-center font-black uppercase tracking-wider text-on-surface-variant">Qty</th>
              <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Line</th>
            </tr>
          </thead>
          <tbody>
            {pricing.lines.map((l, i) => (
              <tr key={i} className="border-b border-outline-variant/10 last:border-0">
                <td className="px-3 py-2">
                  <p className="font-semibold text-on-surface">{l.name}</p>
                  {l.priceSource !== "seller-copy" && l.priceSource !== "inventory" && (
                    <p className="text-[10px] text-amber-700">price source: {l.priceSource}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-on-surface-variant">{l.variantUnit || "—"}</td>
                <td className="px-3 py-2 text-right text-on-surface-variant">{inr(l.unitPrice)}{l.gstApplicable ? ` (GST ${l.gstRate}%)` : ""}</td>
                <td className="px-3 py-2 text-center font-bold">{l.qty}</td>
                <td className="px-3 py-2 text-right font-bold">{inr(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto max-w-sm space-y-1.5 text-sm">
        <Row label="Subtotal" value={inr(pricing.subtotal)} />
        {pricing.totalGstAdded > 0 && <Row label="GST (added)" value={inr(pricing.totalGstAdded)} />}
        {readOnly ? (
          <Row label="Delivery charge" value={inr(effectiveDelivery)} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-on-surface-variant">Delivery charge</span>
              <div className="flex items-center gap-1.5">
                <span className="text-on-surface-variant">₹</span>
                <input
                  type="number" min={0} step="0.01"
                  value={effectiveDelivery}
                  onChange={(e) => onDeliveryChange(e.target.value)}
                  className="w-24 rounded-lg border border-outline-variant/40 bg-white px-2 py-1 text-sm text-right font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] text-on-surface-variant">
              <span>Calculated: {inr(pricing.deliveryCalculated)}{pricing.deliveryBreakdown.free ? " (free)" : ""}</span>
              {overridden && (
                <button type="button" onClick={onResetDelivery} className="font-bold text-primary hover:underline">reset</button>
              )}
            </div>
          </>
        )}
        <div className="border-t border-outline-variant/30 pt-1.5"><Row label="Payable total" value={inr(effectiveTotal)} bold /></div>
        {overridden && <p className="text-right text-[11px] font-bold text-amber-700">Delivery manually set — the order & invoice will use ₹{effectiveDelivery.toFixed(2)}.</p>}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant">{label}</span>
      <span className={bold ? "font-black text-on-surface" : "font-semibold text-on-surface"}>{value}</span>
    </div>
  );
}
