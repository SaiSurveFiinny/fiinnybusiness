import { useState, useEffect, useMemo } from 'react';
import { query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { History, Search, X, TrendingUp, TrendingDown, Package, Loader2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  qtyIn: number;
  qtyOut: number;
  remainingBatchQty: number;
  remainingStock: number;
  type: 'purchase' | 'sale_pos' | 'sale_b2b';
  sourceType: string;
  sourceId: string;
  sourceNumber: string;
  date: string;
  createdAt?: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  purchase: { label: 'Purchase', color: '#10b981', bg: 'hsla(152,60%,40%,0.1)' },
  sale_pos: { label: 'POS Sale', color: '#3b82f6', bg: 'hsla(217,91%,60%,0.1)' },
  sale_b2b: { label: 'B2B Sale', color: '#8b5cf6', bg: 'hsla(263,70%,60%,0.1)' },
};

const fmtDate = (s: string) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockMovementPage() {
  const { tenantId } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'purchase' | 'sale_pos' | 'sale_b2b'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(
      query(
        getTenantCollection(db, tenantId, 'stockMovements'),
        orderBy('createdAt', 'desc'),
      ),
      snap => {
        setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockMovement)));
        setLoading(false);
      },
      err => { console.error(err); setLoading(false); },
    );
    return () => unsub();
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter(m => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo) return false;
      if (q) {
        return (
          m.productName.toLowerCase().includes(q) ||
          (m.batchNumber || '').toLowerCase().includes(q) ||
          (m.sourceNumber || '').toLowerCase().includes(q) ||
          (m.sourceType || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [movements, search, typeFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const totalIn = filtered.filter(m => m.type === 'purchase').reduce((s, m) => s + (m.qtyIn || 0), 0);
    const totalOut = filtered.filter(m => m.type !== 'purchase').reduce((s, m) => s + (m.qtyOut || 0), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [filtered]);

  return (
    <div className="animate-fade-in">

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="primary-gradient-text" style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <History size={28} /> Stock Movement History
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Complete audit trail of every inventory movement — purchases, POS sales, and B2B invoices.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Movements', value: filtered.length, color: 'var(--primary-light)', icon: <Package size={16} /> },
          { label: 'Units In (Purchase)', value: stats.totalIn.toLocaleString('en-IN'), color: '#10b981', icon: <TrendingUp size={16} /> },
          { label: 'Units Out (Sales)', value: stats.totalOut.toLocaleString('en-IN'), color: '#f59e0b', icon: <TrendingDown size={16} /> },
          { label: 'Net Movement', value: (stats.net >= 0 ? '+' : '') + stats.net.toLocaleString('en-IN'), color: stats.net >= 0 ? '#10b981' : '#ef4444', icon: <History size={16} /> },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '12px', padding: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.color, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="input-field" style={{ paddingLeft: '2.25rem', margin: 0 }} placeholder="Search product, batch, invoice number…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {(['all', 'purchase', 'sale_pos', 'sale_b2b'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={typeFilter === t ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}>
              {t === 'all' ? 'All' : TYPE_META[t]?.label ?? t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="date" className="input-field" style={{ margin: 0, width: '140px', fontSize: '0.82rem' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>to</span>
          <input type="date" className="input-field" style={{ margin: 0, width: '140px', fontSize: '0.82rem' }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {filtered.length} of {movements.length} records
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={28} style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          <History size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
          <div style={{ fontWeight: 600 }}>{movements.length === 0 ? 'No movements yet' : 'No matches found'}</div>
          <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
            {movements.length === 0
              ? 'Movements are recorded automatically when Purchase Invoices, POS bills, or B2B invoices are saved.'
              : 'Try adjusting your filters.'}
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                {['Date', 'Type', 'Source', 'Product', 'Batch', 'Qty In', 'Qty Out', 'Remaining (Batch)', 'Remaining (Total)'].map(h => (
                  <th key={h} style={{ padding: '0.7rem 0.85rem', fontWeight: 600, textAlign: ['Qty In', 'Qty Out', 'Remaining (Batch)', 'Remaining (Total)'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const tm = TYPE_META[m.type] ?? { label: m.type, color: 'var(--text-secondary)', bg: 'transparent' };
                const isPurchase = m.type === 'purchase';
                return (
                  <tr key={m.id}
                    style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-raised)' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'hsla(152,60%,40%,0.04)')}
                    onMouseOut={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--surface-raised)')}
                  >
                    <td style={{ padding: '0.6rem 0.85rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDate(m.date)}</td>
                    <td style={{ padding: '0.6rem 0.85rem' }}>
                      <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontWeight: 700, color: tm.color, background: tm.bg }}>
                        {tm.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.85rem', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.sourceType}</div>
                      {m.sourceNumber && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{m.sourceNumber}</div>}
                    </td>
                    <td style={{ padding: '0.6rem 0.85rem' }}>
                      <div style={{ fontWeight: 600 }}>{m.productName}</div>
                    </td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {m.batchNumber || '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: isPurchase ? '#10b981' : 'var(--text-tertiary)' }}>
                      {isPurchase && m.qtyIn > 0 ? `+${m.qtyIn}` : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: !isPurchase ? '#ef4444' : 'var(--text-tertiary)' }}>
                      {!isPurchase && m.qtyOut > 0 ? `-${m.qtyOut}` : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>{m.remainingBatchQty ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>{m.remainingStock ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
