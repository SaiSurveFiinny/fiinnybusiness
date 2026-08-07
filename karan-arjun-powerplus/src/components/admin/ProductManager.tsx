import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { db } from '../../lib/firebase';
import { ProductEditor } from './ProductEditor';
import { displayPrice, normalizeProduct, primaryImage, type ProductDetail } from '../../data/products';

/** Maps Firestore error codes to actionable admin-facing messages — same pattern established in FarmerSuccessManager.tsx / CareerManager.tsx. */
function describeFirestoreError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return 'Permission denied by Firestore security rules. Your account may not have write access to this collection.';
    case 'unavailable':
      return 'Could not reach Firestore. Check your internet connection and try again.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    default:
      return err instanceof Error ? `Could not save: ${err.message}` : 'Could not save. Please try again.';
  }
}

/**
 * Admin entry point for the Product Details CMS — replaces Admin.tsx's old
 * inline Product CRUD (name/price/desc/image/badge/featured only). Reads
 * and writes the same `products` Firestore collection Admin.tsx's other
 * tabs (Dashboard stats, seeding) already use, but through the full
 * ProductDetail shape via ProductEditor's 11-tab CMS instead of a single
 * flat form. Firestore documents are schemaless, so older lean-shape
 * product docs created before this CMS existed still load fine here —
 * missing CMS fields simply render as empty sections until edited and
 * saved once through ProductEditor.
 */
export function ProductManager() {
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDetail | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatus(message);
    setStatusType(type);
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        setProducts(snapshot.docs.map((d) => normalizeProduct(d.id, d.data())));
        setIsLoaded(true);
      },
      (err) => showStatus(`Could not load products: ${describeFirestoreError(err)}`, 'error'),
    );
    return unsubscribe;
  }, []);

  const handleSave = async (form: Omit<ProductDetail, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    const duplicateSlug = products.some((p) => p.slug === payload.slug && p.id !== id);
    if (duplicateSlug) {
      showStatus(`Slug "${payload.slug}" is already used by another product. Choose a unique slug.`, 'error');
      throw new Error('duplicate-slug');
    }
    try {
      if (id) {
        await updateDoc(doc(db, 'products', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Product "${payload.name}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'products')), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Product "${payload.name}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };

  const confirmDelete = async (product: ProductDetail) => {
    try {
      await deleteDoc(doc(db, 'products', product.id));
      showStatus('Product deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const toggleStatus = async (product: ProductDetail) => {
    try {
      await updateDoc(doc(db, 'products', product.id), { status: product.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const toggleFeatured = async (product: ProductDetail) => {
    try {
      await updateDoc(doc(db, 'products', product.id), { featured: !product.featured, updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="font-sans text-xl font-bold text-primary">Products Catalog</h2>
            <p className="text-sm text-primary/60 font-sans mt-1">Full product CMS — variants, media, specifications, FAQ, downloads, SEO, and more, all shown at /products/:slug.</p>
          </div>
          <button
            onClick={() => { setEditingProduct(null); setIsEditorOpen(true); }}
            className="bg-primary text-secondary-container px-4 py-2 rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors shrink-0 flex items-center gap-2"
          >
            <Icons.Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
        {status && (
          <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-xl text-sm font-sans font-semibold ${statusType === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {statusType === 'error' ? <Icons.AlertCircle className="w-4 h-4 shrink-0" /> : <Icons.CheckCircle2 className="w-4 h-4 shrink-0" />}
            {status}
            <button onClick={() => setStatus('')} className="ml-auto text-current opacity-60 hover:opacity-100"><Icons.X className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {isLoaded && products.length === 0 && (
          <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
            <p className="text-sm text-primary/60 font-sans">No products yet. Click "Add Product" to create your first one.</p>
          </div>
        )}
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <img
              src={primaryImage(product)?.url || '/bottle-1l-Photoroom.png'}
              alt=""
              className="w-16 h-16 object-cover rounded-xl border border-slate-100 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-sans font-bold text-primary">{product.name || 'Untitled'}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${product.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {product.status === 'published' ? 'Published' : 'Draft'}
                </span>
                {product.featured && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-secondary-container/20 text-secondary">Featured</span>}
              </div>
              <p className="text-xs text-slate-400 font-sans mt-1">
                {product.category || 'No category'} · {product.variants?.length ?? 0} variant{(product.variants?.length ?? 0) === 1 ? '' : 's'}
                {(() => { const p = displayPrice(product); return p !== undefined ? ` · ₹${p.toLocaleString('en-IN')}` : ' · Contact for Price'; })()} · /products/{product.slug || '(no slug)'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => void toggleFeatured(product)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle featured">
                <Icons.Star className={`w-4 h-4 ${product.featured ? 'text-secondary fill-secondary' : ''}`} />
              </button>
              <button onClick={() => void toggleStatus(product)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle published">
                {product.status === 'published' ? <Icons.CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Icons.X className="w-4 h-4" />}
              </button>
              <button onClick={() => { setEditingProduct(product); setIsEditorOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Icons.Edit className="w-4 h-4" />
              </button>
              {pendingDeleteId === product.id ? (
                <>
                  <button onClick={() => void confirmDelete(product)} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
                  <button onClick={() => setPendingDeleteId(null)} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
                </>
              ) : (
                <button onClick={() => setPendingDeleteId(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Icons.Trash className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isEditorOpen && (
        <ProductEditor product={editingProduct} onSave={handleSave} onClose={() => { setIsEditorOpen(false); setEditingProduct(null); }} />
      )}
    </div>
  );
}
