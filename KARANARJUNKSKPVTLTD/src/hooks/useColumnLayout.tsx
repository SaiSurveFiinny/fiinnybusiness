// ─────────────────────────────────────────────────────────────────────────────
// useColumnLayout — reusable "Google-Sheets style" table column customization.
//
// Provides the same behavior as the Stock Report table:
//   • resize columns by dragging boundaries
//   • freeze columns from a right-click header menu
//   • reset widths / order from that menu
//   • reorder columns by drag-and-drop
//   • persist widths, freeze count, and order in localStorage (per tenant)
//
// It is generic over a set of string column keys, so any table can adopt it.
// The consumer supplies the keys + default widths; the hook returns state,
// drag/resize handlers, freeze offsets, a resize handle, and a context menu.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const FREEZE_SHADOW = '3px 0 6px -2px rgba(0,0,0,0.14)';

export interface UseColumnLayoutOptions<K extends string> {
    keys: readonly K[];
    defaultWidths: Record<K, number>;
    labels: Record<K, string>;
    /** localStorage namespace, e.g. 'fiinny_pm'. Combined with tenantId. */
    storageKey: string;
    tenantId: string | null | undefined;
    minWidth?: number;
}

export function useColumnLayout<K extends string>(opts: UseColumnLayoutOptions<K>) {
    const { keys, defaultWidths, labels, storageKey, tenantId, minWidth = 50 } = opts;

    const LS_WIDTHS = (tid: string) => `${storageKey}_widths_${tid}`;
    const LS_FREEZE = (tid: string) => `${storageKey}_freeze_${tid}`;
    const LS_ORDER  = (tid: string) => `${storageKey}_order_${tid}`;

    const loadWidths = useCallback((tid: string): Record<K, number> => {
        try {
            const raw = localStorage.getItem(LS_WIDTHS(tid));
            if (!raw) return { ...defaultWidths };
            const p = JSON.parse(raw);
            const w = { ...defaultWidths };
            for (const k of keys) {
                if (typeof p[k] === 'number' && p[k] >= minWidth) w[k] = p[k];
            }
            return w;
        } catch { return { ...defaultWidths }; }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keys, defaultWidths, minWidth, storageKey]);

    const loadFreeze = useCallback((tid: string): number => {
        try {
            const raw = localStorage.getItem(LS_FREEZE(tid));
            if (raw === null) return 0;
            const n = parseInt(raw, 10);
            return (!isNaN(n) && n >= 0 && n < keys.length) ? n : 0;
        } catch { return 0; }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keys, storageKey]);

    const loadOrder = useCallback((tid: string): K[] => {
        try {
            const raw = localStorage.getItem(LS_ORDER(tid));
            if (!raw) return [...keys];
            const saved: string[] = JSON.parse(raw);
            if (!Array.isArray(saved)) return [...keys];
            const valid = saved.filter(k => (keys as readonly string[]).includes(k)) as K[];
            const missing = (keys as readonly K[]).filter(k => !valid.includes(k));
            return [...valid, ...missing];
        } catch { return [...keys]; }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keys, storageKey]);

    const [colWidths, setColWidths]   = useState<Record<K, number>>({ ...defaultWidths });
    const [freezeCount, setFreezeCount] = useState(0);
    const [colOrder, setColOrder]     = useState<K[]>([...keys]);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    const [dragFromKey, setDragFromKey] = useState<K | null>(null);
    const [dragOverKey, setDragOverKey] = useState<K | null>(null);

    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; colIdx: number } | null>(null);

    const dragRef = useRef<{ key: K; startX: number; startWidth: number; latest: number } | null>(null);
    const colElRefs = useRef<Partial<Record<K, HTMLTableColElement>>>({});

    // Load persisted settings once tenantId is available.
    useEffect(() => {
        if (!tenantId) return;
        setColWidths(loadWidths(tenantId));
        setFreezeCount(loadFreeze(tenantId));
        setColOrder(loadOrder(tenantId));
        setSettingsLoaded(true);
    }, [tenantId, loadWidths, loadFreeze, loadOrder]);

    // Persist on change (after the initial load).
    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_WIDTHS(tenantId), JSON.stringify(colWidths)); } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [colWidths, tenantId, settingsLoaded]);

    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_FREEZE(tenantId), String(freezeCount)); } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [freezeCount, tenantId, settingsLoaded]);

    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_ORDER(tenantId), JSON.stringify(colOrder)); } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [colOrder, tenantId, settingsLoaded]);

    // Global mouse handlers for resize drag — attached once.
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const { key, startX, startWidth } = dragRef.current;
            const newW = Math.max(minWidth, startWidth + e.clientX - startX);
            dragRef.current.latest = newW;
            const col = colElRefs.current[key];
            if (col) col.style.width = `${newW}px`;
        };
        const onUp = () => {
            if (!dragRef.current) return;
            const { key, latest } = dragRef.current;
            dragRef.current = null;
            setIsResizing(false);
            setColWidths(prev => ({ ...prev, [key]: latest }));
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [minWidth]);

    // Close the context menu on Escape.
    useEffect(() => {
        if (!ctxMenu) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ctxMenu]);

    const handleResizeStart = (e: React.MouseEvent, key: K) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { key, startX: e.clientX, startWidth: colWidths[key], latest: colWidths[key] };
        setIsResizing(true);
    };

    const registerColEl = (key: K) => (el: HTMLTableColElement | null) => {
        if (el) colElRefs.current[key] = el; else delete colElRefs.current[key];
    };

    const resizeHandle = (key: K) => (
        <div
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize', zIndex: 4, userSelect: 'none' }}
            onMouseDown={e => handleResizeStart(e, key)}
        />
    );

    // Drag-to-reorder props for a header <th>.
    const getDragProps = (key: K) => ({
        draggable: !isResizing,
        onDragStart: () => setDragFromKey(key),
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (key !== dragFromKey) setDragOverKey(key); },
        onDragLeave: () => setDragOverKey(null),
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragFromKey && dragFromKey !== key) {
                setColOrder(prev => {
                    const next = [...prev];
                    const fi = next.indexOf(dragFromKey); const ti = next.indexOf(key);
                    if (fi < 0 || ti < 0) return prev;
                    next.splice(fi, 1); next.splice(ti, 0, dragFromKey);
                    return next;
                });
            }
            setDragFromKey(null); setDragOverKey(null);
        },
        onDragEnd: () => { setDragFromKey(null); setDragOverKey(null); },
    });

    const handleTableContextMenu = (e: React.MouseEvent) => {
        const th = (e.target as HTMLElement).closest('th');
        e.preventDefault();
        if (!th || th.closest('thead') === null) { setCtxMenu(null); return; }
        const colIdx = (th as HTMLTableCellElement).cellIndex;
        if (colIdx < 0 || colIdx >= colOrder.length) { setCtxMenu(null); return; }
        setCtxMenu({ x: e.clientX, y: e.clientY, colIdx });
    };

    const freezeUpTo = (colIdx: number) => { setFreezeCount(colIdx + 1); setCtxMenu(null); };
    const unfreezeAll = () => { setFreezeCount(0); setCtxMenu(null); };
    const resetWidths = () => { setColWidths({ ...defaultWidths }); setCtxMenu(null); };
    const resetOrder  = () => { setColOrder([...keys]); setCtxMenu(null); };

    const frozenOffsets = useMemo(() => {
        let acc = 0;
        return colOrder.map(key => { const o = acc; acc += colWidths[key]; return o; });
    }, [colWidths, colOrder]);

    const totalTableWidth = useMemo(() => colOrder.reduce((s, k) => s + colWidths[k], 0), [colWidths, colOrder]);

    /** Sticky styles for a frozen column (empty object when not frozen). */
    const stickyStyle = (colIdx: number, o?: { header?: boolean; rowBg?: string }): React.CSSProperties => {
        const frozen = colIdx < freezeCount;
        if (!frozen) return {};
        const isLastFrozen = colIdx === freezeCount - 1;
        return {
            position: 'sticky',
            left: frozenOffsets[colIdx],
            zIndex: o?.header ? 5 : 1,
            background: o?.rowBg ?? 'var(--surface-base)',
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    const isDragOver = (key: K) => dragOverKey === key && dragFromKey !== key;

    // Ready-to-render right-click menu (kept identical to the Stock Report UX).
    const ContextMenu = () => {
        if (!ctxMenu) return null;
        const ctxItemStyle: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--text-primary)', font: 'inherit' };
        return (
            <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }} onMouseDown={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
                <div role="menu"
                    style={{ position: 'fixed', top: Math.min(ctxMenu.y, window.innerHeight - 160), left: Math.min(ctxMenu.x, window.innerWidth - 230), zIndex: 5001, minWidth: '210px', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.35rem', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}
                    onMouseDown={e => e.stopPropagation()}>
                    <div style={{ padding: '0.25rem 0.6rem 0.4rem', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--surface-border)', marginBottom: '0.25rem' }}>
                        {labels[colOrder[ctxMenu.colIdx]]}
                    </div>
                    <button onClick={() => freezeUpTo(ctxMenu.colIdx)} style={ctxItemStyle}>Freeze this column</button>
                    {freezeCount > 0 && <button onClick={unfreezeAll} style={ctxItemStyle}>Unfreeze columns</button>}
                    <button onClick={resetWidths} style={ctxItemStyle}>Reset all column widths</button>
                    <button onClick={resetOrder} style={ctxItemStyle}>Reset column order</button>
                </div>
            </>
        );
    };

    return {
        colOrder, colWidths, freezeCount, isResizing,
        frozenOffsets, totalTableWidth,
        registerColEl, resizeHandle, handleResizeStart,
        getDragProps, isDragOver,
        handleTableContextMenu, ctxMenu, ContextMenu,
        stickyStyle, labels,
        freezeUpTo, unfreezeAll, resetWidths, resetOrder,
    };
}
