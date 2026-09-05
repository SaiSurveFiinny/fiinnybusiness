import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, Zap, Building2, Rocket, Star, Shield, ArrowRight, Crown, Loader2, CheckCircle2 } from 'lucide-react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Plan {
  id: string;
  name: string;
  icon: React.ReactNode;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  color: string;
  gradient: string;
  badge?: string;
  features: string[];
  limits: string[];
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    icon: <Zap size={22} />,
    tagline: 'Perfect for small retailers',
    monthlyPrice: 999,
    yearlyPrice: 9990,
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    features: [
      'Up to 500 invoices / month',
      'GST Invoice & POS Billing',
      'GSTR-1 & GSTR-3B Reports',
      'WhatsApp Payment Reminders',
      'Basic Inventory (500 SKUs)',
      'Up to 3 users',
      'Email Support',
    ],
    limits: ['1 Business Profile', '1 Warehouse'],
  },
  {
    id: 'growth',
    name: 'Growth',
    icon: <Rocket size={22} />,
    tagline: 'For growing businesses',
    monthlyPrice: 1999,
    yearlyPrice: 19990,
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    badge: 'Most Popular',
    features: [
      'Unlimited invoices',
      'Everything in Starter',
      'Purchase Orders & Delivery Challans',
      'Quotations → Invoice conversion',
      'Inventory Batch + Expiry Tracking',
      'Barcode Label Printing',
      'Financial Reports (P&L, Balance Sheet)',
      'Multi-Warehouse / Godown',
      'Up to 10 users',
      'Priority Support',
    ],
    limits: ['3 Business Profiles', '5 Warehouses'],
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: <Crown size={22} />,
    tagline: 'For enterprise operations',
    monthlyPrice: 2999,
    yearlyPrice: 29990,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    badge: 'Best Value',
    features: [
      'Everything in Growth',
      'Unlimited users',
      'Unlimited Business Profiles',
      'Unlimited Warehouses',
      'AI Business Advisor (insights, reorders)',
      'Online Payment Links (Razorpay)',
      'Multi-Company Support',
      'Custom Invoice Templates (10+)',
      'Offline PWA Mode',
      'Dedicated Account Manager',
      'API Access',
    ],
    limits: ['Unlimited everything'],
  },
];

// Reverse-map the Phase 2A catalog plan id → PricingPage tier id so the
// "Current Plan" badge matches what the user selected.
const CATALOG_TO_PRICING_TIER: Record<string, string> = {
  retailer:     'starter',
  distributor:  'growth',
  manufacturer: 'pro',
};

// ─── API helper ──────────────────────────────────────────────────────────────
// Functions are now onRequest endpoints proxied through Firebase Hosting rewrites.
// In development (emulator), point at localhost:5001; otherwise use the relative
// /api path which the hosting rewrite maps to the deployed Cloud Function.
const EMULATOR_BASE =
  `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/asia-south1`;
const API_BASE =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true'
    ? EMULATOR_BASE
    : '/api/saas';

async function callFunction(
  path: string,
  idToken: string,
  body: Record<string, unknown>
): Promise<any> {
  const url = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true'
    ? `${EMULATOR_BASE}/${path}`
    : `/api/saas/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

// Silence unused var — API_BASE is the conceptual default, callFunction builds its own URL.
void API_BASE;

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const { tenantId, currentUser, planEntitlements } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');
  // paying: plan id whose Razorpay order is being created / checkout is open
  const [paying, setPaying] = useState<string | null>(null);
  // verifying: plan id whose payment is being verified server-side
  const [verifying, setVerifying] = useState<string | null>(null);
  // activating: shown briefly after verification succeeds, before navigating away
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  // Derive current plan from AuthContext (same source as the rest of the app).
  // planEntitlements.planId is the catalog id (retailer/distributor/manufacturer).
  const activePlanId = planEntitlements.hasSubscription && planEntitlements.planId
    ? (CATALOG_TO_PRICING_TIER[planEntitlements.planId] ?? planEntitlements.planId)
    : null;

  const handleSubscribe = async (plan: Plan) => {
    if (!currentUser || !tenantId) return;
    if (paying || verifying) return;

    setPaying(plan.id);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        showToast('Could not load payment gateway. Check your internet connection.', 'error');
        return;
      }

      // 1. Create a Razorpay order server-side. The backend returns the order_id
      //    and the public key_id — the secret key never leaves the server.
      const idToken = await currentUser.getIdToken();
      const { order_id, key_id, amount } = await callFunction(
        'order', idToken, { plan: plan.id, cycle, tenantId }
      );

      // 2. Open the Razorpay checkout modal. Wrapping in a Promise lets us await
      //    the user's action (pay / cancel) before proceeding.
      await new Promise<void>((resolve, reject) => {
        const options = {
          key: key_id,
          amount,
          currency: 'INR',
          name: 'Fiinny ERP',
          description: `${plan.name} Plan — ${cycle === 'yearly' ? 'Annual' : 'Monthly'}`,
          order_id,
          prefill: {
            email: currentUser?.email ?? '',
            contact: currentUser?.phoneNumber ?? '',
          },
          theme: { color: plan.color },
          modal: {
            ondismiss: () => reject(new Error('cancelled')),
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            // Checkout succeeded on the Razorpay side. Transition to the
            // verification phase — the server now does the HMAC check and
            // writes the subscription to Firestore. The client never writes
            // subscription data directly.
            setPaying(null);
            setVerifying(plan.id);
            try {
              await callFunction('verify', idToken, {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                plan: plan.id,
                cycle,
                tenantId,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
        };
        const rzpInstance = new window.Razorpay(options);
        rzpInstance.open();
      });

      // Verification succeeded. AuthContext's onSnapshot on tenantSubscriptions/{id}
      // will fire shortly and update planEntitlements (showInactiveScreen → false).
      // Show a brief activation screen then navigate to the ERP.
      setVerifying(null);
      setActivating(true);
      showToast(`${plan.name} plan activated! Welcome to Fiinny ERP.`, 'success');
      setTimeout(() => {
        navigate('/dashboard');
      }, 1600);

    } catch (e: any) {
      setVerifying(null);
      setPaying(null);
      if (e?.message === 'cancelled') return; // user dismissed the modal intentionally
      const msg = e?.message ?? 'Unknown error';
      showToast(`Payment failed: ${msg}`, 'error');
    } finally {
      // Guard: ensure spinners clear even if an unexpected branch runs.
      setPaying(prev => prev === plan.id ? null : prev);
      setVerifying(prev => prev === plan.id ? null : prev);
    }
  };

  const displayPrice = (p: Plan) => cycle === 'yearly' ? Math.round(p.yearlyPrice / 12) : p.monthlyPrice;
  const savings = (p: Plan) => Math.round(((p.monthlyPrice * 12 - p.yearlyPrice) / (p.monthlyPrice * 12)) * 100);

  // Full-page activation overlay shown briefly after server verification succeeds.
  if (activating) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', textAlign: 'center', padding: '2rem' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'hsla(152,60%,40%,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={44} color="var(--primary-light)" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>Subscription Activated!</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Launching your ERP dashboard...</p>
        </div>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--primary-light)', opacity: 0.7 }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1150px', margin: '0 auto', paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', background: 'hsla(152,60%,40%,0.1)', border: '1px solid hsla(152,60%,40%,0.2)', borderRadius: '20px', color: '#10b981', fontSize: '0.83rem', fontWeight: 700, marginBottom: '1rem' }}>
          <Shield size={14} /> Simple, transparent pricing
        </div>
        <h1 className="primary-gradient-text" style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem' }}>
          {t('pricing.title')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '520px', margin: '0 auto 2rem' }}>
          {t('pricing.desc')}. All plans include GST compliance, invoicing, and inventory management.
        </p>

        {/* Current Plan Badge — driven by AuthContext planEntitlements */}
        {activePlanId && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', background: 'hsla(38,92%,50%,0.1)', border: '1px solid hsla(38,92%,50%,0.3)', borderRadius: '12px', color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            <Star size={16} fill="currentColor" />
            {t('pricing.current_plan')}: {activePlanId.toUpperCase()}
            {planEntitlements.status === 'active' && ' · Active'}
          </div>
        )}

        {/* Billing Toggle */}
        <div style={{ display: 'inline-flex', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '4px', gap: '4px' }}>
          {(['monthly', 'yearly'] as const).map(c => (
            <button key={c} onClick={() => setCycle(c)} style={{ padding: '0.55rem 1.5rem', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: c === cycle ? 700 : 500, background: c === cycle ? 'var(--primary-light)' : 'transparent', color: c === cycle ? '#fff' : 'var(--text-secondary)', font: 'inherit', fontSize: '0.9rem', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {c === 'monthly' ? t('pricing.monthly') : t('pricing.yearly')}
              {c === 'yearly' && <span style={{ background: '#10b981', color: '#fff', borderRadius: '6px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 800 }}>{t('pricing.save_pct', { pct: 17 })}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plan Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {PLANS.map(plan => {
          const isCurrentPlan = activePlanId === plan.id;
          const isPopular = plan.badge === 'Most Popular';
          const price = displayPrice(plan);
          const isBusy = paying === plan.id || verifying === plan.id;
          const anyBusy = !!(paying || verifying);

          return (
            <div
              key={plan.id}
              style={{
                background: 'var(--surface-raised)',
                border: isPopular ? `2px solid ${plan.color}` : '1px solid var(--surface-border)',
                borderRadius: '20px',
                overflow: 'hidden',
                position: 'relative' as const,
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: isPopular ? `0 8px 32px ${plan.color}25` : 'none',
              }}
            >
              {/* Badge */}
              {plan.badge && (
                <div style={{ position: 'absolute' as const, top: '1rem', right: '1rem', padding: '0.25rem 0.75rem', background: plan.gradient, color: '#fff', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  {plan.badge === 'Most Popular' ? t('pricing.most_popular') : t('pricing.best_value')}
                </div>
              )}

              {/* Plan Header */}
              <div style={{ padding: '2rem 2rem 1.5rem', background: `linear-gradient(135deg, ${plan.color}12, ${plan.color}05)`, borderBottom: `1px solid ${plan.color}20` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '12px', background: plan.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    {plan.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>{plan.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{plan.tagline}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', marginTop: '1rem' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 900, color: plan.color, lineHeight: 1 }}>₹{price.toLocaleString('en-IN')}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.4rem' }}>/mo</span>
                </div>
                {cycle === 'yearly' && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    ₹{plan.yearlyPrice.toLocaleString('en-IN')}/yr · Save {savings(plan)}% vs monthly
                  </div>
                )}
              </div>

              {/* Features */}
              <div style={{ padding: '1.5rem 2rem' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.87rem' }}>
                      <Check size={15} style={{ color: plan.color, flexShrink: 0, marginTop: '0.1rem' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
                    </li>
                  ))}
                  {plan.limits.map((l, i) => (
                    <li key={`lim-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.87rem' }}>
                      <Building2 size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '0.1rem' }} />
                      <span style={{ color: 'var(--text-tertiary)' }}>{l}</span>
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <div style={{ width: '100%', padding: '0.85rem', border: `2px solid ${plan.color}`, borderRadius: '12px', textAlign: 'center', fontWeight: 700, color: plan.color, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <Star size={16} fill="currentColor" /> {t('pricing.current_plan')}
                  </div>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan)}
                    disabled={anyBusy}
                    style={{
                      width: '100%', padding: '0.85rem',
                      background: isPopular ? plan.gradient : 'transparent',
                      border: isPopular ? 'none' : `2px solid ${plan.color}`,
                      color: isPopular ? '#fff' : plan.color,
                      borderRadius: '12px', cursor: anyBusy ? 'not-allowed' : 'pointer',
                      fontWeight: 700, font: 'inherit', fontSize: '0.95rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      opacity: anyBusy && !isBusy ? 0.45 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {paying === plan.id ? (
                      <><Loader2 className="animate-spin" size={16} /> Preparing checkout…</>
                    ) : verifying === plan.id ? (
                      <><Loader2 className="animate-spin" size={16} /> Verifying payment…</>
                    ) : (
                      <>{t('pricing.get_plan', { plan: plan.name })} <ArrowRight size={16} /></>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Free Plan Note */}
      <div style={{ textAlign: 'center', marginTop: '3rem', padding: '2rem', background: 'var(--surface-raised)', borderRadius: '16px', border: '1px solid var(--surface-border)' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Shield size={18} style={{ color: '#10b981' }} /> {t('pricing.free_plan')}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto 1rem' }}>
          {t('pricing.free_plan_desc')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {[`🔒 ${t('pricing.secure_payment')}`, `📅 ${t('pricing.cancel_anytime')}`, `🇮🇳 ${t('pricing.gst_invoice')}`, `🔄 ${t('pricing.prorated')}`].map(item => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{ marginTop: '3rem' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: '1.5rem', textAlign: 'center' }}>{t('pricing.faq_title')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {[
            { q: 'Can I change plans later?', a: 'Yes! Upgrade anytime. Unused days are prorated and credited.' },
            { q: 'Is payment secure?', a: 'Payments are processed by Razorpay — PCI-DSS compliant, 256-bit SSL.' },
            { q: 'Do I get a GST invoice?', a: 'Yes, a tax invoice is sent to your registered email after payment.' },
            { q: 'What payment methods are accepted?', a: 'UPI, Credit/Debit cards, Net Banking, Wallets (Paytm, PhonePe), EMI.' },
          ].map(({ q, a }) => (
            <div key={q} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{q}</div>
              <div style={{ fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
