"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Handshake,
  Instagram,
  Youtube,
  Facebook,
  Users,
  MapPin,
  Languages as LanguagesIcon,
  Search,
  X,
  SlidersHorizontal,
  Tag,
  Video,
  IndianRupee,
  Info,
} from "lucide-react";
import { PageHeader } from "../_components/page-header";
import { auth } from "../../firebase";
import { useI18n } from "../../i18n/I18nContext";

// ─── Types mirroring /api/collaboration/influencers ──────────────────────────
type Offer = { typeId: string; label: string; description?: string; price: number; currency: string };
type CollabInfluencer = {
  id: string;
  displayName: string;
  photoUrl: string | null;
  bio: string;
  contentCategory: string;
  languages: string[];
  location: { state: string; district: string; city: string; workingArea: string };
  socials: Record<string, { followers: number }>;
  followers: number;
  selfReported: true;
  collaboration: { tierLabel: string | null; offers: Offer[]; requiresCustomQuote: boolean };
};

const PLATFORM_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  youtube: { label: "YouTube", Icon: Youtube, color: "text-red-600" },
  instagram: { label: "Instagram", Icon: Instagram, color: "text-pink-600" },
  facebook: { label: "Facebook", Icon: Facebook, color: "text-blue-600" },
};

function platformMeta(id: string) {
  return PLATFORM_META[id] ?? { label: id.charAt(0).toUpperCase() + id.slice(1), Icon: Users, color: "text-on-surface-variant" };
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function offerIcon(typeId: string): React.ElementType {
  if (typeId.includes("video")) return Video;
  if (typeId.includes("tag")) return Tag;
  return Handshake;
}

async function authedFetch(url: string) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

// ─── Filters ─────────────────────────────────────────────────────────────────
type Filters = {
  q: string;
  state: string;
  district: string;
  city: string;
  category: string;
  platform: string;
  minFollowers: string;
  maxFollowers: string;
};

const EMPTY_FILTERS: Filters = {
  q: "",
  state: "",
  district: "",
  city: "",
  category: "",
  platform: "",
  minFollowers: "",
  maxFollowers: "",
};

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function InfluencerCard({ inf }: { inf: CollabInfluencer }) {
  const initial = (inf.displayName || "?").charAt(0).toUpperCase();
  const platforms = Object.entries(inf.socials).sort((a, b) => b[1].followers - a[1].followers);
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
      {/* Header */}
      <div className="flex items-start gap-3">
        {inf.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={inf.photoUrl}
            alt={inf.displayName}
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-primary/10"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-black text-primary">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-on-surface">{inf.displayName}</h3>
          {inf.contentCategory ? (
            <span className="mt-0.5 inline-block rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-bold text-secondary">
              {inf.contentCategory}
            </span>
          ) : null}
        </div>
      </div>

      {/* Bio */}
      {inf.bio ? (
        <p className="mt-3 line-clamp-3 text-sm text-on-surface-variant">{inf.bio}</p>
      ) : null}

      {/* Languages + working area */}
      <div className="mt-3 flex flex-col gap-1.5 text-xs text-on-surface-variant">
        {inf.languages.length ? (
          <div className="flex items-center gap-1.5">
            <LanguagesIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{inf.languages.join(", ")}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {[inf.location.city, inf.location.district, inf.location.state]
              .filter(Boolean)
              .join(", ") || "—"}
            {inf.location.workingArea ? ` · ${inf.location.workingArea}` : ""}
          </span>
        </div>
      </div>

      {/* Platforms */}
      {platforms.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {platforms.map(([id, s]) => {
            const { label, Icon, color } = platformMeta(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container px-2 py-1 text-xs font-semibold text-on-surface"
                title={label}
              >
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                {fmtCount(s.followers)}
              </span>
            );
          })}
        </div>
      ) : null}
      <p className="mt-1 text-[10px] text-on-surface-variant/70">Follower counts are self-reported.</p>

      {/* Collaboration pricing */}
      <div className="mt-4 border-t border-outline-variant/30 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">
            Collaboration options
          </span>
          {inf.collaboration.tierLabel ? (
            <span className="text-[10px] text-on-surface-variant/70">{inf.collaboration.tierLabel}</span>
          ) : null}
        </div>

        {inf.collaboration.requiresCustomQuote ? (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Pricing for this creator requires a custom quotation. Contact KrishiDukan to
              configure collaboration charges.
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {inf.collaboration.offers.map((o) => {
              const OIcon = offerIcon(o.typeId);
              return (
                <li
                  key={o.typeId}
                  className="flex items-center justify-between gap-2 rounded-xl bg-surface-container/60 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-on-surface">
                    <OIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">
                      {o.label}
                      {o.description ? (
                        <span className="font-normal text-on-surface-variant"> · {o.description}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center font-black text-on-surface tabular-nums">
                    <IndianRupee className="h-3.5 w-3.5" />
                    {o.price.toLocaleString("en-IN")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function CollaborationPage() {
  const { t } = useI18n();
  const [all, setAll] = useState<CollabInfluencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch("/api/collaboration/influencers");
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to load influencers.");
        }
        const d = await res.json();
        if (!cancelled) setAll(Array.isArray(d.influencers) ? d.influencers : []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  // Dropdown options derived from the loaded, eligible set (no dummy data).
  const states = useMemo(() => uniqSorted(all.map((i) => i.location.state)), [all]);
  const districts = useMemo(
    () =>
      uniqSorted(
        all
          .filter((i) => !filters.state || i.location.state === filters.state)
          .map((i) => i.location.district),
      ),
    [all, filters.state],
  );
  const cities = useMemo(
    () =>
      uniqSorted(
        all
          .filter((i) => !filters.state || i.location.state === filters.state)
          .filter((i) => !filters.district || i.location.district === filters.district)
          .map((i) => i.location.city),
      ),
    [all, filters.state, filters.district],
  );
  const categories = useMemo(() => uniqSorted(all.map((i) => i.contentCategory)), [all]);
  const platforms = useMemo(
    () => uniqSorted(all.flatMap((i) => Object.keys(i.socials))),
    [all],
  );

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const min = filters.minFollowers ? parseInt(filters.minFollowers, 10) : null;
    const max = filters.maxFollowers ? parseInt(filters.maxFollowers, 10) : null;
    return all.filter((i) => {
      if (q) {
        const hay = `${i.displayName} ${i.bio} ${i.contentCategory} ${i.languages.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.state && i.location.state !== filters.state) return false;
      if (filters.district && i.location.district !== filters.district) return false;
      if (filters.city && i.location.city !== filters.city) return false;
      if (filters.category && i.contentCategory !== filters.category) return false;
      if (filters.platform && !(filters.platform in i.socials)) return false;
      // Follower range compares against the per-platform count when a platform is
      // selected, else against the headline (largest-platform) figure.
      const count =
        filters.platform && i.socials[filters.platform]
          ? i.socials[filters.platform].followers
          : i.followers;
      if (min != null && count < min) return false;
      if (max != null && count > max) return false;
      return true;
    });
  }, [all, filters]);

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([, v]) => String(v).trim() !== "").length,
    [filters],
  );

  const inputCls =
    "w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2";

  return (
    <div>
      <PageHeader
        title={t("collabTitle")}
        description={t("collabSubtitle")}
      />

      {/* Search + filter toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t("collabSearchPlaceholder")}
            className={`${inputCls} pl-9`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-container"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("collabFilters")}
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[11px] font-black text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            <X className="h-4 w-4" />
            {t("collabClear")}
          </button>
        ) : null}
      </div>

      {/* Filter panel */}
      {showFilters ? (
        <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabState")}
            <select
              value={filters.state}
              onChange={(e) => set({ state: e.target.value, district: "", city: "" })}
              className={inputCls}
            >
              <option value="">{t("collabAll")}</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabDistrict")}
            <select
              value={filters.district}
              onChange={(e) => set({ district: e.target.value, city: "" })}
              className={inputCls}
            >
              <option value="">{t("collabAll")}</option>
              {districts.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabCity")}
            <select value={filters.city} onChange={(e) => set({ city: e.target.value })} className={inputCls}>
              <option value="">{t("collabAll")}</option>
              {cities.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabCategory")}
            <select value={filters.category} onChange={(e) => set({ category: e.target.value })} className={inputCls}>
              <option value="">{t("collabAll")}</option>
              {categories.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabPlatform")}
            <select value={filters.platform} onChange={(e) => set({ platform: e.target.value })} className={inputCls}>
              <option value="">{t("collabAll")}</option>
              {platforms.map((s) => (
                <option key={s} value={s}>{platformMeta(s).label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabMinFollowers")}
            <input
              type="text"
              inputMode="numeric"
              value={filters.minFollowers}
              onChange={(e) => set({ minFollowers: e.target.value.replace(/\D/g, "") })}
              placeholder="0"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {t("collabMaxFollowers")}
            <input
              type="text"
              inputMode="numeric"
              value={filters.maxFollowers}
              onChange={(e) => set({ maxFollowers: e.target.value.replace(/\D/g, "") })}
              placeholder="∞"
              className={inputCls}
            />
          </label>
        </div>
      ) : null}

      {/* Results */}
      {loading ? (
        <div className="py-20 text-center text-sm text-on-surface-variant">{t("collabLoading")}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Handshake className="h-10 w-10 text-on-surface-variant/40" />
          <p className="text-sm font-semibold text-on-surface">
            {all.length === 0 ? t("collabNoneYet") : t("collabNoMatches")}
          </p>
          {all.length > 0 && activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
            >
              {t("collabClear")}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold text-on-surface-variant">
            {filtered.length} {filtered.length === 1 ? t("collabCreator") : t("collabCreators")}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((inf) => (
              <InfluencerCard key={inf.id} inf={inf} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
