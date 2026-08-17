"use client";

import { useState } from "react";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Calculator, ExternalLink, Loader2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";

/**
 * Launches the KaranArjun ERP for a subscribed retailer.
 *
 * The ERP lives in a different Firebase project, so the retailer has no session
 * there. createErpHandoffCode returns a URL carrying a single-use code that the
 * ERP swaps for a sign-in token — the retailer never types a second password.
 */
export function OpenBillingCard() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openBilling = async () => {
    setBusy(true);
    setError(null);
    try {
      const call = httpsCallable<Record<string, never>, { url: string }>(
        getFunctions(getApp()),
        "createErpHandoffCode"
      );
      const { data } = await call({});
      // Navigate in place rather than opening a tab: the code expires in 90
      // seconds and burns on first use, so a blocked popup would waste it.
      window.location.href = data.url;
    } catch (err) {
      console.error("[open-billing] handoff failed", err);
      setError(t("openBillingError"));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          <Calculator className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-on-surface">{t("openBillingTitle")}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{t("openBillingDesc")}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={openBilling}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {t("openBillingOpening")}
          </>
        ) : (
          <>
            {t("openBillingCta")} <ExternalLink className="h-4 w-4" />
          </>
        )}
      </button>

      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
