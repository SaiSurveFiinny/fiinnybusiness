// ─────────────────────────────────────────────────────────────────────────────
// Reusable column-filter + sort controls for data tables.
//
// Extracted so the Product Master, Inventory Batches, and Stock Movement tables
// can share one compact, consistent column-filter system (matching the Stock
// Report). Each control is a top-level component (never defined inside a parent
// render) so inputs keep focus while typing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

// ── Multi-select checklist filter ([] = show all) ─────────────────────────────
// Compact trigger button + a fixed-position checkbox panel. Used where a column
// must filter on several values at once (e.g. Salesperson, Portfolio). The panel
// is position:fixed so it escapes the table's overflow container.

export interface MultiOption { value: string; label: string }

export function ColumnMultiSelectFilter({
    selected, options, onChange, allLabel = 'All',
}: {
    selected: string[];
    options: MultiOption[];
    onChange: (next: string[]) => void;
    allLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
    }, [open]);

    const toggleOpen = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
        setOpen(o => !o);
    };
    const toggleValue = (v: string) => {
        const set = new Set(selected);
        set.has(v) ? set.delete(v) : set.add(v);
        onChange([...set]);
    };

    const active = selected.length > 0;
    const summary = selected.length === 0
        ? allLabel
        : selected.length === 1
            ? (options.find(o => o.value === selected[0])?.label ?? '1 selected')
            : `${selected.length} selected`;

    const rowStyle = (checked: boolean): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left',
        padding: '0.4rem 0.5rem', background: checked ? 'hsla(263,70%,60%,0.10)' : 'none',
        border: 'none', borderRadius: '7px', cursor: 'pointer', font: 'inherit',
        fontSize: '0.8rem', color: 'var(--text-primary)',
    });

    return (
        <>
            <button ref={btnRef} type="button" onClick={e => { e.stopPropagation(); toggleOpen(); }}
                className="input-field"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400, cursor: 'pointer', color: active ? 'var(--primary)' : 'var(--text-primary)', textAlign: 'left' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
                <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>
            {open && pos && createPortal(
                <div ref={panelRef} onClick={e => e.stopPropagation()}
                    style={{ position: 'fixed', top: pos.top, left: Math.min(pos.left, window.innerWidth - pos.width - 8), width: pos.width, maxHeight: '260px', overflowY: 'auto', zIndex: 5001, background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: '0.3rem' }}>
                    <button type="button" onClick={() => onChange([])} style={{ ...rowStyle(selected.length === 0), fontWeight: 600 }}>
                        <input type="checkbox" readOnly checked={selected.length === 0} style={{ pointerEvents: 'none', flexShrink: 0 }} />
                        {allLabel}
                    </button>
                    {options.map(o => {
                        const checked = selected.includes(o.value);
                        return (
                            <button key={o.value} type="button" onClick={() => toggleValue(o.value)} style={rowStyle(checked)}>
                                <input type="checkbox" readOnly checked={checked} style={{ pointerEvents: 'none', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                            </button>
                        );
                    })}
                    {options.length === 0 && <div style={{ padding: '0.6rem', fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>No options</div>}
                </div>,
                document.body,
            )}
        </>
    );
}
