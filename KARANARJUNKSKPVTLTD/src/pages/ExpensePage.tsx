import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Receipt, Plus, Search, X, Loader2, Trash2, Pencil, CheckCircle2,
  IndianRupee, CalendarDays, User, ChevronDown, ChevronUp, Tag,
  TrendingUp, BarChart3,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  serverTimestamp, orderBy, type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';

// ── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'Employee Salary',
  'Subscription',
  'Cloud Services',
  'Internet',
  'Electricity',
  'Office Rent',
  'Office Supplies',
  'Travel',
  'Maintenance',
  'Marketing',
  'Miscellaneous',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Employee Salary': '#6366f1',
  'Subscription':    '#3b82f6',
  'Cloud Services':  '#06b6d4',
  'Internet':        '#10b981',
  'Electricity':     '#f59e0b',
  'Office Rent':     '#f97316',
  'Office Supplies': '#ec4899',
  'Travel':          '#8b5cf6',
  'Maintenance':     '#14b8a6',
  'Marketing':       '#ef4444',
  'Miscellaneous':   '#94a3b8',
};

type Category = typeof EXPENSE_CATEGORIES[number] | string;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Expense {
  id: string;
  name: string;
  category: Category;
  amount: number;
  date: string;          // YYYY-MM-DD
  linkedEmployeeId?: string | null;
  linkedEmployeeName?: string | null;
  notes?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface Employee {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

type SortCol = 'name' | 'category' | 'amount' | 'date';
type SortDir = 'asc' | 'desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d: string) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const monthLabel = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

// ── Scroll-lock helper (body.expense-modal-open) ──────────────────────────────

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

interface ModalProps {
  editing: Expense | null;
  employees: Employee[];
  pastNames: string[];
  onClose: () => void;
  onSaved: (e: Expense) => void;
}

function ExpenseModal({ editing, employees, pastNames, onClose, onSaved }: ModalProps) {
  const { tenantId, currentUser } = useAuth();
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    category: editing?.category ?? EXPENSE_CATEGORIES[0],
    amount: editing?.amount != null ? String(editing.amount) : '',
    date: editing?.date ?? today(),
    linkedEmployeeId: editing?.linkedEmployeeId ?? '',
    linkedEmployeeName: editing?.linkedEmployeeName ?? '',
    notes: editing?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useScrollLock(true);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 60);
  }, []);

  const handleNameChange = (v: string) => {
    setForm(f => ({ ...f, name: v }));
    if (v.trim().length >= 1) {
      const q = v.toLowerCase();
      setSuggestions(pastNames.filter(n => n.toLowerCase().includes(q) && n !== v).slice(0, 6));
      setShowSugg(true);
    } else {
      setShowSugg(false);
    }
  };

  const pickSuggestion = (name: string) => {
    setForm(f => ({ ...f, name }));
    setShowSugg(false);
  };

  const handleSave = async () => {
    if (!tenantId) return;
    const amt = parseFloat(form.amount);
    // Only the four core fields are required; employee is always optional.
    if (!form.name.trim() || isNaN(amt) || amt <= 0 || !form.date) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        amount: amt,
        date: form.date,
        // Employee is explicitly optional — store null when not selected.
        linkedEmployeeId: form.linkedEmployeeId || null,
        linkedEmployeeName: form.linkedEmployeeName || null,
        notes: form.notes.trim() || null,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(getTenantDoc(db, tenantId, 'expenses', editing.id), payload);
        onSaved({ ...editing, ...payload, updatedAt: undefined });
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'expenses'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email ?? '',
        });
        onSaved({ id: ref.id, ...(payload as any) });
      }
      // onSaved closes the modal — setSaving(false) only needed on failure path
    } catch (e: any) {
      console.error(e);
      setSaveError(e?.message ?? 'Could not save expense. Please try again.');
      setSaving(false);
    }
  };

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{text}</label>
  );

  return createPortal(
    <div
      onMouseDown={e => { if (e.currentTarget === e.target && !saving) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220,30%,4%,0.72)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.18s ease-out' }}
      role="dialog" aria-modal="true"
    >
      <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '1.75rem', borderRadius: '16px', animation: 'scaleUp 0.22s ease-out', maxHeight: '92vh', overflowY: 'auto' }}>
        <button onClick={() => !saving && onClose()} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Receipt size={18} className="primary-gradient-text" />
          {editing ? 'Edit Expense' : 'Add Expense'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Expense Name + autocomplete */}
          <div style={{ position: 'relative' }}>
            {label('Expense Name *')}
            <input
              ref={nameRef}
              className="input-field"
              placeholder="e.g. AWS Monthly Bill"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              style={{ margin: 0, width: '100%' }}
            />
            {showSugg && suggestions.length > 0 && (
              <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '8px', zIndex: 10, margin: 0, padding: '0.25rem 0', listStyle: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                {suggestions.map(s => (
                  <li key={s}
                    onMouseDown={() => pickSuggestion(s)}
                    style={{ padding: '0.5rem 0.85rem', cursor: 'pointer', fontSize: '0.87rem', color: 'var(--text-primary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >{s}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Category + Amount side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              {label('Category *')}
              <select
                className="input-field"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ margin: 0 }}
              >
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              {label('Amount (₹) *')}
              <input
                className="input-field"
                type="number"
                min={0}
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                style={{ margin: 0 }}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            {label('Date *')}
            <input
              className="input-field"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ margin: 0 }}
            />
          </div>

          {/* Linked Employee — always optional */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              Linked Employee
              <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-tertiary)', background: 'var(--surface-raised)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>optional</span>
            </label>
            <select
              className="input-field"
              value={form.linkedEmployeeId}
              onChange={e => {
                const emp = employees.find(em => em.id === e.target.value);
                setForm(f => ({ ...f, linkedEmployeeId: e.target.value, linkedEmployeeName: emp?.name ?? '' }));
              }}
              style={{ margin: 0 }}
            >
              <option value="">— No employee —</option>
              {employees.map(em => <option key={em.id} value={em.id}>{em.name || em.email}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            {label('Notes (optional)')}
            <textarea
              className="input-field"
              placeholder="Any additional details…"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ margin: 0, resize: 'vertical' }}
            />
          </div>
        </div>

        {saveError && (
          <div style={{ marginTop: '1rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'hsla(0,100%,50%,0.09)', color: '#ff4d4f', fontSize: '0.82rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
            <X size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.amount || !form.date}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {editing ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ExpensePage() {
  const { tenantId } = useAuth();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & sort
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Analytics period
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'30' | '90' | '365' | 'all'>('30');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Analytics section visibility
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Load data — expenses and employees are fetched independently so a
  // permissions failure on the users collection never blocks expense loading.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);

    // Expenses — required; failure surfaces loading=false with empty list
    getDocs(query(getTenantCollection(db, tenantId, 'expenses'), orderBy('date', 'desc')))
      .then(snap => { if (!cancelled) setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense))); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    // Employees — optional; failure is silent; employee field degrades to free-text
    getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId)))
      .then(snap => { if (!cancelled) setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))); })
      .catch(() => { /* employees are optional — degrade gracefully */ });

    return () => { cancelled = true; };
  }, [tenantId]);

  // Autocomplete source: unique past expense names
  const pastNames = useMemo(() => [...new Set(expenses.map(e => e.name))].sort(), [expenses]);

  // ── Computed ────────────────────────────────────────────────────────────────

  const todayStr = today();
  const firstOfMonth = todayStr.slice(0, 7) + '-01';

  const totalAll = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const thisMonth = useMemo(() => expenses.filter(e => e.date >= firstOfMonth && e.date <= todayStr).reduce((s, e) => s + e.amount, 0), [expenses]);
  const salaryTotal = useMemo(() => expenses.filter(e => e.category === 'Employee Salary').reduce((s, e) => s + e.amount, 0), [expenses]);
  const otherTotal = useMemo(() => expenses.filter(e => e.category !== 'Employee Salary').reduce((s, e) => s + e.amount, 0), [expenses]);

  // Filter expenses for table
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let arr = [...expenses];
    if (q) arr = arr.filter(e =>
      (e.name ?? '').toLowerCase().includes(q) ||
      (e.category ?? '').toLowerCase().includes(q) ||
      (e.linkedEmployeeName ?? '').toLowerCase().includes(q) ||
      (e.notes ?? '').toLowerCase().includes(q)
    );
    if (catFilter) arr = arr.filter(e => e.category === catFilter);
    if (dateFrom) arr = arr.filter(e => e.date >= dateFrom);
    if (dateTo) arr = arr.filter(e => e.date <= dateTo);
    arr.sort((a, b) => {
      let diff = 0;
      if (sortCol === 'name') diff = (a.name || '').localeCompare(b.name || '');
      else if (sortCol === 'category') diff = (a.category || '').localeCompare(b.category || '');
      else if (sortCol === 'amount') diff = a.amount - b.amount;
      else diff = (a.date || '').localeCompare(b.date || '');
      return sortDir === 'asc' ? diff : -diff;
    });
    return arr;
  }, [expenses, q, catFilter, dateFrom, dateTo, sortCol, sortDir]);

  // Analytics data
  const analyticsExpenses = useMemo(() => {
    if (analyticsPeriod === 'all') return expenses;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(analyticsPeriod));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return expenses.filter(e => e.date >= cutoffStr);
  }, [expenses, analyticsPeriod]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of analyticsExpenses) map[e.category] = (map[e.category] || 0) + e.amount;
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [analyticsExpenses]);

  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of analyticsExpenses) {
      const ym = e.date.slice(0, 7);
      map[ym] = (map[ym] || 0) + e.amount;
    }
    return Object.keys(map).sort().map(ym => ({ month: monthLabel(ym + '-01'), value: map[ym] }));
  }, [analyticsExpenses]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'date' || col === 'amount' ? 'desc' : 'asc'); }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !window.confirm('Delete this expense? This cannot be undone.')) return;
    setDeletingId(id);
    await deleteDoc(getTenantDoc(db, tenantId, 'expenses', id));
    setExpenses(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  };

  const handleSaved = (saved: Expense) => {
    setExpenses(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next.sort((a, b) => b.date.localeCompare(a.date)); }
      return [saved, ...prev].sort((a, b) => b.date.localeCompare(a.date));
    });
    setModalOpen(false);
    setEditing(null);
  };

  // ── Sort indicator ────────────────────────────────────────────────────────────

  const si = (col: SortCol) => sortCol === col ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null;

  const thStyle: React.CSSProperties = {
    padding: '0.55rem 0.8rem', fontWeight: 700, fontSize: '0.71rem', color: 'var(--text-tertiary)',
    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    background: 'var(--surface-raised)', borderBottom: '2px solid var(--surface-border)',
    cursor: 'pointer', userSelect: 'none',
  };

  const catColor = (cat: string) => CATEGORY_COLORS[cat] ?? '#94a3b8';

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1300px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={24} className="primary-gradient-text" /> Expense Tracker
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Track all company operating expenses
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditing(null); setModalOpen(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Expenses', value: fmtInr(totalAll), color: '#6366f1', icon: <Receipt size={18} /> },
          { label: "This Month", value: fmtInr(thisMonth), color: '#3b82f6', icon: <CalendarDays size={18} /> },
          { label: 'Employee Salaries', value: fmtInr(salaryTotal), color: '#f59e0b', icon: <User size={18} /> },
          { label: 'Other Expenses', value: fmtInr(otherTotal), color: '#10b981', icon: <Tag size={18} /> },
        ].map(c => (
          <div key={c.label} className="glass-panel" style={{ padding: '1.2rem', borderRadius: '12px', borderTop: `3px solid ${c.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.color, marginBottom: '0.5rem' }}>
              {c.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Analytics section */}
      <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <button
          onClick={() => setShowAnalytics(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', justifyContent: 'space-between' }}
        >
          <span style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={16} style={{ color: 'var(--primary-light)' }} /> Analytics
          </span>
          {showAnalytics ? <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />}
        </button>

        {showAnalytics && (
          <div style={{ padding: '0 1.25rem 1.25rem' }}>
            {/* Period selector */}
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem' }}>
              {([['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year'], ['all', 'All time']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setAnalyticsPeriod(k)}
                  className={analyticsPeriod === k ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '0.3rem 0.85rem', fontSize: '0.78rem' }}>{l}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flexWrap: 'wrap' }}>
              {/* Monthly trend */}
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={14} /> Monthly Trend
                </p>
                {monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlyTrend} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsla(0,0%,100%,0.05)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem' }}
                        formatter={(v: any) => [fmtInr(Number(v)), 'Expenses']}
                      />
                      <Bar dataKey="value" fill="var(--primary-light)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No data</div>
                )}
              </div>

              {/* By category pie */}
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Tag size={14} /> By Category
                </p>
                {byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                        {byCategory.map((entry, i) => (
                          <Cell key={i} fill={catColor(entry.name)} />
                        ))}
                      </Pie>
                      <Legend
                        formatter={(value: string) => <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{value}</span>}
                        iconSize={10}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem' }}
                        formatter={(v: any) => [fmtInr(Number(v)), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No data</div>
                )}
              </div>
            </div>

            {/* Top categories bar list */}
            {byCategory.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>Top Categories</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {byCategory.slice(0, 6).map(({ name, value }) => {
                    const pct = byCategory[0].value > 0 ? (value / byCategory[0].value) * 100 : 0;
                    return (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ minWidth: '130px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{name}</span>
                        <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--surface-border)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: catColor(name), borderRadius: '4px', transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ minWidth: '80px', textAlign: 'right', fontWeight: 700, fontSize: '0.82rem', color: catColor(name) }}>{fmtInr(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '340px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            className="input-field"
            placeholder="Search expenses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.1rem', paddingRight: search ? '2rem' : undefined, margin: 0, height: '36px', fontSize: '0.85rem' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}><X size={14} /></button>}
        </div>

        {/* Category filter */}
        <select
          className="input-field"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          style={{ margin: 0, height: '36px', fontSize: '0.85rem', minWidth: '160px' }}
        >
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Date from/to */}
        <input className="input-field" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          title="From date" style={{ margin: 0, height: '36px', fontSize: '0.85rem', width: '145px' }} />
        <input className="input-field" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          title="To date" style={{ margin: 0, height: '36px', fontSize: '0.85rem', width: '145px' }} />

        {(catFilter || dateFrom || dateTo) && (
          <button className="btn btn-secondary" onClick={() => { setCatFilter(''); setDateFrom(''); setDateTo(''); }}
            style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <X size={13} /> Clear filters
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
          {' · '}
          <strong>{fmtInr(filtered.reduce((s, e) => s + e.amount, 0))}</strong>
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          <Loader2 size={24} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
          <div>Loading expenses…</div>
        </div>
      ) : (
        <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <IndianRupee size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.2 }} />
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses match your filters'}
              </div>
              {expenses.length === 0 && (
                <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}
                  style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Plus size={15} /> Add your first expense
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '1rem' }} onClick={() => handleSort('name')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>Expense Name {si('name')}</span>
                    </th>
                    <th style={{ ...thStyle, textAlign: 'left' }} onClick={() => handleSort('category')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>Category {si('category')}</span>
                    </th>
                    <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('amount')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>Amount {si('amount')}</span>
                    </th>
                    <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('date')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>Date {si('date')}</span>
                    </th>
                    <th style={{ ...thStyle, textAlign: 'left', cursor: 'default' }}>Linked Employee</th>
                    <th style={{ ...thStyle, textAlign: 'left', cursor: 'default' }}>Notes</th>
                    <th style={{ ...thStyle, textAlign: 'right', cursor: 'default', paddingRight: '1rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => {
                    const rowBg = i % 2 === 0 ? 'transparent' : 'var(--surface-raised)';
                    const cc = catColor(e.category);
                    return (
                      <tr key={e.id} style={{ borderTop: '1px solid var(--surface-border)', background: rowBg, transition: 'background 0.1s' }}
                        onMouseEnter={el => (el.currentTarget.style.background = 'hsla(152,60%,40%,0.06)')}
                        onMouseLeave={el => (el.currentTarget.style.background = rowBg)}>
                        {/* Name */}
                        <td style={{ padding: '0.6rem 0.8rem 0.6rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{e.name}</td>
                        {/* Category badge */}
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px', background: `${cc}18`, color: cc }}>
                            {e.category}
                          </span>
                        </td>
                        {/* Amount */}
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>
                          {fmtInr(e.amount)}
                        </td>
                        {/* Date */}
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {fmtDate(e.date)}
                        </td>
                        {/* Employee */}
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                          {e.linkedEmployeeName || <span style={{ opacity: 0.4 }}>—</span>}
                        </td>
                        {/* Notes */}
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-tertiary)', fontSize: '0.82rem', maxWidth: '200px' }}>
                          <span title={e.notes ?? undefined} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.notes || <span style={{ opacity: 0.4 }}>—</span>}
                          </span>
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '0.6rem 0.8rem 0.6rem 0.5rem', textAlign: 'right', paddingRight: '1rem' }}>
                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => { setEditing(e); setModalOpen(true); }}
                              title="Edit"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', padding: '0.3rem', display: 'flex', borderRadius: '6px' }}
                              onMouseEnter={el => (el.currentTarget.style.background = 'var(--surface-raised)')}
                              onMouseLeave={el => (el.currentTarget.style.background = 'none')}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(e.id)}
                              title="Delete"
                              disabled={deletingId === e.id}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.3rem', display: 'flex', borderRadius: '6px' }}
                              onMouseEnter={el => (el.currentTarget.style.background = 'var(--surface-raised)')}
                              onMouseLeave={el => (el.currentTarget.style.background = 'none')}
                            >
                              {deletingId === e.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <ExpenseModal
          editing={editing}
          employees={employees}
          pastNames={pastNames}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
