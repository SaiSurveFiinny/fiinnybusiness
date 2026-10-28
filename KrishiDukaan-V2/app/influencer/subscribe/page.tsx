'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Check, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { auth, db, getUserProfile } from '../../firebase';
import { useInfluencerSession } from '../_context/influencer-context';
import {
  DEFAULT_INFLUENCER_PLANS,
  INFLUENCER_PRICING_DOC_PATH,
  enabledInfluencerPlans,
  influencerPerMonth,
  parseInfluencerPlans,
  periodLabel,
  type InfluencerPlan,
} from '../../lib/influencer-pricing';
import {
  activateInfluencerSubscription,
  readInfluencerSubscriptionStatus,
  type InfluencerSubscriptionStatus,
} from '../_lib/influencer-subscription-firestore';

declare global {
  interface Window { Razorpay: any }
}

// What an influencer subscription unlocks. Display only — the paid features
// themselves arrive in later phases; this is the value proposition shown now.
const BENEFITS = [
  'Verified creator badge on your public profile',
  'Priority placement in the brand discovery directory',
  'Collaboration inbox to receive brand offers',
  'Showcase all your platforms & reach in one place',
];

export default function InfluencerSubscribePage() {
  const { uid, phone, name } = useInfluencerSession();

  const [plans, setPlans] = useState<InfluencerPlan[]>(DEFAULT_INFLUENCER_PLANS);
  const [selected, setSelected] = useState<number | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [status, setStatus] = useState<InfluencerSubscriptionStatus>({ active: false, planName: null, expiryDate: null });
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { planName: string; expiry: Date }>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [snap, profile] = await Promise.all([
          getDoc(doc(db, INFLUENCER_PRICING_DOC_PATH.collection, INFLUENCER_PRICING_DOC_PATH.doc)),
          getUserProfile(uid).catch(() => null),
        ]);
        if (cancelled) return;
        const parsed = snap.exists() ? parseInfluencerPlans(snap.data()) : null;
        const live = enabledInfluencerPlans(parsed ?? DEFAULT_INFLUENCER_PLANS);
        setPlans(live);
        setSelected(live.length ? live[live.length - 1].months : null); // default to best value (longest)
        setStatus(readInfluencerSubscriptionStatus(profile as Record<string, unknown> | null));
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const chosen = plans.find((p) => p.months === selected) ?? null;

  const handlePay = async () => {
    if (!chosen) return;
    setError(null);
    setPaying(true);
    try {
      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Payment gateway is not ready. Please refresh and try again.');
      }
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/payment/influencer/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ durationMonths: chosen.months, userId: uid }),
      });
      const order = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof order.error === 'string' ? order.error : 'Unable to start payment. Please try again.');
      }

      const options = {
        key: order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'KrishiDukan',
        description: `${order.planName || periodLabel(chosen.months)} · Influencer`,
        order_id: order.id,
        handler: async (paymentResponse: any) => {
          setVerifying(true);
          try {
            // Server-side signature verification. Paid access is granted ONLY
            // after this returns ok — never off the Razorpay callback alone.
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || verifyData.status !== 'ok') {
              throw new Error('Payment verification failed. Please contact support.');
            }

            const result = await activateInfluencerSubscription({
              uid,
              phone,
              verified: {
                durationMonths: verifyData.durationMonths || chosen.months,
                amountPaid: verifyData.amountPaid ?? chosen.price,
                planName: verifyData.planName || `Influencer ${periodLabel(chosen.months)}`,
              },
              paymentDetails: {
                orderId: paymentResponse.razorpay_order_id,
                paymentId: paymentResponse.razorpay_payment_id,
              },
            });

            setDone({
              planName: verifyData.planName || `Influencer ${periodLabel(chosen.months)}`,
              expiry: result.expiryDate,
            });
            setStatus({
              active: true,
              planName: verifyData.planName || `Influencer ${periodLabel(chosen.months)}`,
              expiryDate: result.expiryDate,
            });
            // Subscription is now active → unlock the dashboard. A short delay
            // lets the success banner show before the gated dashboard loads.
            setTimeout(() => { window.location.href = '/influencer/dashboard'; }, 1500);
          } catch (err: any) {
            setError(err?.message || 'Payment completed but activation failed. Please refresh or contact support.');
          } finally {
            setVerifying(false);
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
        prefill: { name: name || '', contact: phone.replace(/^\+91/, '') },
        theme: { color: '#154212' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        setPaying(false);
        const reason = response?.error?.reason || response?.error?.description || 'Unknown error';
        setError(`Payment failed: ${reason}. Please try again.`);
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setPaying(false);
    }
  };

  if (loadingPlans) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {verifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-bold text-on-surface">Verifying payment…</span>
          </div>
        </div>
      )}

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
          <Sparkles className="h-6 w-6 text-purple-600" /> Creator subscription
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Unlock collaboration features and get discovered by brands.
        </p>
      </div>

      {/* Current status */}
      {status.active && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-green-700">
            <ShieldCheck className="h-4 w-4" />
            Active{status.planName ? ` · ${status.planName}` : ''}
            {status.expiryDate ? ` · renews/expires ${status.expiryDate.toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ''}
          </p>
          <p className="mt-1 text-xs text-green-700/80">You can extend your subscription any time below.</p>
        </div>
      )}

      {done && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
          🎉 You’re subscribed to {done.planName}! Active until {done.expiry.toLocaleDateString('en-IN', { dateStyle: 'medium' })}.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>
      )}

      {/* Benefits */}
      <section className="rounded-2xl border border-surface-container bg-white p-5">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-on-surface-variant">What you get</h2>
        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-on-surface">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> {b}
            </li>
          ))}
        </ul>
      </section>

      {/* Plans */}
      {plans.length === 0 ? (
        <div className="rounded-2xl border border-surface-container bg-white p-6 text-center text-sm text-on-surface-variant">
          No subscription plans are available right now. Please check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans.map((p) => {
            const active = selected === p.months;
            return (
              <button
                key={p.months}
                type="button"
                onClick={() => setSelected(p.months)}
                className={`relative rounded-2xl border-2 p-5 text-left transition-all ${
                  active ? 'border-primary bg-primary/5 shadow-sm' : 'border-outline-variant/40 bg-white hover:border-outline-variant'
                }`}
              >
                {p.badge && (
                  <span className="absolute right-3 top-3 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-700">
                    {p.badge}
                  </span>
                )}
                <p className="text-xs font-black uppercase tracking-wider text-on-surface-variant">{periodLabel(p.months)}</p>
                <p className="mt-2 text-2xl font-black text-on-surface">₹{p.price.toLocaleString('en-IN')}</p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  ₹{influencerPerMonth(p).toLocaleString('en-IN')}/month · {p.months} month{p.months !== 1 ? 's' : ''}
                </p>
                {active && <Check className="absolute bottom-4 right-4 h-5 w-5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Pay */}
      {plans.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handlePay}
            disabled={paying || verifying || !chosen}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-black uppercase tracking-wider text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:opacity-60"
          >
            {paying || verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {chosen ? `Pay ₹${chosen.price.toLocaleString('en-IN')}` : 'Select a plan'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure · Razorpay
          </span>
        </div>
      )}
    </div>
  );
}
