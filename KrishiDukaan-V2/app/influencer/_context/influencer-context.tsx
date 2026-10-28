'use client';

import { createContext, useContext } from 'react';

/** The signed-in influencer, resolved once by the layout guard and shared with
 *  the pages below it so they don't each re-run auth. */
export interface InfluencerSession {
  /** Firebase Auth UID. */
  uid: string;
  /** Normalized E.164 phone — the influencerProfiles/{phone} document id. */
  phone: string;
  /** Display name fallback from the users doc. */
  name: string;
  /** Whether the influencer holds an active, unexpired subscription. */
  subscriptionActive: boolean;
}

export const InfluencerContext = createContext<InfluencerSession | null>(null);

export function useInfluencerSession(): InfluencerSession {
  const ctx = useContext(InfluencerContext);
  if (!ctx) throw new Error('useInfluencerSession must be used within the influencer layout');
  return ctx;
}
