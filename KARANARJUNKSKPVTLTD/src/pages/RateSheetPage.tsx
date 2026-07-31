import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Package, Plus, Edit2, Trash2, Loader2, Save, X, Download,
  FileSpreadsheet, FileDown, Search, AlertTriangle,
} from 'lucide-react';
import { query, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { AGRI_CATEGORIES } from '../utils/constants';
import Papa from 'papaparse';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  productNumber?: string;
  name: string;
  type?: string;         // Category
  mfgCompany?: string;   // Manufacturer
  description?: string;
  unitSize?: number;
  unitMeasure?: string;
  baseUnit?: string;
  gstPct?: number;
  maxRetailPrice: number;
  retailerPrice?: number;   // PTR — kept for POS/B2B compatibility
  purchasePrice: number;
  sellingPrice: number;
  // Stock fields (written by POS/inventoryPosting; read-only here)
  quantity?: number;
  loosePieces?: number;
  boxCapacity?: number;
  margin?: string;
  imageUrl?: string;
}

interface BatchItem {
  id: string;
  productId: string;
  productName?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchaseRate?: number;
  mrp?: number;
}

const LOW_STOCK = 100;
const EXPIRY_WARN_DAYS = 90;

const totalStock = (p: Product) =>
  (p.loosePieces ?? 0) + (p.quantity ?? 0) * (p.boxCapacity ?? 1);

const fmtDate = (s?: string) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const daysUntil = (dateStr: string) => {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
};

// CSV columns — single source of truth for template, export, and import
const CSV_COLS = [
  { field: 'productNumber', header: 'SKU', num: false },
  { field: 'name', header: 'Product Name', num: false },
  { field: 'type', header: 'Category', num: false },
  { field: 'mfgCompany', header: 'Manufacturer', num: false },
  { field: 'unitSize', header: 'Unit Size', num: true },
  { field: 'unitMeasure', header: 'Unit Measure', num: false },
  { field: 'baseUnit', header: 'Base Unit', num: false },
  { field: 'gstPct', header: 'GST %', num: true },
  { field: 'maxRetailPrice', header: 'MRP', num: true },
  { field: 'retailerPrice', header: 'Retailer Price', num: true },
  { field: 'purchasePrice', header: 'Purchase Rate', num: true },
  { field: 'sellingPrice', header: 'Sales Rate', num: true },
] as const;

const UNIT_MEASURES = ['pcs', 'ml', 'ltr', 'g', 'kg'] as const;
const GST_OPTIONS = [0, 5, 12, 18, 28];

const emptyForm = () => ({
  productNumber: '', name: '', type: '', mfgCompany: '', description: '',
  unitSize: 1, unitMeasure: 'pcs' as string, baseUnit: 'pcs' as string,
  gstPct: 5, maxRetailPrice: 0, retailerPrice: 0, purchasePrice: 0, sellingPrice: 0,
  imageUrl: '',
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function RateSheetPage() {
  const { t } = useTranslation();
  const { userRole, tenantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState(emptyForm());
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = userRole === 'admin' || userRole === 'analyst';
  const canSeeCost = userRole === 'admin';
  const canDelete = userRole === 'admin';

  // ── Data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const unsub1 = onSnapshot(
      query(getTenantCollection(db, tenantId, 'products')),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        data.sort((a, b) => a.name.localeCompare(b.name));
        setProducts(data);
        setLoading(false);
      },
    );
    const unsub2 = onSnapshot(
      query(getTenantCollection(db, tenantId, 'inventoryBatches')),
      snap => setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as BatchItem))),
    );
    return () => { unsub1(); unsub2(); };
  }, [tenantId]);

  // ── Batch summaries per product ─────────────────────────────────────────────
  const batchSummaries = useMemo(() => {
    const map = new Map<string, { count: number; totalQty: number; soonest: string }>();
    for (const b of batches) {
      if (!b.productId) continue;
      const s = map.get(b.productId) ?? { count: 0, totalQty: 0, soonest: '' };
      s.count++;
      s.totalQty += b.quantity || 0;
      if (b.expiryDate && (!s.soonest || b.expiryDate < s.soonest)) s.soonest = b.expiryDate;
      map.set(b.productId, s);
    }
    return map;
  }, [batches]);

  // ── Dedup check ─────────────────────────────────────────────────────────────
  const checkDuplicate = (name: string, mfgCompany: string, excludeId?: string) => {
    const n = name.trim().toLowerCase();
    const m = mfgCompany.trim().toLowerCase();
    return products.find(p =>
      p.id !== excludeId &&
      p.name.trim().toLowerCase() === n &&
      (p.mfgCompany || '').trim().toLowerCase() === m,
    );
  };

  const handleNameOrMfgChange = (name: string, mfg: string) => {
    if (name.trim() && mfg.trim()) {
      const dup = checkDuplicate(name, mfg, editingProduct?.id);
      setDupWarning(dup ? `"${dup.name}" by "${dup.mfgCompany}" already exists in the catalog.` : null);
    } else {
      setDupWarning(null);
    }
  };

  // ── Modal helpers ───────────────────────────────────────────────────────────
  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        productNumber: product.productNumber || '',
        name: product.name,
        type: product.type || '',
        mfgCompany: product.mfgCompany || '',
        description: product.description || '',
        unitSize: product.unitSize ?? 1,
        unitMeasure: product.unitMeasure || 'pcs',
        baseUnit: product.baseUnit || 'pcs',
        gstPct: product.gstPct ?? 5,
        maxRetailPrice: product.maxRetailPrice || 0,
        retailerPrice: product.retailerPrice || 0,
        purchasePrice: canSeeCost ? (product.purchasePrice || 0) : 0,
        sellingPrice: product.sellingPrice || 0,
        imageUrl: product.imageUrl || '',
      });
      setImagePreview(product.imageUrl || null);
    } else {
      setEditingProduct(null);
      setFormData({ ...emptyForm(), productNumber: nextSku() });
      setImagePreview(null);
    }
    setDupWarning(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setDupWarning(null);
    setImagePreview(null);
  };

  const nextSku = () => {
    let max = 0;
    products.forEach(p => {
      const m = /^KA-(\d+)$/i.exec((p.productNumber || '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `KA-${String(max + 1).padStart(3, '0')}`;
  };

  // ── Image resize ────────────────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1000;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
          else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setImagePreview(dataUrl); setFormData(p => ({ ...p, imageUrl: dataUrl })); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setImagePreview(compressed);
        setFormData(p => ({ ...p, imageUrl: compressed }));
      };
      img.onerror = () => { setImagePreview(dataUrl); setFormData(p => ({ ...p, imageUrl: dataUrl })); };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    // Dedup guard
    const dup = checkDuplicate(formData.name, formData.mfgCompany, editingProduct?.id);
    if (dup) {
      alert(`"${dup.name}" by "${dup.mfgCompany || '(no manufacturer)'}" already exists. Use the existing product instead of creating a duplicate.`);
      return;
    }

    if ((formData.imageUrl?.length || 0) > 900_000) {
      alert('Product photo is too large. Please pick a smaller image.');
      return;
    }

    const margin = formData.maxRetailPrice > 0
      ? `${Math.round(((formData.maxRetailPrice - formData.retailerPrice) / formData.maxRetailPrice) * 100)}%`
      : 'N/A';

    const { purchasePrice, ...costFree } = formData;
    const data: Record<string, unknown> = {
      ...(canSeeCost ? formData : costFree),
      margin,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingProduct) {
        await updateDoc(getTenantDoc(db, tenantId, 'products', editingProduct.id), data);
      } else {
        await addDoc(getTenantCollection(db, tenantId, 'products'), {
          category: 'B2B', boxCapacity: 1, quantity: 0, loosePieces: 0,
          ...data,
          createdAt: serverTimestamp(),
        });
      }
      handleCloseModal();
    } catch (err: unknown) {
      alert(`Failed to save product.\n\n${err instanceof Error ? err.message : err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !window.confirm('Delete this product from the master catalog?')) return;
    await deleteDoc(getTenantDoc(db, tenantId, 'products', id));
  };

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const downloadCsv = (rows: Record<string, unknown>[], filename: string) => {
    const csv = Papa.unparse(rows, { columns: CSV_COLS.map(c => c.header) });
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExport = () => {
    const rows = visibleProducts.map(p => {
      const row: Record<string, unknown> = {};
      CSV_COLS.forEach(c => { row[c.header] = (p as unknown as Record<string, unknown>)[c.field] ?? ''; });
      return row;
    });
    downloadCsv(rows, `product_master_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleDownloadTemplate = () => {
    const row: Record<string, unknown> = {};
    CSV_COLS.forEach(c => { row[c.header] = c.num ? 0 : ''; });
    row['SKU'] = 'KA-001'; row['Product Name'] = 'Sample Product'; row['Category'] = 'Insecticide';
    row['Manufacturer'] = 'Sample Agro Ltd'; row['Unit Size'] = 500; row['Unit Measure'] = 'ml';
    row['GST %'] = 18; row['MRP'] = 120; row['Sales Rate'] = 100;
    downloadCsv([row], 'product_master_template.csv');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !tenantId) return;
    setLoading(true);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          let added = 0, updated = 0, skipped = 0;
          for (const raw of results.data as Record<string, string>[]) {
            const name = (raw['Product Name'] ?? '').trim();
            if (!name) continue;
            const mfgCompany = (raw['Manufacturer'] ?? '').trim();

            const productData: Record<string, unknown> = {};
            for (const c of CSV_COLS) {
              const cell = (raw[c.header] ?? '').trim();
              if (cell === '') continue;
              productData[c.field] = c.num ? (Number.isFinite(Number(cell)) ? Number(cell) : undefined) : cell;
            }
            productData.name = name;
            productData.updatedAt = serverTimestamp();

            // Dedup: match by name + manufacturer
            const existing = products.find(p =>
              p.name.trim().toLowerCase() === name.toLowerCase() &&
              (p.mfgCompany || '').trim().toLowerCase() === mfgCompany.toLowerCase()
            ) || products.find(p =>
              (raw['SKU'] && p.productNumber === raw['SKU'].trim()) ||
              p.name.trim().toLowerCase() === name.toLowerCase()
            );

            const mrp = Number(productData.maxRetailPrice ?? existing?.maxRetailPrice ?? 0) || 0;
            const ptr = Number(productData.retailerPrice ?? existing?.retailerPrice ?? 0) || 0;
            productData.margin = mrp > 0 ? `${Math.round(((mrp - ptr) / mrp) * 100)}%` : 'N/A';

            if (existing) {
              await updateDoc(getTenantDoc(db, tenantId, 'products', existing.id), productData);
              updated++;
            } else {
              await addDoc(getTenantCollection(db, tenantId, 'products'), {
                category: 'B2B', boxCapacity: 1, quantity: 0, loosePieces: 0,
                ...productData, createdAt: serverTimestamp(),
              });
              added++;
            }
          }
          alert(`Upload complete!\nAdded: ${added}  Updated: ${updated}  Skipped: ${skipped}`);
        } catch (err) {
          alert('Error processing CSV. Check console for details.');
          console.error(err);
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
    });
  };

  // ── Filter ──────────────────────────────────────────────────────────────────
  const visibleProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const q = searchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.productNumber || '').toLowerCase().includes(q) ||
      (p.mfgCompany || '').toLowerCase().includes(q) ||
      (p.type || '').toLowerCase().includes(q),
    );
  }, [products, searchTerm]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
      <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem' }} /> {t('common.loading')}
    </div>
  );

  const set = (patch: Partial<ReturnType<typeof emptyForm>>) => setFormData(f => ({ ...f, ...patch }));

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1600px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Package size={28} /> Product Master
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Single source of truth for product information across POS, B2B, Purchase Invoices, and Inventory.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <FileDown size={15} /> Export CSV
          </button>
          {canManage && (
            <>
              <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
              <button onClick={handleDownloadTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <Download size={15} /> CSV Template
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <FileSpreadsheet size={15} /> Upload CSV
              </button>
              <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Plus size={16} /> Add Product
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input
          className="input-field"
          placeholder={`Search by name, SKU, manufacturer, category… (${visibleProducts.length} of ${products.length} products)`}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ paddingLeft: '2.75rem', paddingRight: '2.5rem', margin: 0, height: '48px', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box' }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
              {['#', 'Photo', 'Product Name', 'Category', 'Manufacturer', 'Unit', 'GST %', 'MRP', ...(canSeeCost ? ['Purch Rate'] : []), 'Sales Rate', 'Stock', 'Batches', ...(canManage ? ['Actions'] : [])].map(h => (
                <th key={h} style={{ padding: '0.7rem 0.85rem', fontWeight: 600, textAlign: ['MRP', 'Purch Rate', 'Sales Rate', 'Stock'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((p, i) => {
              const bs = batchSummaries.get(p.id);
              const stock = bs?.totalQty ?? totalStock(p);
              const isLow = stock < LOW_STOCK;
              const soonestExpiry = bs?.soonest;
              const expDays = soonestExpiry ? daysUntil(soonestExpiry) : 999;
              const isExpired = expDays < 0;
              const isExpiring = expDays >= 0 && expDays <= EXPIRY_WARN_DAYS;

              return (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background 0.15s' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', background: 'hsla(152,60%,40%,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Package size={15} color="var(--primary-light)" />}
                    </div>
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    {p.productNumber && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.productNumber}</div>}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>{p.type || '—'}</td>
                  <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>{p.mfgCompany || '—'}</td>
                  <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {p.unitSize ? `${p.unitSize} ${p.unitMeasure || 'pcs'}` : (p.unitMeasure || p.baseUnit || '—')}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>{p.gstPct ?? 0}%</td>
                  <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>₹{(p.maxRetailPrice || 0).toFixed(2)}</td>
                  {canSeeCost && (
                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: 'var(--text-tertiary)' }}>₹{(p.purchasePrice || 0).toFixed(2)}</td>
                  )}
                  <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>₹{(p.sellingPrice || 0).toFixed(2)}</td>
                  <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: isLow ? '#ef4444' : 'var(--text-primary)' }}>{stock}</span>
                    {isLow && (
                      <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>
                        LOW
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    {bs ? (
                      <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontWeight: 600, background: isExpired ? 'hsla(0,84%,60%,0.12)' : isExpiring ? 'hsla(38,92%,50%,0.12)' : 'hsla(152,60%,40%,0.12)', color: isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : 'var(--primary-light)' }}>
                        {bs.count} batch{bs.count !== 1 ? 'es' : ''}
                        {isExpired && ' · ⚠ expired'}
                        {!isExpired && isExpiring && ` · exp ${fmtDate(soonestExpiry)}`}
                      </span>
                    ) : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>}
                  </td>
                  {canManage && (
                    <td style={{ padding: '0.65rem 0.85rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => handleOpenModal(p)} className="btn btn-secondary" style={{ padding: '0.35rem' }}><Edit2 size={13} /></button>
                        {canDelete && (
                          <button onClick={() => handleDelete(p.id)} className="btn" style={{ padding: '0.35rem', background: 'hsla(0,84%,60%,0.08)', color: '#ef4444', border: '1px solid hsla(0,84%,60%,0.2)' }}><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={20} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Package size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.25, display: 'block' }} />
                  {searchTerm ? `No products match "${searchTerm}".` : 'No products yet.'}
                  {canManage && !searchTerm && (
                    <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Plus size={15} /> Add First Product
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)', padding: '1rem' }}>
          <div className="glass-panel animate-scale-in" style={{ width: '95vw', maxWidth: '860px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--neon-glow)' }}>

            {/* Modal header */}
            <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{editingProduct ? 'Edit Product' : 'Add to Product Master'}</h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                  This record is shared across POS, B2B Invoice, and Purchase Invoices.
                </p>
              </div>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={20} /></button>
            </div>

            {/* Dedup warning */}
            {dupWarning && (
              <div style={{ margin: '0.75rem 1.75rem 0', padding: '0.65rem 1rem', background: 'hsla(38,92%,50%,0.12)', border: '1px solid hsla(38,92%,50%,0.3)', borderRadius: '8px', fontSize: '0.82rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                {dupWarning} Use the existing product to avoid duplicates.
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Section 1: Product Identity */}
              <section>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>1 · Product Identity</div>
                <div style={{ display: 'flex', gap: '1.25rem' }}>
                  {/* Photo */}
                  <div style={{ position: 'relative', width: 100, height: 100, borderRadius: 10, border: '2px dashed var(--surface-border)', background: 'var(--surface-raised)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                    {imagePreview
                      ? <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.7rem' }}><Plus size={20} style={{ margin: '0 auto' }} /><div>Photo</div></div>}
                    <input type="file" accept="image/*" onChange={handleImageChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div>
                      <label className="input-label">SKU / Product No.</label>
                      <input className="input-field" value={formData.productNumber} onChange={e => set({ productNumber: e.target.value })} placeholder="KA-001" />
                    </div>
                    <div>
                      <label className="input-label">Product Name *</label>
                      <input required className="input-field" value={formData.name} onChange={e => { set({ name: e.target.value }); handleNameOrMfgChange(e.target.value, formData.mfgCompany); }} placeholder="e.g. Confidor 200 SL" />
                    </div>
                    <div>
                      <label className="input-label">Category</label>
                      <select className="input-field" value={formData.type} onChange={e => set({ type: e.target.value })}>
                        <option value="">— Select —</option>
                        {AGRI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="input-label">Manufacturer</label>
                      <input className="input-field" value={formData.mfgCompany} onChange={e => { set({ mfgCompany: e.target.value }); handleNameOrMfgChange(formData.name, e.target.value); }} placeholder="e.g. Bayer CropScience" />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label className="input-label">Description (optional)</label>
                  <input className="input-field" value={formData.description} onChange={e => set({ description: e.target.value })} placeholder="Short notes shown on rate sheets" />
                </div>
              </section>

              {/* Section 2: Unit Details */}
              <section>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>2 · Unit Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <div>
                    <label className="input-label">Unit Size</label>
                    <input type="number" min="0" step="0.01" className="input-field" value={formData.unitSize || ''} onChange={e => set({ unitSize: Number(e.target.value) })} placeholder="e.g. 500" />
                  </div>
                  <div>
                    <label className="input-label">Unit Measure</label>
                    <select className="input-field" value={formData.unitMeasure} onChange={e => set({ unitMeasure: e.target.value })}>
                      {UNIT_MEASURES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Base Unit</label>
                    <select className="input-field" value={formData.baseUnit} onChange={e => set({ baseUnit: e.target.value })}>
                      {UNIT_MEASURES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Default GST %</label>
                    <select className="input-field" value={formData.gstPct} onChange={e => set({ gstPct: Number(e.target.value) })}>
                      {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 3: Default Rates */}
              <section>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>3 · Default Rates</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <div>
                    <label className="input-label">Default MRP</label>
                    <input type="number" step="0.01" min="0" className="input-field" value={formData.maxRetailPrice || ''} onChange={e => set({ maxRetailPrice: Number(e.target.value) })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="input-label">Retailer Price (PTR)</label>
                    <input type="number" step="0.01" min="0" className="input-field" value={formData.retailerPrice || ''} onChange={e => set({ retailerPrice: Number(e.target.value) })} placeholder="0.00" />
                  </div>
                  {canSeeCost && (
                    <div>
                      <label className="input-label">Default Purchase Rate</label>
                      <input type="number" step="0.01" min="0" className="input-field" value={formData.purchasePrice || ''} onChange={e => set({ purchasePrice: Number(e.target.value) })} placeholder="0.00" />
                    </div>
                  )}
                  <div>
                    <label className="input-label">Default Sales Rate</label>
                    <input type="number" step="0.01" min="0" className="input-field" value={formData.sellingPrice || ''} onChange={e => set({ sellingPrice: Number(e.target.value) })} placeholder="0.00" />
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                  These are defaults only. Rates on individual Purchase Invoices override them without changing the master.
                </p>
              </section>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem', flexShrink: 0 }}>
                <Save size={18} /> {editingProduct ? 'Save Changes' : 'Add to Product Master'}
              </button>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
