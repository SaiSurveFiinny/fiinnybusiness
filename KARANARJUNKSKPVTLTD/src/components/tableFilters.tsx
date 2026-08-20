// ─────────────────────────────────────────────────────────────────────────────
// Reusable column-filter + sort controls for data tables.
//
// Extracted so the Product Master, Inventory Batches, and Stock Movement tables
// can share one compact, consistent column-filter system (matching the Stock
// Report). Each control is a top-level component (never defined inside a parent
// render) so inputs keep focus while typing.
// ─────────────────────────────────────────────────────────────────────────────

import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

// ── Numeric filter ────────────────────────────────────────────────────────────

export type NumOp = 'gt' | 'lt' | 'eq';
export interface NumFilter { op: NumOp; value: string }

export const EMPTY_NUM: NumFilter = { op: 'eq', value: '' };

export const NUM_OPS: { key: NumOp; label: string; title: string }[] = [
    { key: 'eq', label: '=', title: 'Equal to' },
    { key: 'gt', label: '>', title: 'Greater than' },
    { key: 'lt', label: '<', title: 'Less than' },
];

/** True when the row value passes the filter. An empty/invalid value passes. */
export function matchNum(val: number, f: NumFilter): boolean {
    const n = parseFloat(f.value);
    if (isNaN(n)) return true;
    if (f.op === 'gt') return val > n;
    if (f.op === 'lt') return val < n;
    return val === n;
}

export function isNumActive(f: NumFilter): boolean {
    return f.value !== '' && !isNaN(parseFloat(f.value));
}

// ── Shared header layout ──────────────────────────────────────────────────────

/** Wraps a sortable label above its filter control inside a <th>. */
export const HDR_COL_STYLE: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0,
};

// ── Sort indicator ────────────────────────────────────────────────────────────

export function SortIndicator({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return <ChevronUp size={10} style={{ opacity: 0.25, marginLeft: '0.2rem', flexShrink: 0 }} />;
    return dir === 'asc'
        ? <ChevronUp   size={11} style={{ marginLeft: '0.2rem', color: 'var(--primary)', flexShrink: 0 }} />
        : <ChevronDown size={11} style={{ marginLeft: '0.2rem', color: 'var(--primary)', flexShrink: 0 }} />;
}

/** Clickable column label that toggles sorting and shows the direction arrow. */
export function SortLabel({
    label, active, dir, align = 'left', title, onClick,
}: {
    label: React.ReactNode;
    active: boolean;
    dir: 'asc' | 'desc';
    align?: 'left' | 'right';
    title?: string;
    onClick: () => void;
}) {
    return (
        <span
            onClick={onClick}
            title={title}
            style={{
                display: 'flex', alignItems: 'center', gap: '0.15rem',
                justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                cursor: 'pointer', userSelect: 'none',
            }}
        >
            {label}<SortIndicator active={active} dir={dir} />
        </span>
    );
}

// ── Text filter ───────────────────────────────────────────────────────────────

export function ColumnTextFilter({
    value, onChange, placeholder = 'Search…',
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', fontWeight: 400 }} onClick={e => e.stopPropagation()}>
            <Search size={11} style={{ position: 'absolute', left: '0.4rem', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="input-field"
                style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 1.4rem 0.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 400 }}
            />
            {value && (
                <button onClick={() => onChange('')} title="Clear"
                    style={{ position: 'absolute', right: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 }}>
                    <X size={11} />
                </button>
            )}
        </div>
    );
}

// ── Numeric filter: [ = ▼ | Value ] — one outer border, subtle inner divider ──

export function ColumnNumFilter({
    state, onChange,
}: {
    state: NumFilter;
    onChange: (f: NumFilter) => void;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'stretch', fontWeight: 400, border: '1px solid var(--surface-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface-base)' }} onClick={e => e.stopPropagation()}>
            <select value={state.op} onChange={e => onChange({ ...state, op: e.target.value as NumOp })}
                title="Comparison"
                style={{ margin: 0, width: '3rem', minWidth: '3rem', padding: '0.25rem 0.15rem', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', cursor: 'pointer', border: 'none', borderRight: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', flexShrink: 0 }}>
                {NUM_OPS.map(o => <option key={o.key} value={o.key} title={o.title}>{o.label}</option>)}
            </select>
            <input type="number" value={state.value} onChange={e => onChange({ ...state, value: e.target.value })}
                placeholder="Value" className="no-spinner"
                style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400, textAlign: 'right', border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none' }} />
        </div>
    );
}

// ── Single-select dropdown filter ('' = show all) ─────────────────────────────

export function ColumnSelectFilter({
    value, options, onChange, allLabel = 'All',
}: {
    value: string;
    options: string[];
    onChange: (v: string) => void;
    allLabel?: string;
}) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            className="input-field" onClick={e => e.stopPropagation()}
            style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400 }}>
            <option value="">{allLabel}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}
