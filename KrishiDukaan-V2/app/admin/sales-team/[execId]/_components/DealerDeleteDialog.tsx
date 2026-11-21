"use client";

import { useState } from "react";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { auth } from "../../../../firebase";
import type { Dealer } from "../../../../sales/dealers/dealers-service";

type Props = {
  dealer: Dealer;
  onClose: () => void;
  onDeleted: (dealerId: string) => void;
};

export function DealerDeleteDialog({ dealer, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in.");
      const token = await user.getIdToken();
      const resp = await fetch(`/api/admin/sales-team/dealers/${dealer.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error((j as any).error ?? "Delete failed.");
      }
      onDeleted(dealer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface-container-lowest p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-black text-on-surface">Delete dealer?</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              <span className="font-bold text-on-surface">{dealer.shopName}</span> will be
              hidden from all views. This can be undone by support.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
