import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { auth } from '../firebase';

/**
 * Signs a KrishiDukan retailer into this ERP without a second login.
 *
 * KrishiDukan runs in a different Firebase project, so its session means nothing
 * here. It sends the shopkeeper to /auth/handoff?c=<code>; that code is single
 * use and expires in 90 seconds. We trade it for a custom token and sign in.
 */

const KD_FUNCTIONS_BASE =
    import.meta.env.VITE_KD_FUNCTIONS_BASE ||
    'https://us-central1-krishidukan-e8315.cloudfunctions.net';

export default function ErpHandoffPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [failed, setFailed] = useState(false);
    // React 18 StrictMode mounts effects twice in development. The code burns on
    // first redemption, so a second attempt would always report failure.
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        const code = new URLSearchParams(window.location.search).get('c');

        // Drop the code from the address bar before anything can await, so it does
        // not linger in browser history or get copied out of a shared screen.
        window.history.replaceState(null, '', '/auth/handoff');

        if (!code) {
            setFailed(true);
            return;
        }

        (async () => {
            try {
                const res = await fetch(`${KD_FUNCTIONS_BASE}/redeemErpHandoffCode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: { code } }),
                });

                if (!res.ok) throw new Error(`Handoff rejected (${res.status})`);

                const body = await res.json();
                const token = body?.result?.token;
                if (!token) throw new Error('Handoff response carried no token');

                await signInWithCustomToken(auth, token);
                navigate('/pos', { replace: true });
            } catch (err) {
                console.error('[handoff] sign-in failed', err);
                setFailed(true);
            }
        })();
    }, [navigate]);

    if (failed) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>{t('handoff.failedTitle')}</h2>
                <p style={{ color: 'var(--text-secondary)' }}>{t('handoff.failedBody')}</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('handoff.signingIn')}
        </div>
    );
}
