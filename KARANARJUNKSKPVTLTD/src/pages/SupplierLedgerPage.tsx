import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, Loader2,
  IndianRupee, Package, Truck, ChevronRight, ChevronDown, Link2, Search, X,
  Bell,
} from 'lucide-react';
import { getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import SupplierFormModal from '../components/SupplierFormModal';

interface UpcomingReminder {
  id: string;
  supplierId: string;
  supplierName: string;
  reminderDate: string;
  amount: number;
  title: string;
  status: 'open' | 'completed';
}

interface Supplier {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  supplierType?: string;
  outstandingBalance: number;
  totalInvoiced?: number;
  totalPaid?: number;
}

type PartyFilter = 'all' | 'suppliers' | 'transporters';
type SortCol = 'name' | 'invoiced' | 'paid' | 'outstanding' | 'nextPayment';

const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function SupplierLedgerPage() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([]);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<SortCol>('outstanding');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadSuppliers = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'suppliers'));
      const list: Supplier[] = snap.docs.map(d => ({ id: d.id, outstandingBalance: 0, ...d.data() } as Supplier));
      setSuppliers(list);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadUpcomingReminders = async () => {
    if (!tenantId) return;
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'supplierPaymentReminders'));
      const todayStr = new Date().toISOString().slice(0, 10);
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as UpcomingReminder))
        .filter(r => r.status !== 'completed')
        .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));
      const overdue = list.filter(r => r.reminderDate < todayStr);
      const upcoming = list.filter(r => r.reminderDate >= todayStr);
      setUpcomingReminders([...overdue, ...upcoming]);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadSuppliers(); loadUpcomingReminders(); }, [tenantId]);

  const handleCreated = (openId?: string) => {
    setShowAddSupplier(false);
    if (openId) navigate(`/supplier-ledger/${openId}`);
    else loadSuppliers();
  };

  // Group active reminders by supplierId (upcomingReminders already date-sorted)
  const remindersBySupplierId = useMemo(() => {
    const map = new Map<string, UpcomingReminder[]>();
    for (const r of upcomingReminders) {
      const arr = map.get(r.supplierId) ?? [];
      arr.push(r);
      map.set(r.supplierId, arr);
    }
    return map;
  }, [upcomingReminders]);

  const totalOutstanding = suppliers.reduce((s, sup) => s + (sup.outstandingBalance || 0), 0);
  const totalInvoiced = suppliers.reduce((s, sup) => s + (sup.totalInvoiced || 0), 0);

  const q = search.trim().toLowerCase();
  const partyFiltered = partyFilter === 'all'
    ? suppliers
    : suppliers.filter(sup => (sup.supplierType === 'Transporter') === (partyFilter === 'transporters'));
  const filtered = q
    ? partyFiltered.filter(sup =>
        (sup.name || '').toLowerCase().includes(q) ||
        (sup.phone || '').toLowerCase().includes(q) ||
        (sup.email || '').toLowerCase().includes(q) ||
        (sup.address || '').toLowerCase().includes(q))
    : partyFiltered;

  const handleSort = (col: SortCol) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedSuppliers = useMemo(() => {
    const arr = [...filtered];
    const todayStr = new Date().toISOString().slice(0, 10);
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case 'name':
          diff = (a.name || '').localeCompare(b.name || '');
          break;
        case 'invoiced':
          diff = (a.totalInvoiced ?? 0) - (b.totalInvoiced ?? 0);
          break;
        case 'paid':
          diff = (a.totalPaid ?? 0) - (b.totalPaid ?? 0);
          break;
        case 'outstanding':
          diff = a.outstandingBalance - b.outstandingBalance;
          break;
        case 'nextPayment': {
          const aDate = remindersBySupplierId.get(a.id)?.[0]?.reminderDate ?? '9999-12-31';
          const bDate = remindersBySupplierId.get(b.id)?.[0]?.reminderDate ?? '9999-12-31';
          diff = aDate.localeCompare(bDate);
          break;
        }
      }
      return sortDir === 'asc' ? diff : -diff;
    });
    return arr;
  }, [filtered, sortBy, sortDir, remindersBySupplierId]);

  const sortIndicator = (col: SortCol) =>
    sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const thStyle = (col: SortCol, align: 'left' | 'right' | 'center' = 'right'): React.CSSProperties => ({
    padding: '0.6rem 0.75rem',
    fontWeight: 700,
    fontSize: '0.71rem',
    color: sortBy === col ? 'var(--primary-light)' : 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    textAlign: align,
    userSelect: 'none' as const,
    background: 'var(--surface-raised)',
    borderBottom: '2px solid var(--surface-border)',
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Truck size={24} className="primary-gradient-text" /> Supplier Ledger
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Track what you owe to each supplier
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/careoff-sync')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={16} /> Sync Care-Off → AR
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddSupplier(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Suppliers', value: suppliers.length, icon: <Building2 size={18} />, color: 'var(--primary-light)' },
          { label: 'Total Outstanding', value: fmtInr(totalOutstanding), icon: <IndianRupee size={18} />, color: '#ff4d4f' },
          { label: 'Total Invoiced', value: fmtInr(totalInvoiced), icon: <Package size={18} />, color: '#ff9800' },
        ].map(c => (
          <div key={c.label} className="glass-panel" style={{ padding: '1.2rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.color, marginBottom: '0.5rem' }}>
              {c.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Upcoming Payment Reminders dashboard card */}
      {upcomingReminders.length > 0 && (
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '0.85rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: remindersExpanded || upcomingReminders.length <= 3 ? '0.65rem' : 0, flexWrap: 'wrap' }}>
            <Bell size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Upcoming Payment Reminders</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>({upcomingReminders.length} pending)</span>
            {upcomingReminders.length > 3 && (
              <button
                onClick={() => setRemindersExpanded(e => !e)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', fontWeight: 600 }}
              >
                {remindersExpanded ? <><ChevronDown size={13} /> Collapse</> : <><ChevronRight size={13} /> Show all</>}
              </button>
            )}
          </div>
          {(remindersExpanded || upcomingReminders.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {(remindersExpanded ? upcomingReminders : upcomingReminders.slice(0, 3)).map(r => {
                const isOverdue = r.reminderDate < todayStr;
                const sc = isOverdue ? '#ef4444' : '#3b82f6';
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/supplier-ledger/${r.supplierId}?tab=reminders&reminderId=${r.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0.85rem',
                      borderRadius: '8px', background: 'var(--surface-raised)', border: 'none',
                      cursor: 'pointer', textAlign: 'left', borderLeft: `3px solid ${sc}`,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {r.supplierName}
                        {isOverdue && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>OVERDUE</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.05rem' }}>{r.title}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.72rem', color: sc, fontWeight: 600 }}>{fmtDate(r.reminderDate)}</div>
                      {r.amount > 0 && <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{fmtInr(r.amount)}</div>}
                    </div>
                    <ChevronRight size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Controls row: party filter + search + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {([
            { key: 'all', label: 'All' },
            { key: 'suppliers', label: 'Suppliers' },
            { key: 'transporters', label: 'Transporters' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setPartyFilter(f.key)}
              className={partyFilter === f.key ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ padding: '0.3rem 0.85rem', fontSize: '0.78rem' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '380px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            className="input-field"
            placeholder="Search by name, phone, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.1rem', paddingRight: search ? '2rem' : undefined, margin: 0, height: '36px', fontSize: '0.85rem' }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {sortedSuppliers.length}{q ? ` of ${suppliers.length}` : ''} supplier{sortedSuppliers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          <Loader2 size={24} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
          <div>Loading suppliers…</div>
        </div>
      ) : sortedSuppliers.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: '12px' }}>
          <Building2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
          {suppliers.length === 0 ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No suppliers yet</div>
              <div style={{ fontSize: '0.82rem' }}>Add your first supplier to get started.</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No suppliers match "{search}"</div>
              <div style={{ fontSize: '0.82rem' }}>Try a different name, phone or email.</div>
            </>
          )}
        </div>
      ) : (
        <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle('name', 'left'), paddingLeft: '1rem' }} onClick={() => handleSort('name')}>
                    Company{sortIndicator('name')}
                  </th>
                  <th style={thStyle('invoiced')} onClick={() => handleSort('invoiced')}>
                    Total Invoiced{sortIndicator('invoiced')}
                  </th>
                  <th style={thStyle('paid')} onClick={() => handleSort('paid')}>
                    Total Paid{sortIndicator('paid')}
                  </th>
                  <th style={thStyle('outstanding')} onClick={() => handleSort('outstanding')}>
                    Outstanding{sortIndicator('outstanding')}
                  </th>
                  <th style={thStyle('nextPayment')} onClick={() => handleSort('nextPayment')}>
                    Next Payment{sortIndicator('nextPayment')}
                  </th>
                  <th style={{ ...thStyle('name', 'left'), cursor: 'default', color: 'var(--text-tertiary)' }}>
                    Reminders
                  </th>
                  <th style={{ ...thStyle('name', 'right'), paddingRight: '1rem', cursor: 'default', color: 'var(--text-tertiary)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.map((sup, i) => {
                  const reminders = remindersBySupplierId.get(sup.id) ?? [];
                  const nextReminder = reminders[0];
                  const isOverdue = nextReminder && nextReminder.reminderDate < todayStr;
                  const dateColor = isOverdue ? '#ef4444' : '#3b82f6';
                  const rowBg = i % 2 === 0 ? 'transparent' : 'var(--surface-raised)';

                  return (
                    <tr
                      key={sup.id}
                      style={{ borderTop: '1px solid var(--surface-border)', background: rowBg, transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsla(152,60%,40%,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      {/* Company */}
                      <td style={{ padding: '0.6rem 0.75rem 0.6rem 1rem' }}>
                        <button
                          onClick={() => navigate(`/supplier-ledger/${sup.id}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                        >
                          <Building2 size={14} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sup.name}</span>
                          {sup.supplierType === 'Transporter' && (
                            <span style={{ fontSize: '0.63rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: 'hsla(220,70%,55%,0.12)', color: '#4f8ef7', fontWeight: 700, flexShrink: 0 }}>
                              TRANSPORT
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Total Invoiced */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {fmtInr(sup.totalInvoiced ?? 0)}
                      </td>

                      {/* Total Paid */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                        {fmtInr(sup.totalPaid ?? 0)}
                      </td>

                      {/* Outstanding */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: sup.outstandingBalance > 0 ? '#ff4d4f' : '#10b981' }}>
                          {fmtInr(sup.outstandingBalance)}
                        </span>
                      </td>

                      {/* Next Payment Date */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {nextReminder ? (
                          <span style={{ color: dateColor, fontSize: '0.82rem', fontWeight: 600 }}>
                            {fmtDate(nextReminder.reminderDate)}
                            {isOverdue && (
                              <span style={{ marginLeft: '0.35rem', fontSize: '0.63rem', padding: '0.05rem 0.3rem', borderRadius: '999px', background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>
                                overdue
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Payment Reminder */}
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        {reminders.length > 0 ? (
                          <button
                            onClick={() => navigate(`/supplier-ledger/${sup.id}?tab=reminders`)}
                            style={{
                              background: 'hsla(220,70%,55%,0.1)', border: '1px solid hsla(220,70%,55%,0.25)',
                              borderRadius: '999px', cursor: 'pointer', padding: '0.2rem 0.6rem',
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              color: '#4f8ef7', fontWeight: 600, fontSize: '0.76rem',
                            }}
                          >
                            <Bell size={11} />
                            {reminders.length} Upcoming
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>No Active</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.6rem 0.75rem 0.6rem 0.5rem', textAlign: 'right', paddingRight: '1rem' }}>
                        <button
                          onClick={() => navigate(`/supplier-ledger/${sup.id}`)}
                          className="btn btn-secondary"
                          style={{ padding: '0.28rem 0.65rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          View <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <SupplierFormModal
          mode="create"
          onClose={() => setShowAddSupplier(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
