'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Youtube, Instagram, Facebook, Camera, Loader2, CheckCircle2, Sparkles, ChevronRight } from 'lucide-react';
import { auth, storage, getUserProfile } from '../../firebase';
import { compressImage, imageUploadMetadata } from '../../utils/compressImage';
import { useInfluencerSession } from '../_context/influencer-context';
import { INDIAN_STATES } from '../../dashboard/_types/delivery-settings';
import {
  readInfluencerSubscriptionStatus,
  type InfluencerSubscriptionStatus,
} from '../_lib/influencer-subscription-firestore';
import {
  CONTENT_CATEGORIES,
  DEFAULT_CURRENCY,
  blankInfluencerProfile,
  fetchInfluencerProfile,
  saveInfluencerProfile,
  type InfluencerProfile,
  type InfluencerProfileInput,
  type InfluencerPlatform,
} from '../_lib/influencer-profile-firestore';

const LANGUAGE_OPTIONS = [
  'Hindi', 'Marathi', 'English', 'Gujarati', 'Punjabi',
  'Telugu', 'Tamil', 'Kannada', 'Bengali', 'Malayalam',
];

const PLATFORMS: { key: InfluencerPlatform; label: string; Icon: typeof Youtube; placeholder: string }[] = [
  { key: 'youtube', label: 'YouTube', Icon: Youtube, placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'instagram', label: 'Instagram', Icon: Instagram, placeholder: 'https://instagram.com/yourhandle' },
  { key: 'facebook', label: 'Facebook', Icon: Facebook, placeholder: 'https://facebook.com/yourpage' },
];

const inputCls =
  'w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Convert a stored profile into the editable input slice. */
function toInput(p: InfluencerProfile): InfluencerProfileInput {
  return {
    displayName: p.displayName,
    photoUrl: p.photoUrl,
    bio: p.bio,
    contentCategory: p.contentCategory,
    languages: p.languages,
    location: p.location,
    socials: p.socials,
    collaboration: p.collaboration,
  };
}

export default function InfluencerProfilePage() {
  const router = useRouter();
  const { phone, uid, name } = useInfluencerSession();

  const [form, setForm] = useState<InfluencerProfileInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [subStatus, setSubStatus] = useState<InfluencerSubscriptionStatus>({ active: false, planName: null, expiryDate: null });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Server-side paywall gate FIRST. The profile page is protected: render
        // nothing (keep the spinner) until the server confirms an active
        // subscription. A 402/403/401 redirects to the paywall/login so no
        // profile content is ever exposed to an unsubscribed influencer, even
        // on a direct URL hit that bypasses the client layout gate.
        const token = await auth.currentUser?.getIdToken();
        const gate = await fetch('/api/influencer/access', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (gate.status === 401) { router.replace('/?view=login'); return; }
        if (!gate.ok) { router.replace('/influencer/subscribe'); return; }

        const [existing, userProfile] = await Promise.all([
          fetchInfluencerProfile(phone),
          getUserProfile(uid).catch(() => null),
        ]);
        if (cancelled) return;
        if (existing) {
          setForm(toInput(existing));
        } else {
          const blank = toInput(blankInfluencerProfile(phone, uid));
          // Seed the display name from the account name so first-time setup isn't empty.
          setForm({ ...blank, displayName: name });
        }
        setSubStatus(readInfluencerSubscriptionStatus(userProfile as Record<string, unknown> | null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phone, uid, name, router]);

  const patch = (p: Partial<InfluencerProfileInput>) => setForm((f) => (f ? { ...f, ...p } : f));
  const patchLocation = (p: Partial<InfluencerProfileInput['location']>) =>
    setForm((f) => (f ? { ...f, location: { ...f.location, ...p } } : f));

  const toggleLanguage = (lang: string) =>
    setForm((f) => {
      if (!f) return f;
      const has = f.languages.includes(lang);
      return { ...f, languages: has ? f.languages.filter((l) => l !== lang) : [...f.languages, lang] };
    });

  const setSocial = (key: InfluencerPlatform, field: 'url' | 'followers', value: string) =>
    setForm((f) => {
      if (!f) return f;
      const current = f.socials[key] ?? { url: '', followers: 0 };
      const next = { ...current, [field]: field === 'followers' ? Number(value.replace(/\D/g, '')) || 0 : value };
      return { ...f, socials: { ...f.socials, [key]: next } };
    });

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const path = `profile-images/influencers/${phone}/${Date.now()}-${compressed.name.replace(/\s+/g, '_')}`;
      const snap = await uploadBytes(storageRef(storage, path), compressed, imageUploadMetadata(compressed));
      const url = await getDownloadURL(snap.ref);
      patch({ photoUrl: url });
    } catch {
      setError('Could not upload the photo. Please try a smaller image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setError(null);
    if (!form.displayName.trim()) { setError('Display name is required.'); return; }
    setSaving(true);
    setSaved(false);
    try {
      await saveInfluencerProfile(phone, uid, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-on-surface">Your creator profile</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          This is how brands will see you. Follower counts and charges you enter are self-reported.
        </p>
      </div>

      {/* Subscription status / CTA — profile is free; subscription is separate. */}
      <Link
        href="/influencer/subscribe"
        className={`flex items-center justify-between rounded-2xl border p-4 transition-colors ${
          subStatus.active
            ? 'border-green-200 bg-green-50 hover:bg-green-100/60'
            : 'border-purple-200 bg-purple-50 hover:bg-purple-100/60'
        }`}
      >
        <span className="flex items-center gap-3">
          <Sparkles className={`h-5 w-5 ${subStatus.active ? 'text-green-600' : 'text-purple-600'}`} />
          <span>
            <span className="block text-sm font-bold text-on-surface">
              {subStatus.active ? 'Creator subscription active' : 'Upgrade to a creator subscription'}
            </span>
            <span className="block text-xs text-on-surface-variant">
              {subStatus.active
                ? `${subStatus.planName ?? 'Active'}${subStatus.expiryDate ? ` · until ${subStatus.expiryDate.toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ''}`
                : 'Get discovered by brands and unlock collaboration features.'}
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-on-surface-variant" />
      </Link>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>
      )}

      {/* ── Photo + display name ── */}
      <section className="rounded-2xl border border-surface-container bg-white p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-surface-container bg-surface-container">
              {form.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photoUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6 text-on-surface-variant/50" />
              )}
            </div>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full border border-outline-variant px-4 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              {form.photoUrl ? 'Change photo' : 'Upload photo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            <p className="mt-1.5 text-[11px] text-on-surface-variant">JPG or PNG, up to 5 MB.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Display / creator name" required>
            <input className={inputCls} value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} placeholder="e.g. Agri Guru Ravi" />
          </Field>
          <Field label="Short bio">
            <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.bio} onChange={(e) => patch({ bio: e.target.value })} placeholder="Tell brands what you create and who follows you." />
          </Field>
          <Field label="Primary content category">
            <select className={inputCls} value={form.contentCategory} onChange={(e) => patch({ contentCategory: e.target.value })}>
              <option value="">Select a category…</option>
              {CONTENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* ── Location ── */}
      <section className="rounded-2xl border border-surface-container bg-white p-5">
        <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-on-surface-variant">Location & reach</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="State">
            <select className={inputCls} value={form.location.state} onChange={(e) => patchLocation({ state: e.target.value })}>
              <option value="">Select a state…</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="District"><input className={inputCls} value={form.location.district} onChange={(e) => patchLocation({ district: e.target.value })} /></Field>
          <Field label="City"><input className={inputCls} value={form.location.city} onChange={(e) => patchLocation({ city: e.target.value })} /></Field>
          <Field label="Working area"><input className={inputCls} value={form.location.workingArea} onChange={(e) => patchLocation({ workingArea: e.target.value })} placeholder="e.g. Western Maharashtra" /></Field>
        </div>
      </section>

      {/* ── Languages ── */}
      <section className="rounded-2xl border border-surface-container bg-white p-5">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-on-surface-variant">Content languages</h2>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((lang) => {
            const active = form.languages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Social platforms ── */}
      <section className="rounded-2xl border border-surface-container bg-white p-5">
        <h2 className="mb-1 text-sm font-black uppercase tracking-wider text-on-surface-variant">Social platforms</h2>
        <p className="mb-4 text-xs text-on-surface-variant">Add the profiles you want brands to see. Follower counts are self-reported.</p>
        <div className="space-y-4">
          {PLATFORMS.map(({ key, label, Icon, placeholder }) => {
            const s = form.socials[key];
            return (
              <div key={key} className="rounded-xl border border-outline-variant/50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-on-surface">
                  <Icon className="h-4 w-4" /> {label}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                  <input className={inputCls} value={s?.url ?? ''} onChange={(e) => setSocial(key, 'url', e.target.value)} placeholder={placeholder} />
                  <input className={inputCls} inputMode="numeric" value={s?.followers ? String(s.followers) : ''} onChange={(e) => setSocial(key, 'followers', e.target.value)} placeholder="Followers" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Collaboration charges ── */}
      <section className="rounded-2xl border border-surface-container bg-white p-5">
        <h2 className="mb-1 text-sm font-black uppercase tracking-wider text-on-surface-variant">Collaboration charges</h2>
        <p className="mb-4 text-xs text-on-surface-variant">Indicative only — self-reported and not binding.</p>
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Currency">
            <select
              className={inputCls}
              value={form.collaboration.currency || DEFAULT_CURRENCY}
              onChange={(e) => patch({ collaboration: { ...form.collaboration, currency: e.target.value } })}
            >
              <option value="INR">INR ₹</option>
              <option value="USD">USD $</option>
            </select>
          </Field>
          <Field label="Promotional charge">
            <input
              className={inputCls}
              inputMode="numeric"
              value={form.collaboration.charge == null ? '' : String(form.collaboration.charge)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                patch({ collaboration: { ...form.collaboration, charge: digits ? Number(digits) : null } });
              }}
              placeholder="e.g. 5000"
            />
          </Field>
        </div>
      </section>

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-black uppercase tracking-wider text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 ml-1 block text-xs font-black uppercase tracking-wider text-on-surface-variant">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
