"use client";

import { HeadphonesIcon, LogIn } from "lucide-react";
import SupportInboxView from "./SupportInboxView";

/**
 * Login-gated Support Inbox, embedded into a public page (About / Help).
 *
 * Reuses the SAME SupportInboxView (and therefore the same `supportConversations`
 * collection and admin Support inbox) the standalone `?view=support` route uses —
 * no second messaging system. The only extra responsibility here is the auth
 * gate: a signed-out visitor is shown a prompt whose button hands control back to
 * the host page via `onRequireLogin`, which sends them to login and returns them
 * to this exact page afterwards so the inbox opens in place.
 */
export default function SupportInboxSection({
  user,
  userName,
  userEmail,
  onRequireLogin,
}: {
  user?: { uid?: string } | null;
  userName?: string;
  userEmail?: string;
  onRequireLogin: () => void;
}) {
  if (!user?.uid) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-outline-variant/30 bg-white p-8 text-center shadow-xl">
        <div className="rounded-full bg-primary/5 p-4">
          <HeadphonesIcon className="h-8 w-8 text-primary/60" />
        </div>
        <div>
          <p className="mb-1 font-semibold text-on-surface">Log in to contact support</p>
          <p className="max-w-sm text-sm text-on-surface-variant">
            Please sign in to open the Support Inbox. Your conversation is saved, so you can
            follow up anytime — we&apos;ll bring you right back here after you log in.
          </p>
        </div>
        <button
          type="button"
          onClick={onRequireLogin}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90"
        >
          <LogIn className="h-4 w-4" /> Log in to continue
        </button>
      </div>
    );
  }

  return (
    <SupportInboxView
      embedded
      uid={user.uid}
      userName={userName}
      userEmail={userEmail}
    />
  );
}
