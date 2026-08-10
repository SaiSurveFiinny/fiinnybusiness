"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Heart, MessageCircle, Pencil, Plus, Search, Trash2, User, Video } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth } from "../../firebase";
import { ReelFormModal } from "../../dashboard/_components/reel-form-modal";
import { fetchAllReels, deleteReel, type ReelDoc } from "../../dashboard/_lib/reels-firestore";

export default function AdminReelsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [reels, setReels] = useState<ReelDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editReel, setEditReel] = useState<ReelDoc | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReelDoc | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Guard: must be signed in to upload to Storage
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/admin-login");
      } else {
        setAuthChecked(true);
      }
    });
    return () => unsub();
  }, [router]);

  const load = () => {
    setLoading(true);
    fetchAllReels()
      .then(setReels)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return reels;
    return reels.filter((r) => [r.shopName, r.shopOwnerId, r.title, r.caption].join(" ").toLowerCase().includes(q));
  }, [reels, search]);

  const performDelete = async (r: ReelDoc) => {
    setDeleting(r.id);
    try {
      await deleteReel(r.id);
      setReels((prev) => prev.filter((x) => x.id !== r.id));
      setConfirmDelete(null);
    } finally {
      setDeleting(null);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 sm:gap-3">
            <Video className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            <h1 className="text-lg font-black text-on-surface sm:text-2xl">Reels</h1>
          </div>
          <p className="ml-7 text-xs text-on-surface-variant sm:ml-9 sm:text-sm">
            All seller reels. Admin can edit or delete any reel, or upload one on behalf of a seller.
          </p>
        </div>
        <button
          onClick={() => {
            setEditReel(null);
            setShowForm(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-container sm:w-auto shrink-0"
        >
          <Plus className="h-4 w-4" /> Upload for Seller
        </button>
      </div>

      <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input
          type="text"
          placeholder="Search by shop name, phone, title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
        />
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">
              {filtered.length} reel{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-container-low transition-colors">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-black shrink-0">
                  {r.thumbnailUrl ? (
                    <img src={r.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={r.videoUrl} className="w-full h-full object-cover" muted />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-on-surface truncate">{r.title || r.caption}</p>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="truncate">{r.shopName}</span>
                    <span className="font-mono">({r.shopOwnerId})</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-on-surface-variant">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {r.viewsCount}</span>
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {r.likesCount}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {r.commentsCount}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditReel(r);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(r)}
                    disabled={deleting === r.id}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-variant hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-on-surface-variant">No reels found.</div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <ReelFormModal
          mode={editReel ? "edit" : "create"}
          reel={editReel ?? undefined}
          adminMode
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mb-4">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-on-surface">Delete Reel</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                Are you sure you want to delete this reel from <span className="font-semibold text-on-surface">{confirmDelete.shopName}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => performDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting === confirmDelete.id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting…
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
