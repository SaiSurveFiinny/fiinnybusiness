"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth, db, resolveWaUserByPhone } from "../../../firebase";
import { WaSubNav } from "../_components/wa-sub-nav";
import {
  AlertTriangle, CheckCircle, XCircle, Send, Search, Loader2,
  ChevronDown, Building2, Calendar, Clock, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { cn } from "../../../dashboard/_lib/cn";
import { PendingSignupPanel, type PendingPanelManufacturer } from "../../_components/pending-signup-panel";
import { getUsers, getSubscriptions, getProducts } from "../../_lib/admin-data";
import { selectUserProductDocs } from "../../../firebase";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function isValidIndianPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return /^(91\d{10}|\d{10})$/.test(digits);
}

function parsePhones(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Template config ──────────────────────────────────────────────────────────

type TemplateId =
  | "payment_failed_app_update"
  | "product_assignment_pending_signup"
  | "subscription_expiry"
  | "retailer_seat_promotion"
  | "add_product_reminder";

const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  {
    id: "payment_failed_app_update",
    label: "Payment Failed — App Update",
    description: "Notify customers whose payment failed and ask them to update the app.",
  },
  {
    id: "product_assignment_pending_signup",
    label: "Product Assignment — Pending Signup",
    description: "Remind invited retailers who haven't completed signup yet.",
  },
  {
    id: "subscription_expiry",
    label: "Subscription Expiry",
    description: "Notify active subscribers whose subscription is approaching expiry.",
  },
  {
    id: "retailer_seat_promotion",
    label: "Retailer Seat Promotion",
    description: "Promote seat subscriptions to retailers/manufacturers not yet subscribed.",
  },
  {
    id: "add_product_reminder",
    label: "Add Product Reminder",
    description: "Remind active-subscribed retailers who haven't added any products yet.",
  },
];

// ─── Payment Failed flow ──────────────────────────────────────────────────────

const PF_TEMPLATE = "payment_failed_app_update";
const PF_LANG = "mr";

interface ResolvedEntry {
  raw: string;
  normalized: string;
  valid: boolean;
  name: string;
  businessName: string;
  role: string;
  looking: boolean;
}

interface SendResult {
  phone: string;
  normalized: string;
  ok: boolean;
  metaMessageId?: string;
  error?: string;
}

type PfStep = "input" | "preview" | "sent";

function PaymentFailedFlow() {
  const [step, setStep] = useState<PfStep>("input");
  const [rawInput, setRawInput] = useState("");
  const [entries, setEntries] = useState<ResolvedEntry[]>([]);
  const [looking, setLooking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);

  async function handleLookup() {
    const raws = parsePhones(rawInput);
    if (raws.length === 0) return;

    const initial: ResolvedEntry[] = raws.map((raw) => ({
      raw,
      normalized: isValidIndianPhone(raw) ? toE164(raw) : raw,
      valid: isValidIndianPhone(raw),
      name: "",
      businessName: "",
      role: "",
      looking: isValidIndianPhone(raw),
    }));
    setEntries(initial);
    setLooking(true);
    setStep("preview");

    const resolved = await Promise.all(
      initial.map(async (entry) => {
        if (!entry.valid) return entry;
        try {
          const user = await resolveWaUserByPhone(entry.normalized);
          return {
            ...entry,
            name: user?.name ?? "",
            businessName: user?.businessName ?? "",
            role: user?.role ?? "unknown",
            looking: false,
          };
        } catch {
          return { ...entry, looking: false };
        }
      })
    );

    setEntries(resolved);
    setLooking(false);
  }

  async function handleSend() {
    const validPhones = entries.filter((e) => e.valid).map((e) => e.raw);
    if (validPhones.length === 0) return;

    setSending(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/wa/payment-failed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ phones: validPhones }),
      });

      const data = (await res.json()) as { results?: SendResult[]; error?: string };
      if (!res.ok) {
        setSendResults([{ phone: "", normalized: "", ok: false, error: data.error ?? `HTTP ${res.status}` }]);
      } else {
        setSendResults(data.results ?? []);
      }
      setStep("sent");
    } catch (err) {
      setSendResults([{ phone: "", normalized: "", ok: false, error: String(err) }]);
      setStep("sent");
    } finally {
      setSending(false);
    }
  }

  function handleReset() {
    setStep("input");
    setRawInput("");
    setEntries([]);
    setSendResults([]);
  }

  const validCount = entries.filter((e) => e.valid).length;
  const invalidCount = entries.filter((e) => !e.valid).length;

  return (
    <div className="space-y-6">
      {/* Step: input */}
      {step === "input" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Phone Numbers
            </label>
            <textarea
              className="w-full h-40 border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
              placeholder={`One number per line (or comma-separated):\n9876543210\n91 9876 543 210\n+91-9876543210`}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Accepts 10-digit, 91XXXXXXXXXX, or +91XXXXXXXXXX format. Maximum 100 numbers.
            </p>
          </div>
          <button
            onClick={handleLookup}
            disabled={!rawInput.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Search className="w-4 h-4" />
            Look Up Numbers
          </button>
        </div>
      )}

      {/* Step: preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{validCount}</p>
              <p className="text-xs text-green-600 font-medium">Valid</p>
            </div>
            {invalidCount > 0 && (
              <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{invalidCount}</p>
                <p className="text-xs text-amber-600 font-medium">Invalid (skipped)</p>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry, i) => (
                  <tr key={i} className={cn(!entry.valid && "bg-amber-50/50")}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">
                      {entry.valid ? entry.normalized : entry.raw}
                    </td>
                    <td className="px-3 py-2.5">
                      {entry.looking ? (
                        <span className="flex items-center gap-1.5 text-gray-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Looking up…
                        </span>
                      ) : entry.name || entry.businessName ? (
                        <span className="text-gray-800 text-xs">
                          {entry.name}
                          {entry.businessName && entry.name !== entry.businessName && (
                            <span className="text-gray-400 ml-1">({entry.businessName})</span>
                          )}
                        </span>
                      ) : entry.valid ? (
                        <span className="text-gray-400 text-xs italic">Not found</span>
                      ) : (
                        <span className="text-amber-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {entry.role && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {entry.role}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!entry.valid ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="w-3 h-3" />
                          Invalid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle className="w-3 h-3" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {entries.some((e) => e.valid && !e.name && !e.looking) && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Some numbers were not found in Firestore. The template will still be sent — verify these numbers before confirming.
              </p>
            </div>
          )}

          {validCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-sm text-blue-800 font-medium">
                Ready to send <strong>{PF_TEMPLATE}</strong> ({PF_LANG.toUpperCase()}) to{" "}
                <strong>{validCount}</strong> number{validCount !== 1 ? "s" : ""}.
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Template includes two buttons: ॲप अपडेट करा · पुन्हा पेमेंट करा
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSend}
              disabled={validCount === 0 || looking || sending}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Confirm & Send to {validCount} Number{validCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step: sent results */}
      {step === "sent" && (
        <div className="space-y-4">
          {(() => {
            const successCount = sendResults.filter((r) => r.ok).length;
            const failCount = sendResults.filter((r) => !r.ok).length;
            return (
              <div className="flex gap-3">
                {successCount > 0 && (
                  <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{successCount}</p>
                    <p className="text-xs text-green-600 font-medium">Sent</p>
                  </div>
                )}
                {failCount > 0 && (
                  <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{failCount}</p>
                    <p className="text-xs text-red-600 font-medium">Failed</p>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Meta Message ID / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sendResults.map((r, i) => (
                  <tr key={i} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">
                      {r.normalized || r.phone || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-600 break-all">
                      {r.ok ? r.metaMessageId : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Send to More Numbers
            </button>
            <Link
              href="/admin/whatsapp"
              className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Back to WA Inbox
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Product Assignment — Pending Signup flow ─────────────────────────────────

type ManufacturerOption = PendingPanelManufacturer & { label: string };

function PendingSignupFlow() {
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [loadingMfrs, setLoadingMfrs] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState("");

  const loadManufacturers = useCallback(async () => {
    setLoadingMfrs(true);
    try {
      const users = await getUsers();
      const mfrs: ManufacturerOption[] = (users as any[])
        .filter((u) => u.role === "manufacturer")
        .map((u) => ({
          phone: String(u.id ?? u.phone ?? ""),
          uid: u.uid || undefined,
          businessName: u.businessName || u.shopName || u.name || undefined,
          ownerName: u.ownerName || u.name || undefined,
          label: u.businessName || u.shopName || u.name || u.id || "",
        }))
        .filter((m) => m.phone)
        .sort((a, b) => a.label.localeCompare(b.label));
      setManufacturers(mfrs);
    } finally {
      setLoadingMfrs(false);
    }
  }, []);

  useEffect(() => { void loadManufacturers(); }, [loadManufacturers]);

  const selectedMfr = manufacturers.find((m) => m.phone === selectedPhone) ?? null;

  return (
    <div className="space-y-6">
      {/* Manufacturer selector */}
      <div className="space-y-2 max-w-sm">
        <label className="block text-sm font-medium text-gray-700">
          Select Manufacturer / Company
        </label>
        <div className="relative">
          {loadingMfrs ? (
            <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading manufacturers…
            </div>
          ) : (
            <>
              <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={selectedPhone}
                onChange={(e) => setSelectedPhone(e.target.value)}
                className="w-full appearance-none border border-gray-300 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">— Choose a manufacturer —</option>
                {manufacturers.map((m) => (
                  <option key={m.phone} value={m.phone}>
                    {m.label}{m.phone ? ` (${m.phone})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Only retailers in the &quot;invited&quot; status for this manufacturer will be shown.
        </p>
      </div>

      {/* Pending panel — reuses the exact same component as Company Edit → Pending tab */}
      {selectedMfr && (
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pending Retailers — {selectedMfr.businessName || selectedMfr.phone}
          </p>
          <PendingSignupPanel manufacturer={selectedMfr} />
        </div>
      )}

      {!selectedPhone && !loadingMfrs && (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          Select a manufacturer above to see their pending retailers.
        </div>
      )}
    </div>
  );
}

// ─── Subscription Expiry flow ─────────────────────────────────────────────────

const EXPIRY_WINDOWS = [
  { label: "Expiring in 7 days", days: 7 },
  { label: "Expiring in 15 days", days: 15 },
  { label: "Expiring in 30 days", days: 30 },
  { label: "Expiring in 60 days", days: 60 },
  { label: "All active", days: Infinity },
] as const;

type ExpiryRow = {
  subId: string;
  phone: string;
  ownerName: string;
  businessName: string;
  planName: string;
  seatsPurchased: number;
  expiryDate: Date;
  daysRemaining: number;
};

type SubSendResult = {
  subId: string;
  phone: string;
  ownerName: string;
  ok: boolean;
  error?: string;
};

function formatExpiryDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function SubscriptionExpiryFlow() {
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<SubSendResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, users] = await Promise.all([getSubscriptions(), getUsers()]);
      const now = Date.now();

      const built: ExpiryRow[] = [];
      for (const sub of subs) {
        if (sub.subscriptionStatus !== "active") continue;
        const expiry: Date | null = sub.expiryDate?.toDate
          ? sub.expiryDate.toDate()
          : sub.expiryDate
          ? new Date(sub.expiryDate)
          : null;
        if (!expiry) continue;
        const ms = expiry.getTime() - now;
        if (ms <= 0) continue; // already expired, skip

        const phone: string = sub.ownerPhone || sub.ownerId || "";
        if (!phone) continue;

        const user = users.find(
          (u: any) => u.id === phone || u.uid === phone || u.phone === phone,
        );
        const ownerName: string =
          user?.name || user?.ownerName || user?.businessName || user?.shopName || "";
        const businessName: string =
          user?.businessName || user?.shopName || user?.name || "";

        built.push({
          subId: sub.id,
          phone,
          ownerName,
          businessName,
          planName: sub.planName || (sub.isCustom ? "Custom" : "Standard"),
          seatsPurchased: sub.seatsPurchased ?? 0,
          expiryDate: expiry,
          daysRemaining: Math.ceil(ms / 86400000),
        });
      }

      built.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
      setRows(built);
      // Pre-select all within the current window
      const cutoff = windowDays === Infinity ? Infinity : windowDays;
      setSelectedIds(new Set(built.filter((r) => r.daysRemaining <= cutoff).map((r) => r.subId)));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadData(); }, [loadData]);

  // When the window filter changes, re-apply selection to the filtered set only
  useEffect(() => {
    if (rows.length === 0) return;
    const cutoff = windowDays === Infinity ? Infinity : windowDays;
    setSelectedIds(new Set(rows.filter((r) => r.daysRemaining <= cutoff).map((r) => r.subId)));
  }, [windowDays, rows]);

  const displayedRows = windowDays === Infinity
    ? rows
    : rows.filter((r) => r.daysRemaining <= windowDays);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = displayedRows.filter((r) => selectedIds.has(r.subId));

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const all = displayedRows.length > 0 && selectedIds.size >= displayedRows.length;
    const none = selectedIds.size === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, displayedRows]);

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: SubSendResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");

    // Firestore batch limit is 500 — chunk if needed
    const CHUNK = 400;
    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        const formattedDate = formatExpiryDate(row.expiryDate);
        batch.set(doc(waRef), {
          phone: row.phone,
          message: `तुमची Krishi Dukan सदस्यता ${formattedDate} रोजी संपणार आहे.`,
          template: "subscription_expiry",
          payload: {
            ownerName: row.ownerName,
            businessName: row.businessName,
            shopName: "",
            formattedExpiryDate: formattedDate,
          },
          source: {
            event: "admin_manual_expiry_reminder",
            entityType: "subscription",
            entityId: row.subId,
          },
          status: "pending",
          type: "subscription",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ subId: row.subId, phone: row.phone, ownerName: row.ownerName, ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ subId: row.subId, phone: row.phone, ownerName: row.ownerName, ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  const daysLabel = (n: number) =>
    n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`;

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.subId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.ownerName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">subscription_expiry</span></li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} subscriber{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            This queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. The Cloud Function delivers them via WhatsApp.
            No subscription records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.subId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.ownerName || r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    {formatExpiryDate(r.expiryDate)}{" "}
                    <span className={cn(
                      "font-semibold",
                      r.daysRemaining <= 7 ? "text-red-600" : r.daysRemaining <= 15 ? "text-amber-600" : "text-gray-500"
                    )}>
                      ({daysLabel(r.daysRemaining)})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Window filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="relative flex-1">
            <select
              value={windowDays === Infinity ? "Infinity" : String(windowDays)}
              onChange={(e) => {
                const v = e.target.value;
                setWindowDays(v === "Infinity" ? Infinity : Number(v));
              }}
              className="w-full appearance-none border border-gray-300 rounded-xl pl-3 pr-8 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {EXPIRY_WINDOWS.map((w) => (
                <option key={String(w.days)} value={String(w.days)}>
                  {w.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Refresh */}
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading subscriptions…
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No active subscriptions found for the selected window.
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">
            {displayedRows.length} subscriber{displayedRows.length !== 1 ? "s" : ""}
            {windowDays !== Infinity && ` expiring within ${windowDays} days`}
            {selectedIds.size > 0 && selectedIds.size < displayedRows.length && (
              <span className="ml-1.5 text-on-surface-variant font-normal">
                · {selectedIds.size} selected
              </span>
            )}
          </p>

          {/* Recipient table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked
                            ? new Set(displayedRows.map((r) => r.subId))
                            : new Set(),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name / Business</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Plan · Seats</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedRows.map((r) => {
                  const checked = selectedIds.has(r.subId);
                  const urgent = r.daysRemaining <= 7;
                  const warn = !urgent && r.daysRemaining <= 15;
                  return (
                    <tr
                      key={r.subId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.subId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.subId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {r.ownerName || r.businessName || "—"}
                        </p>
                        {r.businessName && r.businessName !== r.ownerName && (
                          <p className="text-[10px] text-gray-400 truncate max-w-xs">{r.businessName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 hidden sm:table-cell">
                        {r.planName}
                        {r.seatsPurchased > 0 && (
                          <span className="ml-1 text-gray-400">· {r.seatsPurchased} seat{r.seatsPurchased !== 1 ? "s" : ""}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock className={cn(
                            "w-3 h-3 shrink-0",
                            urgent ? "text-red-500" : warn ? "text-amber-500" : "text-gray-400",
                          )} />
                          <span className={cn(
                            "font-semibold",
                            urgent ? "text-red-600" : warn ? "text-amber-600" : "text-gray-700",
                          )}>
                            {daysLabel(r.daysRemaining)}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatExpiryDate(r.expiryDate)}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Send button */}
          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── Retailer Seat Promotion flow ────────────────────────────────────────────

type SeatPromoRow = {
  userId: string;
  phone: string;
  businessName: string;
  role: string;
  subscriptionLabel: string;
};

type SeatPromoResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

function RetailerSeatPromotionFlow() {
  const [rows, setRows] = useState<SeatPromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<SeatPromoResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const users = await getUsers();
      const built: SeatPromoRow[] = [];
      for (const u of users as any[]) {
        const role: string = u.role ?? "";
        if (role !== "retailer" && role !== "manufacturer") continue;
        if (u.isPaid === true) continue; // already subscribed

        const phone: string = u.id || u.phone || "";
        if (!phone) continue;

        const businessName: string =
          u.businessName || u.shopName || u.name || u.ownerName || "";

        const subStatus: string = u.subscriptionStatus ?? "";
        const subscriptionLabel =
          subStatus === "expired"
            ? "Expired"
            : subStatus === "active"
            ? "Active (isPaid false?)"
            : "Not subscribed";

        built.push({ userId: u.id, phone, businessName, role, subscriptionLabel });
      }
      built.sort((a, b) => (a.businessName || a.phone).localeCompare(b.businessName || b.phone));
      setRows(built);
      setSelectedIds(new Set(built.map((r) => r.userId)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const all = rows.length > 0 && selectedIds.size >= rows.length;
    const none = selectedIds.size === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, rows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: SeatPromoResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "retailer_seat_promotion",
          payload: { businessName: row.businessName },
          source: {
            event: "admin_manual_seat_promotion",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "marketing",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: row.businessName, ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: row.businessName, ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">retailer_seat_promotion</span></li>
            <li>Variable: <span className="font-mono text-xs">{"{{1}}"}</span> = Business Name only</li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} user{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{r.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {rows.length} eligible recipient{rows.length !== 1 ? "s" : ""}
              {selectedIds.size > 0 && selectedIds.size < rows.length && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {selectedIds.size} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No unsubscribed retailers or manufacturers found.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? new Set(rows.map((r) => r.userId)) : new Set(),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Role</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {r.businessName || <span className="italic text-gray-400">—</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full font-medium",
                          r.subscriptionLabel === "Expired"
                            ? "bg-red-50 text-red-600"
                            : "bg-gray-100 text-gray-500",
                        )}>
                          {r.subscriptionLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── Add Product Reminder flow ───────────────────────────────────────────────

type AddProdRow = {
  userId: string;
  phone: string;
  businessName: string;
  role: string;
  subscriptionStatus: string;
};

type AddProdResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

function AddProductReminderFlow() {
  const [rows, setRows] = useState<AddProdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<AddProdResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [users, products] = await Promise.all([getUsers(), getProducts()]);
      const built: AddProdRow[] = [];

      for (const u of users as any[]) {
        if (u.role !== "retailer") continue;
        if (u.subscriptionStatus !== "active") continue;

        const phone: string = u.id || u.phone || "";
        if (!phone) continue;

        const userProducts = selectUserProductDocs(products, { id: u.id, uid: u.uid, phone: u.phone });
        if (userProducts.length > 0) continue;

        const businessName: string =
          u.businessName || u.shopName || u.name || u.ownerName || "";

        built.push({
          userId: u.id,
          phone,
          businessName,
          role: u.role,
          subscriptionStatus: u.subscriptionStatus,
        });
      }

      built.sort((a, b) => (a.businessName || a.phone).localeCompare(b.businessName || b.phone));
      setRows(built);
      setSelectedIds(new Set(built.map((r) => r.userId)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const all = rows.length > 0 && selectedIds.size >= rows.length;
    const none = selectedIds.size === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, rows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: AddProdResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "add_product_reminder",
          payload: { businessName: row.businessName },
          source: {
            event: "admin_manual_add_product_reminder",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "general",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: row.businessName, ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: row.businessName, ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">add_product_reminder</span></li>
            <li>Variable: <span className="font-mono text-xs">{"{{1}}"}</span> = Business Name only</li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} retailer{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{r.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {rows.length} eligible retailer{rows.length !== 1 ? "s" : ""}
              {selectedIds.size > 0 && selectedIds.size < rows.length && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {selectedIds.size} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading retailers…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No active-subscribed retailers with zero products found.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? new Set(rows.map((r) => r.userId)) : new Set(),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Role</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {r.businessName || <span className="italic text-gray-400">—</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SendMessagesPage() {
  const [templateId, setTemplateId] = useState<TemplateId>("payment_failed_app_update");
  const selected = TEMPLATES.find((t) => t.id === templateId)!;

  return (
    <div className="flex flex-col gap-3">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
          <Send className="h-6 w-6 text-primary" />
          WhatsApp
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Customer conversations &amp; template messaging via WhatsApp Business
        </p>
      </div>
      <WaSubNav />

      <div className="w-full space-y-6 py-2">
        {/* Template selector — single dropdown */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[280px] max-w-sm flex-1">
            <label className="block text-sm font-semibold text-gray-700">
              Select Template
            </label>
            <div className="relative">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as TemplateId)}
                className="w-full appearance-none border border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>
          <p className="text-xs text-gray-400 pb-2.5 max-w-xs">{selected.description}</p>
        </div>

        <hr className="border-gray-200" />

        {/* Active flow */}
        {templateId === "payment_failed_app_update" && <PaymentFailedFlow />}
        {templateId === "product_assignment_pending_signup" && <PendingSignupFlow />}
        {templateId === "subscription_expiry" && <SubscriptionExpiryFlow />}
        {templateId === "retailer_seat_promotion" && <RetailerSeatPromotionFlow />}
        {templateId === "add_product_reminder" && <AddProductReminderFlow />}
      </div>
    </div>
  );
}
