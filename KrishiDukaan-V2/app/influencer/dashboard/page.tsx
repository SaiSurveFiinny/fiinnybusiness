'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, UserCircle, Sparkles } from 'lucide-react';
import { auth } from '../../firebase';
import { useInfluencerSession } from '../_context/influencer-context';

interface DashboardData {
  planName: string | null;
  expiry: string | null;
}

/**
 * The paywalled influencer dashboard. Access is enforced SERVER-SIDE by
 * /api/influencer/access (verified token + active subscription). This page
 * renders nothing until that endpoint returns 200; a 402 (no active
 * subscription) sends the influencer to the paywall. The client never decides
 * entitlement on its own.
 */
export default function InfluencerDashboardPage() {
  const router = useRouter();
  const { name } = useInfluencerSession();
  const [state, setState] = useState<'checking' | 'ok' | 'error'>('checking');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/influencer/access', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (res.status === 402) {
          // No active subscription → paywall. Profile data is left untouched.
          router.replace('/influencer/subscribe');
          return;
        }
        if (res.status === 401) {
          router.replace('/?view=login');
          return;
        }
        if (!res.ok) {
          setError('Could not load your dashboard. Please try again.');
          setState('error');
          return;
        }
        const body = await res.json();
        setData(body.subscription ?? null);
        setState('ok');
      } catch {
        if (!cancelled) {
          setError('Could not load your dashboard. Please try again.');
          setState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (state === 'checking') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
        {error}
      </div>
    );
  }

  const expiry = data?.expiry ? new Date(data.expiry) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-on-surface">
          Welcome{name ? `, ${name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">Your creator dashboard.</p>
      </div>

      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-green-700">
          <ShieldCheck className="h-4 w-4" />
          Subscription active{data?.planName ? ` · ${data.planName}` : ''}
          {expiry ? ` · until ${expiry.toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/influencer/profile"
          className="flex items-center gap-3 rounded-2xl border border-surface-container bg-white p-5 transition-colors hover:bg-surface-container-low"
        >
          <UserCircle className="h-6 w-6 text-primary" />
          <span>
            <span className="block text-sm font-bold text-on-surface">Your profile</span>
            <span className="block text-xs text-on-surface-variant">Edit how brands see you</span>
          </span>
        </Link>
        <Link
          href="/influencer/subscribe"
          className="flex items-center gap-3 rounded-2xl border border-surface-container bg-white p-5 transition-colors hover:bg-surface-container-low"
        >
          <Sparkles className="h-6 w-6 text-purple-600" />
          <span>
            <span className="block text-sm font-bold text-on-surface">Subscription</span>
            <span className="block text-xs text-on-surface-variant">Manage or extend your plan</span>
          </span>
        </Link>
      </div>

      <p className="text-xs text-on-surface-variant">
        More collaboration tools (brand discovery, offers inbox) are coming soon.
      </p>
    </div>
  );
}
