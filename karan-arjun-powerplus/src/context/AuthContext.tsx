import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

export type UserRole = 'admin' | 'customer';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  village?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

export type ProfileUpdates = Partial<Pick<UserProfile, 'name' | 'email' | 'phone' | 'village' | 'district' | 'state' | 'pincode'>>;

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPhone: (phone: string, verifier: RecaptchaVerifier) => Promise<ConfirmationResult>;
  signOutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (updates: ProfileUpdates) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

async function resolveRole(email: string): Promise<UserRole> {
  const normalizedEmail = email.toLowerCase();
  if (adminEmails.includes(normalizedEmail)) {
    return 'admin';
  }
  return 'customer';
}

async function ensureUserProfile(authUser: User, preferredName?: string): Promise<void> {
  const profileRef = doc(db, 'users', authUser.uid);
  const existing = await getDoc(profileRef);
  if (existing.exists()) {
    const normalizedEmail = (authUser.email ?? '').toLowerCase();
    const data = existing.data() as Partial<UserProfile>;
    if (adminEmails.includes(normalizedEmail) && data.role !== 'admin') {
      await updateDoc(profileRef, {
        role: 'admin',
        updatedAt: serverTimestamp(),
      });
    }
    return;
  }

  const role = await resolveRole(authUser.email ?? '');
  await setDoc(profileRef, {
    uid: authUser.uid,
    name: preferredName || authUser.displayName || 'Guest',
    email: authUser.email ?? '',
    phone: authUser.phoneNumber ?? '',
    village: '',
    district: '',
    state: '',
    pincode: '',
    role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);

      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = undefined;
      }

      setProfile(null);
      setUser(authUser);

      if (!authUser) {
        setLoading(false);
        return;
      }

      try {
        await ensureUserProfile(authUser);
      } catch {
        // Profile creation failed — continue to set up snapshot listener anyway
      }

      profileUnsubscribe = onSnapshot(
        doc(db, 'users', authUser.uid),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as Partial<UserProfile>;
            const normalizedEmail = (authUser.email ?? '').toLowerCase();
            const effectiveRole: UserRole = adminEmails.includes(normalizedEmail)
              ? 'admin'
              : (data.role ?? 'customer');
            setProfile({
              uid: authUser.uid,
              name: data.name ?? authUser.displayName ?? 'Guest',
              email: data.email ?? authUser.email ?? '',
              phone: data.phone ?? authUser.phoneNumber ?? '',
              role: effectiveRole,
              village: data.village ?? '',
              district: data.district ?? '',
              state: data.state ?? '',
              pincode: data.pincode ?? '',
            });
          } else {
            setProfile(null);
          }
          setLoading(false);
        },
        () => {
          // Snapshot error (permission denied, network) — unblock UI
          setProfile(null);
          setLoading(false);
        },
      );
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
    };
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      loading,
      async signUp(email, password, name) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: name });
        await ensureUserProfile(credential.user, name);
      },
      async signIn(email, password) {
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signInWithGoogle() {
        const credential = await signInWithPopup(auth, googleProvider);
        await ensureUserProfile(credential.user);
      },
      async signInWithPhone(phone, verifier) {
        return signInWithPhoneNumber(auth, phone, verifier);
      },
      async signOutUser() {
        await signOut(auth);
      },
      async resetPassword(email) {
        await sendPasswordResetEmail(auth, email);
      },
      async updateUserProfile(updates) {
        if (!user) throw new Error('Not signed in');
        const ref = doc(db, 'users', user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            uid: user.uid,
            name: updates.name ?? user.displayName ?? 'Guest',
            email: updates.email ?? user.email ?? '',
            phone: updates.phone ?? user.phoneNumber ?? '',
            village: updates.village ?? '',
            district: updates.district ?? '',
            state: updates.state ?? '',
            pincode: updates.pincode ?? '',
            role: 'customer',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
        }
      },
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
