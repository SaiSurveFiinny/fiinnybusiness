import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { db } from '../../lib/firebase';
import type { Product } from '../../data/mockData';

interface ProductPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select picker over the EXISTING `products` Firestore collection
 * (the same one Shop.tsx and Admin.tsx's Products tab already read/write).
 * Crop problems/practices reference products by id here rather than storing
 * a copy of product data, per the explicit "do not duplicate products"
 * requirement.
 */
export function ProductPicker({ selectedIds, onChange }: ProductPickerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const value: Product[] = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          name: String(data.name ?? 'Untitled Product'),
          desc: String(data.desc ?? ''),
          numericPrice: Number(data.numericPrice ?? data.price ?? 0),
          price: typeof data.price === 'string' ? data.price : `₹${Number(data.numericPrice ?? 0).toLocaleString('en-IN')}`,
          image: String(data.image ?? '/bottle-1l-Photoroom.png'),
          badge: data.badge ? String(data.badge) : undefined,
          featured: Boolean(data.featured),
        };
      });
      setProducts(value);
    });
    return () => unsubscribe();
  }, []);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id]);
  };

  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="relative">
      <label className="block font-sans text-sm font-semibold text-primary mb-2">Related Products</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-left flex items-center justify-between"
      >
        <span className="text-primary/80">
          {selectedProducts.length > 0 ? `${selectedProducts.length} product(s) selected` : 'Select products...'}
        </span>
        <Icons.ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {selectedProducts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedProducts.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/5 text-primary rounded-full text-xs font-sans font-semibold">
              {p.name}
              <button type="button" onClick={() => toggle(p.id)} className="hover:text-red-600">
                <Icons.X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-2 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
          {products.length === 0 ? (
            <p className="p-4 text-sm text-slate-400 font-sans">No products found. Add products in the Products module first.</p>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-sans hover:bg-slate-50 transition-colors ${
                  selectedIds.includes(p.id) ? 'bg-primary/5' : ''
                }`}
              >
                <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${selectedIds.includes(p.id) ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                  {selectedIds.includes(p.id) && <Icons.CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                {p.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
