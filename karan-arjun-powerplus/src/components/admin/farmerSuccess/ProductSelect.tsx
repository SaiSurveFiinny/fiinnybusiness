import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import type { Product } from '../../../data/mockData';

interface ProductSelectProps {
  value: string;
  onChange: (productId: string) => void;
}

/**
 * Single-select dropdown over the existing `products` collection — the
 * single-selection counterpart to ProductPicker.tsx's multi-select, for
 * fields like Testimonial.relatedProductId / CropResult.productId that
 * reference exactly one product rather than a list.
 */
export function ProductSelect({ value, onChange }: ProductSelectProps) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(
        snapshot.docs.map((docItem) => {
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
        }),
      );
    });
    return () => unsubscribe();
  }, []);

  return (
    <div>
      <label className="block font-sans text-sm font-semibold text-primary mb-2">Related Product</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <option value="">None</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
