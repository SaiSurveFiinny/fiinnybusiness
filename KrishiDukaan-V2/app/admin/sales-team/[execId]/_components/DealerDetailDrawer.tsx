"use client";

import { useEffect, useState } from "react";
import {
  X, Phone, MapPin, Store, StickyNote, ExternalLink,
  Pencil, Trash2, ImageOff, Calendar, User, Image as ImageIcon,
} from "lucide-react";
import type { Dealer } from "../../../../sales/dealers/dealers-service";
import { fetchNotesForDealer, type DealerNote } from "../../../../sales/dealers/dealer-note-service";
import DealerImagePreviewModal from "../../../../../components/sales/DealerImagePreviewModal";
import { statusLabel, statusColor } from "../../_lib/dealer-status";

const TYPE_LABEL: Record<string, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  manufacturer: "Manufacturer",
};

const INTEREST_LABEL: Record<string, string> = {
  low: "Low Interest",
  considering: "Considering",
  veryInterested: "Very Interested",
};

function fmtDateTime(ts: unknown): string {
  if (!ts) return "—";
  try {
    const d = (ts as any).toDate ? (ts as any).toDate() : new Date(ts as string);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch { return "—"; }
}

function fmtDate(ts: unknown): string {
  if (!ts) return "—";
  try {
    const d = (ts as any).toDate ? (ts as any).toDate() : new Date(ts as string);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
    });
  } catch { return "—"; }
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-outline-variant/15 last:border-0">
      <div className="mt-0.5 shrink-0 text-outline">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline mb-0.5">{label}</p>
        <div className="text-sm text-on-surface">{children}</div>
      </div>
    </div>
  );
}

type Props = {
  dealer: Dealer;
  execId: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function DealerDetailDrawer({ dealer, execId, canEdit, canDelete, onEdit, onDelete, onClose }: Props) {
  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setNotesLoading(true);
    setNotesError("");
    fetchNotesForDealer(dealer.id)
      .then((data) => {
        // fetchNotesForDealer returns oldest-first; reverse for newest-first display
        setNotes([...data].reverse());
      })
      .catch(() => setNotesError("Could not load notes."))
      .finally(() => setNotesLoading(false));
  }, [dealer.id]);

  const hasImage = Boolean(dealer.imageUrl) && !imgFailed;

  const openMaps = () => {
    if (dealer.geo) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${dealer.geo.latitude},${dealer.geo.longitude}`,
        "_blank",
      );
    } else if (dealer.address) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dealer.address)}`,
        "_blank",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-on-surface/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col bg-surface-container-lowest shadow-2xl">

        {/* Sticky header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-lowest px-5 py-4 sticky top-0 z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {TYPE_LABEL[dealer.type] ?? dealer.type}
              </span>
              {dealer.status && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${statusColor(dealer.status)}`}>
                  {statusLabel(dealer.status)}
                </span>
              )}
            </div>
            <p className="mt-1 text-base font-black text-on-surface truncate">{dealer.shopName}</p>
            <p className="text-xs text-on-surface-variant truncate">{dealer.ownerName}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <button
                type="button"
                title="Edit dealer"
                aria-label="Edit dealer"
                onClick={onEdit}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                title="Delete dealer"
                aria-label="Delete dealer"
                onClick={onDelete}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <a
              href={`/admin/sales-team/${execId}/dealers/${dealer.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full detail page"
              aria-label="Open full detail page"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              title="Close"
              aria-label="Close drawer"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Image */}
          <div className="px-5 pt-4">
            {hasImage ? (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="block w-full overflow-hidden rounded-2xl ring-1 ring-outline/10 hover:ring-primary/30 transition-all"
                aria-label="View full image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dealer.imageUrl}
                  alt={`${dealer.shopName} shop photo`}
                  onError={() => setImgFailed(true)}
                  className="w-full max-h-56 object-contain bg-surface-container"
                />
              </button>
            ) : (
              <div className="flex h-28 w-full items-center justify-center gap-2 rounded-2xl bg-surface-container-low ring-1 ring-outline-variant/20 text-on-surface-variant">
                <ImageOff className="h-5 w-5 text-outline" />
                <span className="text-xs text-outline">No photo</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="px-5 py-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Details</p>
            <div className="rounded-2xl border border-outline-variant/20 bg-white px-4 divide-y divide-outline-variant/10">
              <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
                {dealer.phone || "—"}
              </DetailRow>
              <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address">
                <span className="whitespace-pre-wrap">{dealer.address || "—"}</span>
              </DetailRow>
              <DetailRow icon={<Store className="h-3.5 w-3.5" />} label="Owner">
                {dealer.ownerName || "—"}
              </DetailRow>
              <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Added On">
                {fmtDate(dealer.createdAt)}
              </DetailRow>
              {dealer.interest && (
                <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Interest">
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {INTEREST_LABEL[dealer.interest] ?? dealer.interest}
                  </span>
                </DetailRow>
              )}
              {dealer.geo && (
                <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="GPS">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">
                      {dealer.geo.latitude.toFixed(5)}, {dealer.geo.longitude.toFixed(5)}
                    </span>
                    <button
                      type="button"
                      onClick={openMaps}
                      className="inline-flex items-center gap-1 rounded-lg bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors"
                    >
                      <MapPin className="h-3 w-3" /> Maps
                    </button>
                  </div>
                </DetailRow>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="px-5 pb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Notes {!notesLoading && notes.length > 0 && `(${notes.length})`}
              </p>
            </div>

            {notesLoading && (
              <div className="flex h-20 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            )}

            {!notesLoading && notesError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{notesError}</div>
            )}

            {!notesLoading && !notesError && notes.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest px-5 py-8 text-center">
                <StickyNote className="h-5 w-5 text-outline" />
                <p className="text-sm font-semibold text-on-surface">No notes yet</p>
                <p className="text-xs text-on-surface-variant">The executive hasn't added notes for this dealer.</p>
              </div>
            )}

            {!notesLoading && !notesError && notes.length > 0 && (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-outline-variant/20 bg-white px-4 py-3">
                    <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{n.note}</p>
                    <p className="mt-2 text-[11px] text-outline">{fmtDateTime(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {previewOpen && dealer.imageUrl && (
        <DealerImagePreviewModal
          imageUrl={dealer.imageUrl}
          dealerName={dealer.shopName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
