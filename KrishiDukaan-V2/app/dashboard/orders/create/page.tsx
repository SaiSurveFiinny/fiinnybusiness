"use client";

/**
 * Retailer → Orders → Create order manually.
 *
 * Lets a retailer raise an order for a customer from their own dashboard. The
 * seller is ALWAYS the authenticated retailer — there is no seller-selection step,
 * and the server (app/api/seller/manual-order/*) pins sellerPhone to the token, so
 * a retailer can never create an order under another seller.
 *
 * Steps: Customer → Products → Review → Payment → Confirm → Result.
 * Two payment options:
 *   A) Create Payment Link — a Razorpay link is generated; the order is created
 *      automatically once the customer pays (webhook). Nothing is placed up front.
 *   B) Payment taken offline — cash/UPI/other collected by the retailer; the order
 *      is placed and marked paid immediately.
 *
 * Nothing authoritative lives here — pricing and order creation happen server-side.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, Loader2, Search, User, Store, Package, Trash2, CreditCard,
  IndianRupee, Phone, MapPin, Link2, Copy, Share2, CheckCircle2,
} from "lucide-react";
import { authedJsonHeaders } from "../../../lib/authed-fetch";
import { useEffectiveUser } from "../../_context/effective-user-context";
import {
  AsyncSearch, Banner, StepHeader, OptionCard, SelectedCard, NextBtn, PricingTable,
  CustomerAddressEditor, inr, round2, emptyAddr, addrFromCustomer, composeAddr,
  type CustAddr, type Pricing,
} from "../../../components/manual-order/shared";

// Module-level fetchers carrying the retailer's ID token — identical to the admin
// wizard's (app/admin/orders/create/page.tsx), so the client behaves the same.
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

// ── Types mirroring the server payloads ───────────────────────────────────────
type Customer = {
  id: string; name: string; phone: string; email: string | null; city: string | null; state: string | null; address: string | null;
  addressArea?: string | null; addressCity?: string | null; addressDistrict?: string | null; addressState?: string | null; addressPincode?: string | null;
};
type ProductRow = { copyId: string; productId: string; name: string; price: number; image: string | null; variants: { unit: string; price: number }[]; gstApplicable: boolean; gstRate: number };
type CartLine = { productId: string; copyId: string; name: string; qty: number; variantUnit: string; variants: { unit: string; price: number }[]; price: number };

type OfflineMethod = "cash" | "upi" | "other";
const OFFLINE_METHOD_LABEL: Record<OfflineMethod, string> = { cash: "Cash", upi: "UPI", other: "Other (offline)" };

type OfflineResult = { mode: "offline"; ok: true; orderId: string; alreadyExisted: boolean; status: string; grandTotal: number; payment: { mode: string; method: string | null; amount: number }; invoice: { ok: boolean; pending?: boolean; generated?: boolean; invoiceNumber?: string; error?: string } };
type LinkResult = { mode: "link"; ok: true; orderId: string; paymentLinkId: string; shortUrl: string; amount: number; status: string; paymentStatus: string; alreadyExisted: boolean };
type CreateResult = OfflineResult | LinkResult;

const STEPS = ["Customer", "Products", "Review", "Payment", "Confirm", "Result"] as const;

export default function RetailerCreateOrderPage() {
  const me = useEffectiveUser();
  // The shop this dashboard is acting for. For the owner it's their own phone; for
  // a staff/helper or an admin "viewing" the shop it's the owner's phone. The server
  // (requireSeller) authorizes the caller against it — it is never trusted blindly.
  const shopPhone = me.profile?.phone ? String(me.profile.phone) : "";
  const shopParam = shopPhone ? `&shop=${encodeURIComponent(shopPhone)}` : "";

  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custAddr, setCustAddr] = useState<CustAddr>(emptyAddr());
  const [editingAddr, setEditingAddr] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [pricingBusy, setPricingBusy] = useState(false);

  const [offlineMethod, setOfflineMethod] = useState<OfflineMethod>("cash");
  // The chosen payment path. `key` is a one-time idempotency token so retries /
  // double-submits never create a second order or a second payment link.
  const [payChoice, setPayChoice] = useState<{ kind: "offline"; method: OfflineMethod; key: string } | { kind: "link"; key: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pickCustomer = (c: Customer) => {
    setCustomer(c);
    setCustAddr(addrFromCustomer(c));
    setEditingAddr(false);
  };
  const clearCustomer = () => { setCustomer(null); setCustAddr(emptyAddr()); setEditingAddr(false); };

  // ── Fetchers ────────────────────────────────────────────────────────────────
  // Surface a failed search (e.g. a 403/401) instead of the misleading "No results".
  const onSearchError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Customer search failed. Please try again.");
  }, []);

  const searchCustomers = useCallback(async (q: string) => {
    const r = await apiGet<{ results: Customer[] }>(`/api/seller/manual-order/search?type=customer&q=${encodeURIComponent(q)}${shopParam}`);
    return r.results;
  }, [shopParam]);
  const searchProducts = useCallback(async (q: string) => {
    const r = await apiGet<{ results: ProductRow[] }>(`/api/seller/manual-order/search?type=product&q=${encodeURIComponent(q)}${shopParam}`);
    return r.results;
  }, [shopParam]);

  const itemsPayload = () => cart.map((l) => ({ productId: l.productId, copyId: l.copyId, qty: l.qty, variantUnit: l.variantUnit || undefined }));

  const review = useCallback(async () => {
    if (cart.length === 0) return;
    setPricingBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ pricing: Pricing }>("/api/seller/manual-order/review", {
        shopPhone,
        items: itemsPayload(),
        customerDeliveryState: (custAddr.state || customer?.state) ?? undefined,
      });
      setPricing(r.pricing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not price the order.");
    } finally {
      setPricingBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, customer, custAddr.state, shopPhone]);

  const goReview = async () => { await review(); setStep(2); };

  // ── Cart editing ──────────────────────────────────────────────────────────
  const addProduct = (p: ProductRow) => {
    setCart((prev) => {
      if (prev.some((l) => l.copyId === p.copyId)) return prev;
      const defaultVariant = p.variants[0]?.unit ?? "";
      return [...prev, { productId: p.productId, copyId: p.copyId, name: p.name, qty: 1, variantUnit: defaultVariant, variants: p.variants, price: p.price }];
    });
    setPricing(null); setPayChoice(null);
  };
  const updateLine = (copyId: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => (l.copyId === copyId ? { ...l, ...patch } : l)));
    setPricing(null); setPayChoice(null);
  };
  const removeLine = (copyId: string) => {
    setCart((prev) => prev.filter((l) => l.copyId !== copyId));
    setPricing(null); setPayChoice(null);
  };

  const effectiveDelivery = pricing ? pricing.deliveryCharge : 0;
  const effectiveTotal = pricing ? round2(pricing.subtotal + pricing.totalGstAdded + effectiveDelivery) : 0;

  const chooseOffline = () => setPayChoice({ kind: "offline", method: offlineMethod, key: crypto.randomUUID() });
  const chooseLink = () => setPayChoice({ kind: "link", key: crypto.randomUUID() });

  const customerPayload = () => ({
    id: customer!.id, name: customer!.name, phone: customer!.phone, email: customer!.email,
    address: composeAddr(custAddr) || customer!.address || null,
    deliveryState: (custAddr.state || customer!.state) ?? null,
  });

  const create = async () => {
    if (!customer || !payChoice) return;
    setCreating(true); setError(null);
    try {
      const payment = payChoice.kind === "offline"
        ? { mode: "offline", method: payChoice.method, idempotencyKey: payChoice.key }
        : { mode: "link", idempotencyKey: payChoice.key };
      const r = await apiPost<CreateResult>("/api/seller/manual-order", {
        shopPhone,
        customer: customerPayload(),
        items: itemsPayload(),
        payment,
      });
      setResult(r);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order creation failed.");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const shareLink = async (url: string) => {
    const text = `Hi${customer ? ` ${customer.name}` : ""}, please pay for your order here: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Payment link", text, url }); return; } catch { /* cancelled */ }
    }
    window.open(`https://wa.me/${customer ? customer.phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const canConfirm = Boolean(customer && cart.length > 0 && pricing && payChoice && !editingAddr);
  const shopName = me.profile?.shopName || me.profile?.businessName || me.displayName || "Your shop";

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/orders" className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-surface-container">
          <ArrowLeft className="h-3.5 w-3.5" /> Orders
        </Link>
        <h1 className="text-lg sm:text-2xl font-black text-on-surface">Create order manually</h1>
      </div>
      <p className="text-xs sm:text-sm text-on-surface-variant -mt-2">
        Raise an order for a customer and either send a payment link or record a payment you collected directly.
      </p>

      <StepHeader steps={STEPS} step={step} />

      {error && <Banner tone="error"><p className="whitespace-pre-wrap">{error}</p></Banner>}

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:p-5 space-y-4">
        {/* STEP 0 — Customer */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Select customer</p>
            {customer ? (
              <>
                <SelectedCard onClear={clearCustomer} icon={User}>
                  <p className="font-bold text-on-surface">{customer.name}</p>
                  <p className="text-xs text-on-surface-variant">{customer.phone}{customer.city ? ` · ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""}</p>
                </SelectedCard>
                <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Delivery address</p>
                  <CustomerAddressEditor
                    addr={custAddr} setAddr={setCustAddr}
                    editing={editingAddr} setEditing={setEditingAddr}
                    onReset={() => { setCustAddr(addrFromCustomer(customer)); setEditingAddr(false); }}
                    onSave={() => { setEditingAddr(false); void review(); }} saving={false} msg={null}
                  />
                </div>
              </>
            ) : (
              <AsyncSearch<Customer>
                placeholder="Search customer by phone, name or email…"
                icon={Search}
                fetcher={searchCustomers}
                onPick={pickCustomer}
                onError={onSearchError}
                emptyLabel="No customers found."
                renderOption={(c) => (
                  <div><p className="font-semibold text-on-surface text-sm">{c.name}</p>
                    <p className="text-xs text-on-surface-variant">{c.phone}{c.city ? ` · ${c.city}` : ""}</p></div>
                )}
              />
            )}
            <p className="text-[11px] text-on-surface-variant">
              Search an existing customer by name or phone number to select them.
            </p>
          </div>
        )}

        {/* STEP 1 — Products */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Add your products</p>
            <AsyncSearch<ProductRow>
              placeholder="Search or browse your products…"
              icon={Package}
              minChars={0}
              fetcher={searchProducts}
              onPick={addProduct}
              onError={onSearchError}
              emptyLabel="No products found in your catalogue."
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
                      <select value={l.variantUnit} onChange={(e) => updateLine(l.copyId, { variantUnit: e.target.value })}
                        className="rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs">
                        {l.variants.map((v) => <option key={v.unit} value={v.unit}>{v.unit} ({inr(v.price)})</option>)}
                      </select>
                    )}
                    <input type="number" min={1} value={l.qty}
                      onChange={(e) => updateLine(l.copyId, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      className="w-16 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs text-center" />
                    <button type="button" onClick={() => removeLine(l.copyId)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Review */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Review order</p>
            {pricingBusy ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Pricing…</div>
            ) : pricing ? (
              <PricingTable pricing={pricing} effectiveDelivery={effectiveDelivery} effectiveTotal={effectiveTotal}
                overridden={false} onDeliveryChange={() => {}} onResetDelivery={() => {}} readOnly />
            ) : (
              <button type="button" onClick={() => void review()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">
                Price order
              </button>
            )}
          </div>
        )}

        {/* STEP 3 — Payment */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base sm:text-lg font-black text-on-surface">How will this order be paid?</h2>
              <p className="text-sm text-on-surface-variant">Pick one of the two options below.</p>
            </div>
            {pricing && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-sm text-on-surface-variant">Order total</p>
                <p className="text-2xl font-black text-on-surface">{inr(effectiveTotal)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  subtotal {inr(pricing.subtotal)}{pricing.totalGstAdded > 0 ? ` + GST ${inr(pricing.totalGstAdded)}` : ""} + delivery {inr(effectiveDelivery)}
                </p>
              </div>
            )}

            {/* Option A — payment link */}
            <OptionCard n={1} title="Create payment link"
              desc="The order is created immediately (Accepted · Payment pending) and a Razorpay payment link is generated to share. It's confirmed automatically once the customer pays." icon={Link2}>
              <button type="button" onClick={chooseLink}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90">
                <Check className="h-4 w-4" /> Use payment link
              </button>
              <p className="text-sm text-on-surface-variant">The order &amp; link are created for {inr(effectiveTotal)} on the next step when you confirm.</p>
            </OptionCard>

            {/* Option B — offline */}
            <OptionCard n={2} title="Payment taken offline"
              desc="Use when you collected the money directly from the customer — cash, UPI, or another offline method." icon={Store} accent="amber">
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
                <button type="button" onClick={chooseOffline}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700">
                  <Check className="h-4 w-4" /> Record offline payment
                </button>
              </div>
              <p className="text-sm text-on-surface-variant">Recorded as an <span className="font-bold">offline</span> payment for {inr(effectiveTotal)} — the order is placed immediately.</p>
            </OptionCard>

            {payChoice && (
              <Banner tone="ok">
                {payChoice.kind === "link"
                  ? <>Payment link selected — confirm to generate it for {inr(effectiveTotal)}.</>
                  : <>Offline payment selected: <span className="font-bold">{OFFLINE_METHOD_LABEL[payChoice.method]}</span>, {inr(effectiveTotal)}.</>}
              </Banner>
            )}
          </div>
        )}

        {/* STEP 4 — Confirm */}
        {step === 4 && customer && pricing && payChoice && (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Final review</p>

            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Customer</p>
              <p className="font-bold text-on-surface text-sm">{customer.name}</p>
              <p className="text-xs text-on-surface-variant flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</p>
              <p className="text-xs text-on-surface-variant flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5 shrink-0" />{composeAddr(custAddr) || "No delivery address"}</p>
            </div>

            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><Store className="h-3.5 w-3.5" /> Seller (you)</p>
              <p className="font-bold text-on-surface text-sm">{shopName}</p>
            </div>

            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Order</p>
              <PricingTable pricing={pricing} effectiveDelivery={effectiveDelivery} effectiveTotal={effectiveTotal}
                overridden={false} onDeliveryChange={() => {}} onResetDelivery={() => {}} readOnly />
            </div>

            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payment</p>
              {payChoice.kind === "link" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                  <Link2 className="h-3.5 w-3.5" /> Payment link · {inr(effectiveTotal)} · pending
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                  <Store className="h-3.5 w-3.5" /> Offline ({OFFLINE_METHOD_LABEL[payChoice.method]}) · {inr(effectiveTotal)} · paid
                </span>
              )}
            </div>
          </div>
        )}

        {/* STEP 5 — Result */}
        {step === 5 && result && (
          <div className="space-y-3">
            {result.mode === "offline" ? (
              <>
                <Banner tone="ok">
                  <p className="font-bold">{result.alreadyExisted ? "Order already existed (not re-created)." : "Order created."}</p>
                  <p className="mt-1">Order ID <span className="font-mono font-bold">{result.orderId}</span> · status <span className="font-bold">{result.status}</span> · {inr(result.grandTotal)}</p>
                </Banner>
                <div className="rounded-xl border border-outline-variant/30 bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant mb-1.5">Payment</p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                    <Store className="h-3.5 w-3.5" /> Offline (Collected by Retailer) · {result.payment.method ?? "—"} · {inr(result.payment.amount)}
                  </span>
                </div>
                {result.invoice.ok && result.invoice.pending
                  ? <Banner tone="info">The invoice will be created when you accept the order.</Banner>
                  : result.invoice.ok
                  ? <Banner tone="info">Invoice {result.invoice.generated ? "generated" : "already present"}{result.invoice.invoiceNumber ? `: ${result.invoice.invoiceNumber}` : ""}.</Banner>
                  : <Banner tone="warn">Invoice not generated: {result.invoice.error ?? "unknown error"}.</Banner>}
                <Banner tone="info">The customer and your shop are notified automatically, and stock is adjusted — exactly once.</Banner>
              </>
            ) : (
              <>
                <Banner tone="ok">
                  <p className="font-bold">Order created.</p>
                  <p className="mt-1">Order ID <span className="font-mono font-bold">{result.orderId}</span> · status <span className="font-bold">Accepted</span> · payment <span className="font-bold">Pending</span> · {inr(result.amount)}</p>
                </Banner>
                <Banner tone="info">It&apos;s already in your Orders. Share the link below — payment is reconciled automatically and the status flips to Paid once the customer pays.</Banner>
                <div className="rounded-xl border border-outline-variant/30 bg-white p-3 space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Payment link · {inr(result.amount)}</p>
                  <div className="flex items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 py-2">
                    <Link2 className="h-4 w-4 text-primary shrink-0" />
                    <a href={result.shortUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary truncate hover:underline">{result.shortUrl}</a>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copyLink(result.shortUrl)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-white px-3 py-2 text-xs font-bold text-on-surface hover:bg-surface-container">
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
                    </button>
                    <button type="button" onClick={() => void shareLink(result.shortUrl)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90">
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </button>
                  </div>
                </div>
                <Banner tone="info">The customer isn&apos;t notified and stock isn&apos;t committed until payment succeeds. On payment, the order is confirmed automatically (payment → Paid, invoice generated, customer notified).</Banner>
              </>
            )}
            <div className="flex gap-2">
              <Link href="/dashboard/orders" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Go to Orders</Link>
            </div>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      {step < 5 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-bold text-on-surface-variant disabled:opacity-40">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          {step === 0 && <NextBtn disabled={!customer} onClick={() => setStep(1)} />}
          {step === 1 && <NextBtn disabled={cart.length === 0} onClick={() => void goReview()} label="Review" />}
          {step === 2 && <NextBtn disabled={!pricing || pricingBusy} onClick={() => setStep(3)} label="Choose payment" icon={CreditCard} />}
          {step === 3 && <NextBtn disabled={!payChoice} onClick={() => setStep(4)} label="Review & confirm" />}
          {step === 4 && (
            <button type="button" disabled={!canConfirm || creating} onClick={() => void create()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="h-3.5 w-3.5" />}
              {payChoice?.kind === "link" ? "Create payment link" : "Create order"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
