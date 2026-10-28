'use client';

import { onAuthStateChanged } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { auth, getUserProfile } from '../firebase';
import { InfluencerContext, type InfluencerSession } from './_context/influencer-context';

// The ONLY route an influencer may use without an active subscription is the
// paywall itself. Dashboard AND Profile are gated: an unsubscribed influencer
// sees only the Subscription page. (Account/profile DATA is still preserved on
// expiry — see influencerProfiles; this gates page ACCESS, not the stored doc.)
const FREE_PATHS = ['/influencer/subscribe'];

function isFreePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return FREE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Auth guard for the influencer creator area.
 *
 * ONLY accounts whose role is 'influencer' may enter. Everyone else is bounced:
 *   - unauthenticated          → /?view=login
 *   - any other role           → /  (sellers/admins have their own surfaces)
 * so this area can never be used to reach retailer/manufacturer/admin features.
 *
 * On success the resolved session (uid + normalized phone) is published through
 * InfluencerContext so child pages address influencerProfiles/{phone} without
 * re-running auth.
 */
export default function InfluencerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<InfluencerSession | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/?view=login');
        return;
      }
      // Resolve the account (for role + session fields) and the AUTHORITATIVE
      // subscription state in parallel. subscriptionActive comes from the server
      // (/api/influencer/access → the subscriptions record), NOT a client-held
      // flag, so the navbar and the redirect reflect the same truth the
      // protected pages enforce — and a verified payment is recognised even if
      // the denormalized user-doc mirror never landed.
      const [profile, accessStatus] = await Promise.all([
        getUserProfile(user.uid).catch(() => null),
        user
          .getIdToken()
          .then((t) =>
            fetch('/api/influencer/access', { headers: { Authorization: `Bearer ${t}` } }),
          )
          .then((r) => r.status)
          .catch(() => 0),
      ]);
      if (!profile || profile.role !== 'influencer') {
        router.replace('/');
        return;
      }
      const subscriptionActive = accessStatus === 200;

      // Paywall gate: an influencer without an active subscription may use ONLY
      // the paywall route; any other influencer page redirects there. Profile
      // DATA is preserved regardless — this gates page access, not the doc.
      if (!subscriptionActive && !isFreePath(pathname)) {
        router.replace('/influencer/subscribe');
        return;
      }

      setSession({
        uid: user.uid,
        phone: String((profile as any).phone ?? ''),
        name: String((profile as any).name ?? ''),
        subscriptionActive,
      });
      setLoading(false);
    });
    return () => unsub();
  }, [router, pathname]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <InfluencerContext.Provider value={session}>
      <div className="min-h-screen bg-surface">
        <header className="sticky top-0 z-20 border-b border-surface-container bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/krishidukan icon.webp" alt="KrishiDukan" className="h-8 w-8 object-contain" />
              <span className="font-black text-lg text-primary">Krishi<span className="text-secondary">Dukan</span></span>
              <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-700">Creator</span>
            </Link>
            <nav className="flex items-center gap-1">
              {/* Dashboard + Profile appear ONLY for an active subscription.
                  Unsubscribed/expired influencers see just Subscription. This is
                  UX; the pages themselves are gated client- AND server-side. */}
              {session.subscriptionActive && (
                <>
                  <Link
                    href="/influencer/dashboard"
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/influencer/profile"
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
                  >
                    Profile
                  </Link>
                </>
              )}
              <Link
                href="/influencer/subscribe"
                className="rounded-full px-3 py-1.5 text-xs font-bold text-purple-700 transition-colors hover:bg-purple-50"
              >
                Subscription
              </Link>
              <button
                type="button"
                onClick={async () => { await auth.signOut(); router.replace('/'); }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </div>
    </InfluencerContext.Provider>
  );
}
