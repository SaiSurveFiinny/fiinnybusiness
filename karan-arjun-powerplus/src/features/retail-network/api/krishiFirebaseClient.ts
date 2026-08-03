import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

/**
 * Separate, isolated Firebase connection to the KrishiDukan project
 * (krishidukan-e8315) — completely independent of this app's own Firebase
 * project (see lib/firebase.ts). This client is used ONLY to read public,
 * already-public-by-rule retailer network data for display on the Karan
 * Arjun homepage; nothing here ever writes.
 *
 * A distinct Firebase App instance (named 'krishidukan-readonly', not the
 * default app) is required because the SDK does not allow two different
 * projects under the same app name — initializeApp(config, name) with an
 * explicit name keeps this fully separate from lib/firebase.ts's default app.
 *
 * Config values match this project's live NEXT_PUBLIC_FIREBASE_* env vars
 * (verified against KrishiDukan-v2/.env.local) — these are client-side
 * Firebase config values (not secrets; safe to ship in a browser bundle),
 * but are still read from Vite env vars first so they can be rotated
 * without a code change.
 */
const KRISHIDUKAN_APP_NAME = 'krishidukan-readonly';

const krishiFirebaseConfig = {
  apiKey: import.meta.env.VITE_KRISHIDUKAN_FIREBASE_API_KEY ?? 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  authDomain: import.meta.env.VITE_KRISHIDUKAN_FIREBASE_AUTH_DOMAIN ?? 'krishidukan-e8315.firebaseapp.com',
  projectId: import.meta.env.VITE_KRISHIDUKAN_FIREBASE_PROJECT_ID ?? 'krishidukan-e8315',
  storageBucket: import.meta.env.VITE_KRISHIDUKAN_FIREBASE_STORAGE_BUCKET ?? 'krishidukan-e8315.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_KRISHIDUKAN_FIREBASE_MESSAGING_SENDER_ID ?? '650303885415',
  appId: import.meta.env.VITE_KRISHIDUKAN_FIREBASE_APP_ID ?? '1:650303885415:web:7db7619260aa478b2b84c2',
};

function getKrishiFirebaseApp() {
  const existing = getApps().find((app) => app.name === KRISHIDUKAN_APP_NAME);
  if (existing) return existing;
  try {
    return initializeApp(krishiFirebaseConfig, KRISHIDUKAN_APP_NAME);
  } catch {
    return getApp(KRISHIDUKAN_APP_NAME);
  }
}

export const krishiDb = getFirestore(getKrishiFirebaseApp());
