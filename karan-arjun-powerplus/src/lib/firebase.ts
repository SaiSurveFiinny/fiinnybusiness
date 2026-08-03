import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBi9Ls282kTaVt45iTqKyS8pV90Xflv9hs',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'karanarjun-power-plus.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'karanarjun-power-plus',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'karanarjun-power-plus.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '78173830400',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:78173830400:web:f512644ae18970e15007e5',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-Q7T14T31YW',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
