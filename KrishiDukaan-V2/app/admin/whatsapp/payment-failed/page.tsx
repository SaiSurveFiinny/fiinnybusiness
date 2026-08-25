"use client";

import { useState } from "react";
import { auth, resolveWaUserByPhone } from "../../../firebase";
import { WaSubNav } from "../_components/wa-sub-nav";
import { AlertTriangle, CheckCircle, XCircle, Send, Search, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "../../../dashboard/_lib/cn";

const TEMPLATE_NAME = "payment_failed_app_update";
const TEMPLATE_LANG = "mr";

// Normalise any 10-digit / 91XXXXXXXXXX / +91XXXXXXXXXX to "91XXXXXXXXXX"
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

type Step = "input" | "preview" | "sent";

export default function PaymentFailedWaPage() {
  const [step, setStep] = useState<Step>("input");
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

    <div className="max-w-2xl px-0 py-2 space-y-6">

      {/* Template preview card */}
      <div className="border border-green-200 bg-green-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Template Preview</p>
        <div className="bg-white rounded-lg shadow-sm border border-green-100 p-3 space-y-3">
          <p className="text-sm text-gray-800">
          नमस्कार Sai Agro 🙏 

मी अर्जुन तनपुरे, कृषीदुकानकडून.

तुमचे पेमेंट फेल झाल्याचे दिसत आहे. 
कृपया एकदा ॲप अपडेट करून आता पुन्हा पेमेंट करण्याचा प्रयत्न कराल का?

काही अडचण आल्यास मला नक्की कळवा. धन्यवाद! 🙏
          </p>
          <div className="border-t border-gray-100 pt-2 space-y-1.5">
            <button className="w-full text-center text-sm font-medium text-blue-600 py-1 border border-blue-100 rounded-md bg-blue-50">
              ॲप अपडेट करा
            </button>
            <button className="w-full text-center text-sm font-medium text-blue-600 py-1 border border-blue-100 rounded-md bg-blue-50">
              पुन्हा पेमेंट करा
            </button>
          </div>
        </div>
        <p className="text-xs text-green-600 mt-2">
          This template is sent exactly as approved in Meta. Buttons and body are static — no variable substitution.
        </p>
      </div>

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
          {/* Stats */}
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

          {/* Entry table */}
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

          {/* Warning about unrecognised numbers */}
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
                Ready to send <strong>{TEMPLATE_NAME}</strong> ({TEMPLATE_LANG.toUpperCase()}) to{" "}
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
          {/* Summary */}
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

          {/* Per-number results */}
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
    </div>
  );
}
