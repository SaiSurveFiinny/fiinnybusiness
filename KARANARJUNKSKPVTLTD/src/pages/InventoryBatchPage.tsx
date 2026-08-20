import { useState, useEffect, useMemo } from 'react';
import { getDocs, onSnapshot, query, orderBy, serverTimestamp, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { logAudit } from '../utils/auditLog';
import { Package, Plus, AlertTriangle, Loader2, Trash2, Search, X, ChevronDown, ChevronRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchItem {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  mfgDate?: string;
  quantity: number;
  purchaseRate?: number;
  mrp?: number;
  supplier?: string;
  sourceInvoiceId?: string;
  unit?: string;
  updatedAt?: any;
}

interface ProductMaster {
  id: string;
  name: string;
  mfgCompany?: string;
  type?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function expiryChipStyle(days: number): React.CSSProperties {
  if (days < 0) return { background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', borderColor: 'hsla(0,84%,60%,0.3)' };
  if (days <= 30) return { background: 'hsla(0,84%,60%,0.08)', color: '#ef4444', borderColor: 'hsla(0,84%,60%,0.2)' };
  if (days <= 90) return { background: 'hsla(38,92%,50%,0.08)', color: '#d97706', borderColor: 'hsla(38,92%,50%,0.3)' };
  return { background: 'hsla(152,60%,40%,0.08)', color: 'var(--primary-light)', borderColor: 'hsla(152,60%,40%,0.2)' };
}

function fmtDate(s?: string): string {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function InventoryBatchPage() {
  const { tenantId, currentUser, userName, userRole } = useAuth();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'expiring' | 'expired'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    productId: '', batchNumber: '', expiryDate: '', mfgDate: '',
    quantity: '', purchaseRate: '', mrp: '', supplier: '',
  });

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(
      query(getTenantCollection(db, tenantId, 'inventoryBatches')),
      snap => {
        setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as BatchItem)));
        setLoading(false);
      },
    );
    // Load products for the Add Batch form dropdown
    getDocs(query(getTenantCollection(db, tenantId, 'products'), orderBy('name'))).then(snap =>
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductMaster)))
    );
    return () => unsub();
  }, [tenantId]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let expired = 0, expiringSoon = 0, totalQty = 0;
    for (const b of batches) {
      const d = daysUntil(b.expiryDate);
      if (d < 0) expired++;
      else if (d <= 30) expiringSoon++;
      totalQty += b.quantity || 0;
    }
    return { expired, expiringSoon, totalQty };
  }, [batches]);

  // ── Filter + group ────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = batches.filter(b => {
      const matchSearch = !q ||
        (b.productName || '').toLowerCase().includes(q) ||
        (b.batchNumber || '').toLowerCase().includes(q) ||
        (b.supplier || '').toLowerCase().includes(q);
      const days = daysUntil(b.expiryDate);
      const matchStatus =
        filterStatus === 'all' ? true :
        filterStatus === 'expired' ? days < 0 :
        days >= 0 && days <= 90;
      return matchSearch && matchStatus;
    });

    // Group by productId (fallback to productName for batches without productId)
    const map = new Map<string, { key: string; name: string; batches: BatchItem[]; totalQty: number }>();
    for (const b of filtered) {
      const key = b.productId || `name:${b.productName}`;
      const g = map.get(key) ?? { key, name: b.productName || '(Unknown Product)', batches: [], totalQty: 0 };
      g.batches.push(b);
      g.totalQty += b.quantity || 0;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [batches, search, filterStatus]);

  const toggleExpand = (key: string) =>
    setExpanded(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // ── Save manual batch ─────────────────────────────────────────────────────
  const handleAddBatch = async () => {
    if (!tenantId || !addForm.productId || !addForm.batchNumber) return;
    setSaving(true);
    try {
      const product = products.find(p => p.id === addForm.productId);
      const batchNo = addForm.batchNumber.trim();
      const batchDocId = `${addForm.productId}_${batchNo.replace(/[/\\.\s[\]#*?]/g, '_')}`;
      // setDoc with merge:true creates the doc if missing or updates if present
      await setDoc(
        getTenantDoc(db, tenantId, 'inventoryBatches', batchDocId) as any,
        {
          productId: addForm.productId,
          productName: product?.name || '',
          batchNumber: batchNo,
          expiryDate: addForm.expiryDate || '',
          mfgDate: addForm.mfgDate || '',
          quantity: Number(addForm.quantity) || 0,
          purchaseRate: Number(addForm.purchaseRate) || 0,
          mrp: Number(addForm.mrp) || 0,
          supplier: addForm.supplier.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      logAudit({ db, tenantId, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Inventory', action: 'Batch Create', entityName: `${product?.name || addForm.productId} · Batch ${batchNo}`, entityId: batchDocId, description: `Batch added manually · Qty: ${addForm.quantity} · Exp: ${addForm.expiryDate || 'N/A'}`, after: { productName: product?.name, batchNumber: batchNo, quantity: Number(addForm.quantity) || 0, expiryDate: addForm.expiryDate } });
      setAddForm({ productId: '', batchNumber: '', expiryDate: '', mfgDate: '', quantity: '', purchaseRate: '', mrp: '', supplier: '' });
      setShowAddForm(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !window.confirm('Delete this batch record?')) return;
    const batch = batches.find(b => b.id === id);
    await deleteDoc(getTenantDoc(db, tenantId, 'inventoryBatches', id) as any);
    logAudit({ db, tenantId, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Inventory', action: 'Delete', entityName: batch ? `${batch.productName} · Batch ${batch.batchNumber}` : id, entityId: id, description: `Batch record deleted`, before: batch ? { productName: batch.productName, batchNumber: batch.batchNumber, quantity: batch.quantity } : undefined });
  };

  const updateQty = async (id: string, qty: number) => {
    if (!tenantId) return;
    const batch = batches.find(b => b.id === id);
    const newQty = Math.max(0, qty);
    await updateDoc(getTenantDoc(db, tenantId, 'inventoryBatches', id) as any, { quantity: newQty, updatedAt: serverTimestamp() });
    logAudit({ db, tenantId, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Inventory', action: 'Stock Adjustment', entityName: batch ? `${batch.productName} · Batch ${batch.batchNumber}` : id, entityId: id, description: `Manual stock adjustment`, before: { quantity: batch?.quantity ?? '?' }, after: { quantity: newQty } });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Package size={28} /> Inventory Batches
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.2rem' }}>
            Batch-wise stock tracking. Each batch is independent — different batches are never merged.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(f => !f)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={16} /> Add Batch
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Batches', value: batches.length, color: '#6366f1' },
          { label: 'Expiring (30d)', value: stats.expiringSoon, color: '#f59e0b', icon: <AlertTriangle size={15} /> },
          { label: 'Expired', value: stats.expired, color: '#ef4444', icon: <AlertTriangle size={15} /> },
          { label: 'Total Units', value: stats.totalQty.toLocaleString('en-IN'), color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.color, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add Batch Form */}
      {showAddForm && (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem', border: '2px dashed var(--primary-light)', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 1rem', fontWeight: 700, fontSize: '0.95rem' }}>Add Batch Entry</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="input-label">Product *</label>
              <select className="input-field" value={addForm.productId} onChange={e => setAddForm(f => ({ ...f, productId: e.target.value }))}>
                <option value="">— Select from Product Master —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.mfgCompany ? ` (${p.mfgCompany})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Batch Number *</label>
              <input className="input-field" value={addForm.batchNumber} onChange={e => setAddForm(f => ({ ...f, batchNumber: e.target.value }))} placeholder="e.g. B2024-01" />
            </div>
            <div>
              <label className="input-label">Expiry Date</label>
              <input type="date" className="input-field" value={addForm.expiryDate} onChange={e => setAddForm(f => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">Mfg Date</label>
              <input type="date" className="input-field" value={addForm.mfgDate} onChange={e => setAddForm(f => ({ ...f, mfgDate: e.target.value }))} />
            </div>
            <div>
              <label className="input-label">Quantity (units)</label>
              <input type="number" min="0" className="input-field" value={addForm.quantity} onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="input-label">Purchase Rate</label>
              <input type="number" min="0" step="0.01" className="input-field" value={addForm.purchaseRate} onChange={e => setAddForm(f => ({ ...f, purchaseRate: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="input-label">MRP</label>
              <input type="number" min="0" step="0.01" className="input-field" value={addForm.mrp} onChange={e => setAddForm(f => ({ ...f, mrp: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="input-label">Supplier</label>
              <input className="input-field" value={addForm.supplier} onChange={e => setAddForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={() => setShowAddForm(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={handleAddBatch} disabled={saving || !addForm.productId || !addForm.batchNumber} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Save Batch
            </button>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="input-field" style={{ paddingLeft: '2.25rem', margin: 0 }} placeholder="Search product or batch number…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {(['all', 'expiring', 'expired'] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={filterStatus === f ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}>
              {f === 'all' ? 'All' : f === 'expiring' ? 'Expiring Soon' : 'Expired'}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {grouped.length} product{grouped.length !== 1 ? 's' : ''} · {batches.length} batch{batches.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Grouped Batch List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={30} style={{ margin: '0 auto' }} /></div>
      ) : grouped.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          <Package size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
          <div style={{ fontWeight: 600 }}>{batches.length === 0 ? 'No batches yet' : 'No matches found'}</div>
          <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
            {batches.length === 0 ? 'Batches are created automatically when a Purchase Invoice is saved.' : 'Try a different search or filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {grouped.map(group => {
            const isOpen = expanded.has(group.key);
            const anyExpired = group.batches.some(b => daysUntil(b.expiryDate) < 0);
            const anyExpiring = !anyExpired && group.batches.some(b => { const d = daysUntil(b.expiryDate); return d >= 0 && d <= 90; });

            return (
              <div key={group.key} className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                {/* Product header row */}
                <button
                  onClick={() => toggleExpand(group.key)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{group.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {anyExpired && <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>EXPIRED BATCH</span>}
                    {anyExpiring && !anyExpired && <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '999px', background: 'hsla(38,92%,50%,0.12)', color: '#d97706', fontWeight: 700 }}>EXPIRING</span>}
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{group.batches.length} batch{group.batches.length !== 1 ? 'es' : ''}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{group.totalQty.toLocaleString('en-IN')} units</span>
                  </div>
                </button>

                {/* Batch chips */}
                {isOpen && (
                  <div style={{ padding: '0.5rem 1.25rem 1rem', borderTop: '1px solid var(--surface-border)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {group.batches.map(b => {
                      const days = daysUntil(b.expiryDate);
                      const chipStyle = expiryChipStyle(days);
                      return (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'stretch', borderRadius: '10px', border: `1px solid ${chipStyle.borderColor}`, background: chipStyle.background, overflow: 'hidden', fontSize: '0.8rem' }}>
                          {/* Chip body */}
                          <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ fontWeight: 700, color: chipStyle.color }}>
                              {b.batchNumber || 'No Batch No.'}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                              {b.expiryDate && <span>Exp: <strong style={{ color: chipStyle.color }}>{fmtDate(b.expiryDate)}</strong></span>}
                              {b.purchaseRate ? <span>Rate: {fmtInr(b.purchaseRate)}</span> : null}
                              {b.supplier && <span>From: {b.supplier}</span>}
                            </div>
                            {/* Qty stepper */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                              <button onClick={() => updateQty(b.id, b.quantity - 1)} style={{ width: 22, height: 22, border: `1px solid ${chipStyle.borderColor}`, borderRadius: '5px', background: 'transparent', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: chipStyle.color }}>−</button>
                              <span style={{ fontWeight: 800, fontSize: '0.9rem', minWidth: '2rem', textAlign: 'center' }}>{b.quantity}</span>
                              <button onClick={() => updateQty(b.id, b.quantity + 1)} style={{ width: 22, height: 22, border: `1px solid ${chipStyle.borderColor}`, borderRadius: '5px', background: 'transparent', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: chipStyle.color }}>+</button>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{b.unit || 'units'}</span>
                            </div>
                          </div>
                          {/* Delete */}
                          <button onClick={() => handleDelete(b.id)} style={{ padding: '0 0.6rem', background: 'hsla(0,84%,60%,0.06)', border: 'none', borderLeft: `1px solid ${chipStyle.borderColor}`, cursor: 'pointer', color: '#ef4444', opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
