import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { classifySale, gstFromInclusive, resolveSaleLine, openingStock as calcOpeningStock } from '../utils/stockReport';
import {
    Package2, Loader2, Search, X, Download,
    Calendar, Eye, Pencil, ChevronUp, ChevronDown, Filter,
    FileText, FileSpreadsheet, FileType,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    name: string;
    type?: string;
    mfgCompany?: string;
    gstPct?: number;
    maxRetailPrice?: number;
    purchasePrice?: number;
    sellingPrice?: number;
    loosePieces?: number;
    quantity?: number;
    boxCapacity?: number;
    unit?: string;
}

interface BatchDoc {
    id: string;
    productId: string;
    productName?: string;
    batchNumber: string;
    expiryDate?: string;
    quantity: number;
    purchaseRate?: number;
    mrp?: number;
    supplier?: string;
    warehouse?: string;
}

interface Movement {
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
    supplierName?: string;
    date: string;
    createdAt?: any;
}

interface SaleRow {
    orderId: string;
    orderNumber: string;
    date: string;
    type: 'sale_pos' | 'sale_b2b';
    customerName: string;
    productId: string;
    productName: string;
    qty: number;
    unit: string;
    rate: number;
    amount: number;
    gstPct: number;
    batchNo?: string;
}

interface AdjustEvent {
    id: string;
    productId: string;
    batchNumber: string;
    date: string;
    ord: number;        // intra-day ordering (createdAt ms) for balance reconstruction
    delta: number;
    after: number;
    party: string;
}

type TxnKind = 'purchase' | 'sale' | 'adjustment';
type TxnChannel = 'purchase' | 'b2b' | 'pos' | 'adjustment';

interface Txn {
    id: string;
    productId: string;
    batchNumber: string;
    kind: TxnKind;
    channel: TxnChannel;
    party: string;
    date: string;
    invoiceNumber: string;
    qty: number;
    value: number;
    gst: number;
    remaining: number | null;
    orderId?: string;
    orderType?: 'sale_pos' | 'sale_b2b';
}

interface ProductView {
    product: Product;
    openingStock: number;    // derived: remaining − in-range purchases + sales − adjustments
    remainingStock: number;  // authoritative live stock = Σ inventoryBatches.quantity
    purchaseRate: number;    // quantity-weighted inventoryBatches.purchaseRate (₹/unit)
    txns: Txn[];             // in-range transactions shown as detail rows
}

interface FlatRow {
    key: string;
    productId: string;
    productName: string;
    openingStock: number;    // per-product; rendered on the product's first row (showStock)
    remainingStock: number;  // per-product; rendered on the product's first row (showStock)
    showStock: boolean;
    batchNumber: string;
    channel: TxnChannel | 'stock';
    channelLabel: string;
    party: string;
    date: string;
    txn: Txn | null;
    b2bQty: number | null;
    b2cQty: number | null;
    purchaseAmount: number;
    salesAmount: number;
    gst: number;
    gstPct: number;
    stockValue: number;
}

// ── Column config ──────────────────────────────────────────────────────────────

const COL_KEYS = [
    'sr', 'product', 'currentStock', 'batchNumber', 'channel',
    'party', 'date', 'invoice', 'b2bQty', 'b2cQty',
    'remaining', 'purchaseAmount', 'salesAmount', 'gst', 'stockValue',
] as const;
type ColKey = typeof COL_KEYS[number];

const DEFAULT_WIDTHS: Record<ColKey, number> = {
    sr:              72,
    product:        240,
    currentStock:   155,
    batchNumber:    140,
    channel:        160,
    party:          110,
    date:           105,
    invoice:        155,
    b2bQty:          65,
    b2cQty:          65,
    remaining:      200,
    purchaseAmount: 170,
    salesAmount:    155,
    gst:             95,
    stockValue:     160,
};

const MIN_COL_WIDTH = 50;

// Human-readable label per column — used by the right-click context menu.
const COL_LABELS: Record<ColKey, string> = {
    sr:             'Sr. No.',
    product:        'Product',
    currentStock:   'Opening Stock',
    batchNumber:    'Batch Number',
    channel:        'Channel',
    party:          'Retailer',
    date:           'Date',
    invoice:        'Invoice',
    b2bQty:         'B2B',
    b2cQty:         'B2C',
    remaining:      'Remaining Stock',
    purchaseAmount: 'Purchase Amount',
    salesAmount:    'Sales Amount',
    gst:            'GST %',
    stockValue:     'Stock Value',
};

const LS_WIDTHS  = (tid: string) => `fiinny_sr_widths_${tid}`;
const LS_FREEZE  = (tid: string) => `fiinny_sr_freeze_${tid}`;
const LS_ORDER   = (tid: string) => `fiinny_sr_order_${tid}`;

function loadWidths(tid: string): Record<ColKey, number> {
    try {
        const raw = localStorage.getItem(LS_WIDTHS(tid));
        if (!raw) return { ...DEFAULT_WIDTHS };
        const p = JSON.parse(raw);
        const w = { ...DEFAULT_WIDTHS };
        for (const k of COL_KEYS) {
            if (typeof p[k] === 'number' && p[k] >= MIN_COL_WIDTH) w[k] = p[k];
        }
        return w;
    } catch { return { ...DEFAULT_WIDTHS }; }
}

function loadFreeze(tid: string): number {
    try {
        const raw = localStorage.getItem(LS_FREEZE(tid));
        if (raw === null) return 0;
        const n = parseInt(raw, 10);
        return (!isNaN(n) && n >= 0 && n < COL_KEYS.length) ? n : 0;
    } catch { return 0; }
}

function loadOrder(tid: string): ColKey[] {
    try {
        const raw = localStorage.getItem(LS_ORDER(tid));
        if (!raw) return [...COL_KEYS];
        const saved: string[] = JSON.parse(raw);
        if (!Array.isArray(saved)) return [...COL_KEYS];
        const valid = saved.filter(k => (COL_KEYS as readonly string[]).includes(k)) as ColKey[];
        const missing = (COL_KEYS as readonly ColKey[]).filter(k => !valid.includes(k));
        return [...valid, ...missing];
    } catch { return [...COL_KEYS]; }
}

// ── Period helpers ─────────────────────────────────────────────────────────────

type Period = 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',      label: 'Today' },
    { key: 'this_week',  label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'all_time',   label: 'All Time' },
    { key: 'custom',     label: 'Custom Range' },
];

// The Channel column displays the full transaction channel (Purchase / B2B /
// B2C / Adjustment), but the column *filter* is a simple single-select over
// the two sale channels only — Purchase and Adjustment are not filter options.
type ChannelSel = 'all' | 'b2b' | 'pos';
const CHANNEL_SEL_OPTS: { key: ChannelSel; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'b2b', label: 'B2B' },
    { key: 'pos', label: 'B2C' },
];

function toStr(d: Date) { return d.toISOString().slice(0, 10); }

// Firestore Timestamp / serverTimestamp → epoch ms (for intra-day event ordering).
function tsMs(x: any): number {
    if (!x) return 0;
    if (typeof x.toMillis === 'function') return x.toMillis();
    if (typeof x.seconds === 'number') return x.seconds * 1000;
    return 0;
}

function periodRange(p: Period, cf: string, ct: string): [string, string] {
    const now = new Date();
    const t = toStr(now);
    switch (p) {
        case 'today':      return [t, t];
        case 'this_week':  { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return [toStr(d), t]; }
        case 'this_month': return [toStr(new Date(now.getFullYear(), now.getMonth(), 1)), t];
        case 'all_time':   return ['2000-01-01', t];
        case 'custom':     return cf && ct ? [cf, ct] : [t, t];
    }
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

const fmtInr  = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum  = (n: number) => n.toLocaleString('en-IN');
const fmtDate = (s: string) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

const CHANNEL_CHIP: Record<TxnChannel, { label: string; bg: string; color: string }> = {
    purchase:   { label: 'Purchase',  bg: 'hsla(152,60%,40%,0.12)', color: '#10b981' },
    b2b:        { label: 'B2B',       bg: 'hsla(263,70%,60%,0.12)', color: '#8b5cf6' },
    pos:        { label: 'B2C', bg: 'hsla(217,91%,60%,0.12)', color: '#3b82f6' },
    adjustment: { label: 'Adjustment',bg: 'hsla(38,92%,50%,0.12)',  color: '#d97706' },
};

const LOW_STOCK = 100;

const NEG_BADGE: React.CSSProperties = {
    marginLeft: '0.3rem', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '999px',
    background: 'hsla(0,84%,60%,0.2)', color: '#ef4444', fontWeight: 800,
};

function stockTone(v: number | null): { td: React.CSSProperties; text: string; neg: boolean } {
    if (v == null)       return { td: {},                                    text: 'var(--text-tertiary)', neg: false };
    if (v < 0)           return { td: { background: 'hsla(0,84%,60%,0.16)' }, text: '#ef4444',            neg: true  };
    if (v < LOW_STOCK)   return { td: { background: 'hsla(0,84%,60%,0.07)' }, text: '#ef4444',            neg: false };
    return { td: {}, text: 'var(--text-primary)', neg: false };
}

// ── Column sort / filter types ─────────────────────────────────────────────────

type SortCol   = 'currentStock' | 'remaining' | 'purchaseAmount' | 'salesAmount' | 'gst' | 'stockValue';
type FilterCol = 'currentStock' | 'remaining' | 'purchaseAmount' | 'salesAmount' | 'gst' | 'stockValue' | 'batchNumber' | 'party' | 'date';
type NumOp     = 'gt' | 'lt' | 'eq';
interface NumFilter { op: NumOp; value: string }

const NUM_OPS: { key: NumOp; label: string; title: string }[] = [
    { key: 'eq', label: '=', title: 'Equal to' },
    { key: 'gt', label: '>', title: 'Greater than' },
    { key: 'lt', label: '<', title: 'Less than' },
];

function matchNum(val: number, f: NumFilter): boolean {
    const n = parseFloat(f.value);
    if (isNaN(n)) return true;
    if (f.op === 'gt') return val > n;
    if (f.op === 'lt') return val < n;
    return val === n;
}
function isNumActive(f: NumFilter): boolean { return f.value !== '' && !isNaN(parseFloat(f.value)); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockReportPage() {
    const { tenantId } = useAuth();
    const navigate = useNavigate();

    // ── Period / date filters ─────────────────────────────────────────────────
    const [period, setPeriod]         = useState<Period>('this_month');
    const [customFrom, setCustomFrom] = useState(firstOfMonth());
    const [customTo, setCustomTo]     = useState(todayStr());
    const [dateFrom, setDateFrom]     = useState(firstOfMonth());
    const [dateTo, setDateTo]         = useState(todayStr());

    useEffect(() => {
        const [f, t] = periodRange(period, customFrom, customTo);
        setDateFrom(f);
        setDateTo(t);
    }, [period, customFrom, customTo]);

    // ── Product multi-select (search + checkbox list, lives in the Product column) ─
    const [productSearch, setProductSearch]             = useState('');
    const [selectedProductIds, setSelectedProductIds]   = useState<Set<string>>(new Set());
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const [productDropdownPos, setProductDropdownPos]   = useState<{ top: number; left: number; width: number } | null>(null);
    const productInputRef = useRef<HTMLInputElement>(null);
    const productDropdownRef = useRef<HTMLDivElement>(null);
    const toggleProduct = (id: string) => setSelectedProductIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const openProductDropdown = () => {
        const r = productInputRef.current?.getBoundingClientRect();
        if (r) setProductDropdownPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) });
        setShowProductDropdown(true);
    };

    // ── Channel filter — single-select: All / B2B / B2C ───────────────────────
    const [channelSel, setChannelSel] = useState<ChannelSel>('all');

    // Close the product dropdown on any click outside the search input or the list.
    useEffect(() => {
        if (!showProductDropdown) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (productInputRef.current?.contains(t) || productDropdownRef.current?.contains(t)) return;
            setShowProductDropdown(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showProductDropdown]);

    // ── Column sort ───────────────────────────────────────────────────────────
    const [sortCol, setSortCol] = useState<SortCol | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const toggleSort = (col: SortCol) => {
        if (sortCol === col) { if (sortDir === 'asc') setSortDir('desc'); else setSortCol(null); }
        else { setSortCol(col); setSortDir('asc'); }
    };

    // ── Column filter state ───────────────────────────────────────────────────
    const [filterOpen, setFilterOpen]       = useState<FilterCol | null>(null);
    const [filterPopoverPos, setFilterPopoverPos] = useState<{ top: number; left: number } | null>(null);

    const [filterBatch, setFilterBatch]     = useState('');
    const [filterParty, setFilterParty]     = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo]   = useState('');
    const [fCurrentStock, setFCurrentStock] = useState<NumFilter>({ op: 'eq', value: '' });
    const [fRemaining, setFRemaining]       = useState<NumFilter>({ op: 'eq', value: '' });
    const [fPurchase, setFPurchase]         = useState<NumFilter>({ op: 'eq', value: '' });
    const [fSales, setFSales]               = useState<NumFilter>({ op: 'eq', value: '' });
    const [fGst, setFGst]                   = useState<NumFilter>({ op: 'eq', value: '' });
    const [fStockValue, setFStockValue]     = useState<NumFilter>({ op: 'eq', value: '' });

    const openFilter = (col: FilterCol, btn: HTMLElement) => {
        const rect = btn.getBoundingClientRect();
        setFilterPopoverPos({ top: rect.bottom + 6, left: rect.left });
        setFilterOpen(prev => prev === col ? null : col);
    };
    const clearFilter = (col: FilterCol) => {
        if (col === 'batchNumber')    setFilterBatch('');
        if (col === 'party')          setFilterParty('');
        if (col === 'date')           { setFilterDateFrom(''); setFilterDateTo(''); }
        if (col === 'currentStock')   setFCurrentStock({ op: 'eq', value: '' });
        if (col === 'remaining')      setFRemaining({ op: 'eq', value: '' });
        if (col === 'purchaseAmount') setFPurchase({ op: 'eq', value: '' });
        if (col === 'salesAmount')    setFSales({ op: 'eq', value: '' });
        if (col === 'gst')            setFGst({ op: 'eq', value: '' });
        if (col === 'stockValue')     setFStockValue({ op: 'eq', value: '' });
    };
    const isFilterActive = (col: FilterCol): boolean => {
        if (col === 'batchNumber')    return filterBatch.trim() !== '';
        if (col === 'party')          return filterParty.trim() !== '';
        if (col === 'date')           return filterDateFrom !== '' || filterDateTo !== '';
        if (col === 'currentStock')   return isNumActive(fCurrentStock);
        if (col === 'remaining')      return isNumActive(fRemaining);
        if (col === 'purchaseAmount') return isNumActive(fPurchase);
        if (col === 'salesAmount')    return isNumActive(fSales);
        if (col === 'gst')            return isNumActive(fGst);
        if (col === 'stockValue')     return isNumActive(fStockValue);
        return false;
    };
    const hasAnyColumnFilter = channelSel !== 'all' || (['batchNumber','party','date','currentStock','remaining','purchaseAmount','salesAmount','gst','stockValue'] as FilterCol[]).some(isFilterActive);

    // ── Column widths + freeze + order (localStorage-persisted) ─────────────
    const [colWidths, setColWidths]       = useState<Record<ColKey, number>>({ ...DEFAULT_WIDTHS });
    const [freezeCount, setFreezeCount]   = useState(0);
    const [colOrder, setColOrder]         = useState<ColKey[]>([...COL_KEYS]);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [isResizing, setIsResizing]     = useState(false);

    // ── Column drag-to-reorder state ─────────────────────────────────────────
    const [dragFromKey, setDragFromKey]   = useState<ColKey | null>(null);
    const [dragOverKey, setDragOverKey]   = useState<ColKey | null>(null);

    // ── Export menu ───────────────────────────────────────────────────────────
    const [showExportMenu, setShowExportMenu] = useState(false);

    // ── Right-click column context menu ───────────────────────────────────────
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; colIdx: number } | null>(null);

    // Right-click a header cell → open contextual menu (and suppress native menu).
    const handleTableContextMenu = (e: React.MouseEvent) => {
        const th = (e.target as HTMLElement).closest('th');
        e.preventDefault();               // suppress the browser menu across the table
        if (!th || th.closest('thead') === null) { setCtxMenu(null); return; }
        const colIdx = (th as HTMLTableCellElement).cellIndex;
        if (colIdx < 0 || colIdx >= colOrder.length) { setCtxMenu(null); return; }
        setCtxMenu({ x: e.clientX, y: e.clientY, colIdx });
    };

    // Freeze the clicked column and everything to its left (Excel/Sheets style).
    const freezeUpTo = (colIdx: number) => { setFreezeCount(colIdx + 1); setCtxMenu(null); };
    const unfreezeAll = () => { setFreezeCount(0); setCtxMenu(null); };
    const resetColumnWidths = () => { setColWidths({ ...DEFAULT_WIDTHS }); setCtxMenu(null); };
    const resetColOrder = () => { setColOrder([...COL_KEYS]); setCtxMenu(null); };

    // Close the context menu on Escape.
    useEffect(() => {
        if (!ctxMenu) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ctxMenu]);

    // Header-height measurement (drives grand-total row sticky offset) lives
    // further down, after `loading` is declared.
    const headerRowRef = useRef<HTMLTableRowElement>(null);
    const [headerH, setHeaderH] = useState(0);

    // drag state stored in a ref so the mousemove handler doesn't go stale
    const dragRef = useRef<{ key: ColKey; startX: number; startWidth: number; latest: number } | null>(null);
    // direct refs to <col> elements for DOM-only mutation during drag
    const colElRefs = useRef<Partial<Record<ColKey, HTMLTableColElement>>>({});

    // Load settings once tenantId is available
    useEffect(() => {
        if (!tenantId) return;
        setColWidths(loadWidths(tenantId));
        setFreezeCount(loadFreeze(tenantId));
        setColOrder(loadOrder(tenantId));
        setSettingsLoaded(true);
    }, [tenantId]);

    // Persist widths whenever they change (skip the initial default state)
    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_WIDTHS(tenantId), JSON.stringify(colWidths)); } catch {}
    }, [colWidths, tenantId, settingsLoaded]);

    // Persist freeze count
    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_FREEZE(tenantId), String(freezeCount)); } catch {}
    }, [freezeCount, tenantId, settingsLoaded]);

    // Persist column order
    useEffect(() => {
        if (!tenantId || !settingsLoaded) return;
        try { localStorage.setItem(LS_ORDER(tenantId), JSON.stringify(colOrder)); } catch {}
    }, [colOrder, tenantId, settingsLoaded]);

    // Global mouse-move / mouse-up for column drag — attached once
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const { key, startX, startWidth } = dragRef.current;
            const newW = Math.max(MIN_COL_WIDTH, startWidth + e.clientX - startX);
            dragRef.current.latest = newW;
            // Direct DOM mutation — no React re-render during drag
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
    }, []);

    const handleResizeStart = (e: React.MouseEvent, key: ColKey) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { key, startX: e.clientX, startWidth: colWidths[key], latest: colWidths[key] };
        setIsResizing(true);
    };

    // Accumulated left offset for each column (used for freeze sticky positioning).
    // Computed from colOrder so frozen offsets respect the current visual order.
    const frozenOffsets = useMemo(() => {
        let acc = 0;
        return colOrder.map(key => { const o = acc; acc += colWidths[key]; return o; });
    }, [colWidths, colOrder]);

    const totalTableWidth = useMemo(() => colOrder.reduce((s, k) => s + colWidths[k], 0), [colWidths, colOrder]);

    // ── Data ──────────────────────────────────────────────────────────────────
    const [products, setProducts]     = useState<Product[]>([]);
    const [batches, setBatches]       = useState<BatchDoc[]>([]);
    const [movements, setMovements]   = useState<Movement[]>([]);
    const [saleRows, setSaleRows]     = useState<SaleRow[]>([]);
    const [adjustEvents, setAdjustEvents] = useState<AdjustEvent[]>([]);
    const [loading, setLoading]       = useState(true);

    // Measure header height so the grand-total row sticks just below it.
    useLayoutEffect(() => {
        const measure = () => setHeaderH(headerRowRef.current?.offsetHeight ?? 0);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [colWidths, freezeCount, loading]);

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        const fetchSalesOrders = getDocs(
            query(getTenantCollection(db, tenantId, 'salesOrders'), where('invoiceDate', '>=', dateFrom), where('invoiceDate', '<=', dateTo), orderBy('invoiceDate', 'desc')),
        ).catch(() =>
            getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('invoiceDate', 'desc')))
                .then(snap => ({ docs: snap.docs.filter(d => { const inv = (d.data() as any).invoiceDate || ''; return inv >= dateFrom && inv <= dateTo; }) }))
                .catch(() => ({ docs: [] as any[] })),
        );

        const fetchAdjustments = getDocs(query(
            getTenantCollection(db, tenantId, 'auditLogs'), where('action', '==', 'Stock Adjustment'),
        )).catch(() => ({ docs: [] as any[] }));

        Promise.all([
            getDocs(query(getTenantCollection(db, tenantId, 'products'))),
            getDocs(query(getTenantCollection(db, tenantId, 'inventoryBatches'))),
            // Fetch the whole ledger up to dateTo (not just the range) so Opening
            // Stock can be reconstructed from balances recorded *before* dateFrom.
            getDocs(query(getTenantCollection(db, tenantId, 'stockMovements'), where('date', '<=', dateTo), orderBy('date', 'desc'))).catch(() => ({ docs: [] as any[] })),
            fetchSalesOrders,
            fetchAdjustments,
        ]).then(([pSnap, bSnap, mSnap, sSnap, aSnap]) => {
            const prods = pSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
            setProducts(prods);
            const batchDocs = bSnap.docs.map(d => ({ id: d.id, ...d.data() } as BatchDoc));
            setBatches(batchDocs);
            setMovements((mSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() } as Movement)));

            const prodMap = new Map(prods.map(p => [p.id, p]));
            const rows: SaleRow[] = [];
            for (const doc of (sSnap as any).docs) {
                const o = doc.data() as any;
                if (o.status === 'cancelled') continue;
                const orderNum = (o.orderNumber || '').trim();
                const type: SaleRow['type'] = classifySale(orderNum);
                const date = o.invoiceDate || '';
                if (!date) continue;
                for (const li of (o.lineItems || [])) {
                    if (!li.productId) continue;
                    const prod = prodMap.get(li.productId);
                    const r = resolveSaleLine(li, prod);
                    rows.push({ orderId: doc.id, orderNumber: orderNum, date, type, customerName: o.retailerName || o.buyerName || 'Walk-in Customer', productId: r.productId, productName: r.productName, qty: r.qty, unit: r.unit, rate: r.rate, amount: r.amount, gstPct: r.gstPct, batchNo: r.batchNo });
                }
            }
            setSaleRows(rows);

            // Keep the FULL adjustment history (not just in-range) — pre-range
            // adjustments set the opening balance; in-range ones are shown + netted.
            const batchById = new Map(batchDocs.map(b => [b.id, b]));
            const adjEvents: AdjustEvent[] = [];
            for (const doc of (aSnap as any).docs) {
                const a = doc.data() as any;
                const ts = a.timestamp;
                const when: Date | null = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
                if (!when) continue;
                const date = toStr(when);
                const before = Number(a.before?.quantity); const after = Number(a.after?.quantity);
                if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
                const delta = after - before;
                if (delta === 0) continue;
                const batch = a.entityId ? batchById.get(a.entityId) : undefined;
                if (!batch) continue;
                adjEvents.push({ id: `adj-${doc.id}`, productId: batch.productId, batchNumber: batch.batchNumber || '', date, ord: tsMs(ts), delta, after, party: a.userName || 'System' });
            }
            setAdjustEvents(adjEvents);
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }, [tenantId, dateFrom, dateTo]);

    // ── Lookups ───────────────────────────────────────────────────────────────
    const prodMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

    // Products shown in the Product-column checkbox dropdown. Narrowed by the
    // search text; with no text we list the first slice so the box is browsable.
    const productSuggestions = useMemo(() => {
        const q = productSearch.trim().toLowerCase();
        const base = q
            ? products.filter(p => (p.name || '').toLowerCase().includes(q) || (p.mfgCompany || '').toLowerCase().includes(q))
            : products;
        return [...base].sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 50);
    }, [products, productSearch]);

    const selectedProducts = useMemo(() => products.filter(p => selectedProductIds.has(p.id)), [products, selectedProductIds]);

    const batchesByProduct = useMemo(() => {
        const map = new Map<string, BatchDoc[]>();
        for (const b of batches) { if (!b.productId) continue; const arr = map.get(b.productId) ?? []; arr.push(b); map.set(b.productId, arr); }
        return map;
    }, [batches]);

    const inRange = (d: string) => !!d && d >= dateFrom && d <= dateTo;

    // In-range adjustments only — used for the detail rows + in-range net.
    const adjustRows = useMemo(() => adjustEvents.filter(a => inRange(a.date)), [adjustEvents, dateFrom, dateTo]);

    // Full ledger grouped by product — drives Opening/Remaining reconstruction.
    const movementsByProduct = useMemo(() => {
        const map = new Map<string, Movement[]>();
        for (const m of movements) { if (!m.productId) continue; const a = map.get(m.productId) ?? []; a.push(m); map.set(m.productId, a); }
        return map;
    }, [movements]);

    const adjustEventsByProduct = useMemo(() => {
        const map = new Map<string, AdjustEvent[]>();
        for (const a of adjustEvents) { if (!a.productId) continue; const arr = map.get(a.productId) ?? []; arr.push(a); map.set(a.productId, arr); }
        return map;
    }, [adjustEvents]);

    // ── Unified transactions per product ──────────────────────────────────────
    const txnsByProduct = useMemo(() => {
        const saleMovMap = new Map<string, Movement>();
        for (const m of movements) { if (m.type === 'purchase') continue; saleMovMap.set(`${m.sourceId}||${m.productId}||${m.batchNumber || ''}`, m); }
        const batchRate = new Map<string, number>();
        for (const b of batches) batchRate.set(`${b.productId}||${b.batchNumber || ''}`, b.purchaseRate ?? 0);

        const map = new Map<string, Txn[]>();
        const push = (t: Txn) => { const a = map.get(t.productId) ?? []; a.push(t); map.set(t.productId, a); };

        for (const m of movements) {
            if (m.type !== 'purchase') continue;
            if (m.date < dateFrom || m.date > dateTo) continue;   // only in-range purchases are shown as detail rows
            const rate = batchRate.get(`${m.productId}||${m.batchNumber || ''}`) || prodMap.get(m.productId)?.purchasePrice || 0;
            push({ id: `mov-${m.id}`, productId: m.productId, batchNumber: m.batchNumber || '', kind: 'purchase', channel: 'purchase', party: m.supplierName || '—', date: m.date, invoiceNumber: m.sourceNumber || (m.sourceId ? m.sourceId.slice(-8).toUpperCase() : '—'), qty: m.qtyIn || 0, value: (m.qtyIn || 0) * rate, gst: 0, remaining: m.remainingBatchQty ?? m.remainingStock ?? null, orderId: m.sourceId });
        }

        saleRows.forEach((s, i) => {
            const mv = saleMovMap.get(`${s.orderId}||${s.productId}||${s.batchNo || ''}`);
            push({ id: `sale-${s.orderId}-${s.productId}-${i}`, productId: s.productId, batchNumber: s.batchNo || '', kind: 'sale', channel: s.type === 'sale_pos' ? 'pos' : 'b2b', party: s.customerName, date: s.date, invoiceNumber: s.orderNumber || s.orderId.slice(-8).toUpperCase(), qty: s.qty, value: s.amount, gst: gstFromInclusive(s.amount, s.gstPct), remaining: mv?.remainingBatchQty ?? null, orderId: s.orderId, orderType: s.type });
        });

        for (const a of adjustRows) {
            push({ id: a.id, productId: a.productId, batchNumber: a.batchNumber, kind: 'adjustment', channel: 'adjustment', party: a.party, date: a.date, invoiceNumber: '—', qty: a.delta, value: 0, gst: 0, remaining: a.after });
        }
        for (const arr of map.values()) arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return map;
    }, [movements, saleRows, adjustRows, batches, prodMap, dateFrom, dateTo]);

    // ── Product views ─────────────────────────────────────────────────────────
    const productViews = useMemo((): ProductView[] => {
        const filtered = selectedProductIds.size > 0
            ? products.filter(p => selectedProductIds.has(p.id))
            : products;

        return filtered.map(p => {
            const pb        = batchesByProduct.get(p.id) ?? [];
            const pmoves    = movementsByProduct.get(p.id) ?? [];
            const padj      = adjustEventsByProduct.get(p.id) ?? [];
            const txns      = txnsByProduct.get(p.id) ?? [];   // in-range detail rows

            // ── Remaining Stock: authoritative LIVE inventory ───────────────────
            // Σ inventoryBatches.quantity — the exact figure Product Master shows
            // (RateSheetPage rowStock). Never a historical reconstruction. Falls
            // back to the product-level stock for pre-batch products.
            const batchQty = pb.reduce((s, b) => s + (b.quantity || 0), 0);
            const remainingStock = pb.length > 0
                ? batchQty
                : (p.loosePieces ?? 0) + (p.quantity ?? 0) * (p.boxCapacity ?? 1);

            // ── Purchase Rate: quantity-weighted inventoryBatches.purchaseRate ──
            // Values remaining stock at the rate it was actually received at. When
            // there is no live batch quantity, average the rated batches; final
            // fallback is the product-master purchase price.
            let purchaseRate: number;
            if (pb.length > 0 && batchQty > 0) {
                const totalVal = pb.reduce((s, b) => s + (b.quantity || 0) * (b.purchaseRate ?? p.purchasePrice ?? 0), 0);
                purchaseRate = totalVal / batchQty;
            } else if (pb.length > 0) {
                const rated = pb.filter(b => (b.purchaseRate ?? 0) > 0);
                purchaseRate = rated.length ? rated.reduce((s, b) => s + (b.purchaseRate || 0), 0) / rated.length : (p.purchasePrice ?? 0);
            } else {
                purchaseRate = p.purchasePrice ?? 0;
            }

            // ── Opening Stock: derived backward from live stock so the ledger
            // identity always closes against real inventory:
            //   opening = remaining − in-range purchases + in-range sales − adjust
            // Sales use the sale orders (the same source as the B2B/B2C columns).
            const purchasesQty = pmoves.filter(m => m.type === 'purchase' && inRange(m.date)).reduce((s, m) => s + (m.qtyIn || 0), 0);
            const salesQty     = saleRows.filter(s => s.productId === p.id && inRange(s.date)).reduce((s, x) => s + (x.qty || 0), 0);
            const adjustQty    = padj.filter(a => inRange(a.date)).reduce((s, a) => s + a.delta, 0);
            const openingStock = calcOpeningStock(remainingStock, purchasesQty, salesQty, adjustQty);

            return { product: p, openingStock, remainingStock, purchaseRate, txns };
        });
    }, [products, selectedProductIds, batchesByProduct, movementsByProduct, adjustEventsByProduct, txnsByProduct, saleRows, dateFrom, dateTo]);

    // ── Flatten to spreadsheet rows ───────────────────────────────────────────
    const flatRows = useMemo((): FlatRow[] => {
        const rows: FlatRow[] = [];
        for (const v of productViews) {
            // Stock Value = Remaining Stock × Purchase Rate (quantity-weighted
            // inventoryBatches.purchaseRate — see productViews).
            const stockValue = v.remainingStock * v.purchaseRate;
            const txns = [...v.txns].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            if (txns.length === 0) {
                rows.push({ key: `stock-${v.product.id}`, productId: v.product.id, productName: v.product.name, openingStock: v.openingStock, remainingStock: v.remainingStock, showStock: true, batchNumber: '', channel: 'stock', channelLabel: '—', party: '', date: '', txn: null, b2bQty: null, b2cQty: null, purchaseAmount: 0, salesAmount: 0, gst: 0, gstPct: v.product.gstPct ?? 0, stockValue });
                continue;
            }
            txns.forEach((t, i) => {
                const isSale = t.kind === 'sale';
                rows.push({ key: t.id, productId: v.product.id, productName: v.product.name, openingStock: v.openingStock, remainingStock: v.remainingStock, showStock: i === 0, batchNumber: t.batchNumber || '—', channel: t.channel, channelLabel: CHANNEL_CHIP[t.channel].label, party: t.party, date: t.date, txn: t, b2bQty: isSale && t.channel === 'b2b' ? t.qty : null, b2cQty: isSale && t.channel === 'pos' ? t.qty : null, purchaseAmount: t.kind === 'purchase' ? t.value : 0, salesAmount: isSale ? t.value : 0, gst: t.gst, gstPct: v.product.gstPct ?? 0, stockValue });
            });
        }
        return rows;
    }, [productViews]);

    // ── Column filters + sort → displayRows ───────────────────────────────────
    const displayRows = useMemo((): FlatRow[] => {
        let rows = flatRows.filter(r => {
            if (channelSel !== 'all' && r.channel !== channelSel) return false;
            if (filterBatch.trim() && !r.batchNumber.toLowerCase().includes(filterBatch.trim().toLowerCase())) return false;
            if (filterParty.trim() && !r.party.toLowerCase().includes(filterParty.trim().toLowerCase())) return false;
            if (filterDateFrom && r.date && r.date < filterDateFrom) return false;
            if (filterDateTo && r.date && r.date > filterDateTo) return false;
            if (isNumActive(fCurrentStock) && !matchNum(r.openingStock, fCurrentStock)) return false;
            if (isNumActive(fRemaining) && !matchNum(r.remainingStock, fRemaining)) return false;
            if (isNumActive(fPurchase) && !matchNum(r.purchaseAmount, fPurchase)) return false;
            if (isNumActive(fSales) && !matchNum(r.salesAmount, fSales)) return false;
            if (isNumActive(fGst) && !matchNum(r.gstPct, fGst)) return false;
            if (isNumActive(fStockValue) && !matchNum(r.stockValue, fStockValue)) return false;
            return true;
        });

        if (sortCol) {
            // Opening, Remaining, StockValue are per-product; sort keeps product rows
            // together, ordered by that product's value.
            if (sortCol === 'currentStock' || sortCol === 'remaining' || sortCol === 'stockValue') {
                const pv = new Map<string, number>();
                for (const r of rows) {
                    if (!pv.has(r.productId)) {
                        const v = sortCol === 'currentStock' ? r.openingStock : sortCol === 'remaining' ? r.remainingStock : r.stockValue;
                        pv.set(r.productId, v);
                    }
                }
                const order = new Map([...pv.entries()].sort(([, a], [, b]) => sortDir === 'asc' ? a - b : b - a).map(([pid], i) => [pid, i]));
                rows = [...rows].sort((a, b) => (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0));
            } else {
                const getVal = (r: FlatRow): number => {
                    switch (sortCol) {
                        case 'purchaseAmount': return r.purchaseAmount;
                        case 'salesAmount':    return r.salesAmount;
                        case 'gst':            return r.gstPct;
                        default:               return 0;
                    }
                };
                rows = [...rows].sort((a, b) => { const d = getVal(a) - getVal(b); return sortDir === 'asc' ? d : -d; });
            }
        }

        const seen = new Set<string>();
        return rows.map(r => { const show = !seen.has(r.productId); seen.add(r.productId); return show === r.showStock ? r : { ...r, showStock: show }; });
    }, [flatRows, sortCol, sortDir, channelSel, filterBatch, filterParty, filterDateFrom, filterDateTo, fCurrentStock, fRemaining, fPurchase, fSales, fGst, fStockValue]);

    // ── Grand-total aggregates ────────────────────────────────────────────────
    const grandTotal = useMemo(() => {
        const productIds = new Set<string>(); const batchKeys = new Set<string>(); const names = new Set<string>();
        const openingByProduct = new Map<string, number>();
        const remainingByProduct = new Map<string, number>();
        const stockValueByProduct = new Map<string, number>();
        let b2b = 0, b2c = 0, purchase = 0, sales = 0, gst = 0;
        for (const r of displayRows) {
            productIds.add(r.productId);
            openingByProduct.set(r.productId, r.openingStock);
            remainingByProduct.set(r.productId, r.remainingStock);
            stockValueByProduct.set(r.productId, r.stockValue);
            if (r.batchNumber && r.batchNumber !== '—') batchKeys.add(r.batchNumber);
            if (r.party && r.party !== '—') names.add(r.party.trim().toLowerCase());
            b2b += r.b2bQty || 0; b2c += r.b2cQty || 0;
            purchase += r.purchaseAmount; sales += r.salesAmount; gst += r.gst;
        }
        let opening = 0; for (const s of openingByProduct.values()) opening += s;
        let remaining = 0; for (const s of remainingByProduct.values()) remaining += s;
        let stockValue = 0; for (const s of stockValueByProduct.values()) stockValue += s;
        return { productCount: productIds.size, opening, batchCount: batchKeys.size, nameCount: names.size, b2b, b2c, remaining, purchase, sales, gst, stockValue };
    }, [displayRows]);

    // ── All Data export — mirrors the on-screen Stock Report table exactly ──────
    const exportRows = () => displayRows.map((r, i) => ({
        'Sr. No.': i + 1,
        'Product': r.productName,
        'Opening Stock': r.showStock ? r.openingStock : '',
        'Batch Number': r.batchNumber !== '—' ? r.batchNumber : '',
        'Channel': r.channelLabel !== '—' ? r.channelLabel : '',
        'Retailer': r.party,
        'Date': r.date ? fmtDate(r.date) : '',
        'Invoice': r.txn?.invoiceNumber !== '—' ? (r.txn?.invoiceNumber ?? '') : '',
        'B2B': r.b2bQty ?? '',
        'B2C': r.b2cQty ?? '',
        'Remaining Stock': r.showStock ? r.remainingStock : '',
        'Purchase Amount': r.purchaseAmount ? r.purchaseAmount.toFixed(2) : '',
        'Sales Amount': r.salesAmount ? r.salesAmount.toFixed(2) : '',
        'GST %': r.gstPct ? `${r.gstPct}%` : '',
        'Stock Value (₹)': r.showStock && r.stockValue ? r.stockValue.toFixed(2) : '',
    }));

    // ── Generic format writers — shared by both All Data and Product Data ────────
    type ExportRow = Record<string, string | number>;

    const exportCSV = (rows: ExportRow[], fileBase: string) => {
        const blob = new Blob(['﻿' + Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fileBase}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const exportExcel = (rows: ExportRow[], sheetName: string, fileBase: string) => {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `${fileBase}.xlsx`);
    };

    const exportPDF = (rows: ExportRow[], title: string, fileBase: string) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        doc.setFontSize(9);
        doc.text(`Data Range: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`, 14, 22);
        const head = rows.length ? [Object.keys(rows[0])] : [];
        const body = rows.map(r => Object.values(r));
        autoTable(doc, { head, body, startY: 28, styles: { fontSize: 7 }, headStyles: { fillColor: [99, 60, 180] } });
        doc.save(`${fileBase}.pdf`);
    };

    // ── Product Data export ─────────────────────────────────────────────────────
    // Product-level aggregation: one row per product (all batches/transactions
    // rolled up). Reuses the same Stock Report calculations — openingStock and
    // remainingStock come from productViews; purchases and sales are read from the
    // in-range ledger / sale rows. Default order: Remaining Stock ascending so
    // low-stock products surface at the top. This ordering is local to this export
    // and does not affect the normal All Data report.
    const productDataRows = () => {
        const rows = productViews.map(v => {
            const p = v.product;
            const purchaseRate = v.purchaseRate;   // quantity-weighted inventoryBatches.purchaseRate
            const pmoves = movementsByProduct.get(p.id) ?? [];
            const purchaseStock = pmoves
                .filter(m => m.type === 'purchase' && inRange(m.date))
                .reduce((s, m) => s + (m.qtyIn || 0), 0);
            const opening = v.openingStock;
            const totalStock = opening + purchaseStock;
            const totalStockValue = totalStock * purchaseRate;
            const productSales = saleRows.filter(s => s.productId === p.id);
            const b2bSales = productSales.filter(s => s.type === 'sale_b2b').reduce((s, x) => s + (x.qty || 0), 0);
            const b2cSales = productSales.filter(s => s.type === 'sale_pos').reduce((s, x) => s + (x.qty || 0), 0);
            const totalSales = b2bSales + b2cSales;                                   // quantity
            const totalSalesValue = productSales.reduce((s, x) => s + (x.amount || 0), 0);  // ₹ amount
            const remaining = v.remainingStock;
            const remainingStockValue = remaining * purchaseRate;
            return { name: p.name, opening, purchaseStock, totalStock, totalStockValue, b2bSales, b2cSales, totalSales, totalSalesValue, remaining, remainingStockValue };
        });
        rows.sort((a, b) => a.remaining - b.remaining);   // lowest remaining stock first
        return rows.map((r, i) => ({
            'Sr. No.': i + 1,
            'Product': r.name,
            'Opening Stock': r.opening,
            'Purchase Stock': r.purchaseStock,
            'Total Stock': r.totalStock,
            'Total Stock Value\n(Opening + Purchase)': r.totalStockValue.toFixed(2),
            'B2B Sales': r.b2bSales,
            'B2C Sales': r.b2cSales,
            'Total Sales': r.totalSales,
            'Total Sales Value': r.totalSalesValue.toFixed(2),
            'Remaining Stock': r.remaining,
            'Remaining Stock Value': r.remainingStockValue.toFixed(2),
        }));
    };

    // ── Invoice actions ───────────────────────────────────────────────────────
    const viewInvoice = (t: Txn) => { if (t.kind !== 'sale' || !t.orderId) return; if (t.orderType === 'sale_pos') navigate(`/pos?reprintOrderId=${t.orderId}`); else navigate(`/b2b-invoice?orderId=${t.orderId}`); };
    const editInvoice = (t: Txn) => { if (t.kind !== 'sale' || !t.orderId) return; navigate(t.orderType === 'sale_pos' ? `/pos?orderId=${t.orderId}` : `/b2b-invoice?orderId=${t.orderId}`); };

    // ── Cell base styles ──────────────────────────────────────────────────────
    const numHead: React.CSSProperties = { padding: '0.6rem 0.7rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' };
    const numCell: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap' };
    const txtHead: React.CSSProperties = { padding: '0.6rem 0.7rem', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top' };
    const txtCell: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'left', whiteSpace: 'nowrap' };
    const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' };

    const FREEZE_SHADOW = '3px 0 6px -2px rgba(0,0,0,0.14)';

    // Compute frozen / sticky styles for a header <th>
    const getThStyle = (colIdx: number, align: 'left' | 'right' = 'left'): React.CSSProperties => {
        const base = align === 'right' ? numHead : txtHead;
        const frozen = colIdx < freezeCount;
        const isLastFrozen = frozen && colIdx === freezeCount - 1;
        return {
            ...base,
            position: 'sticky',
            top: 0,
            zIndex: frozen ? 3 : 2,
            background: 'var(--surface-raised)',
            overflow: 'hidden',
            ...(frozen ? { left: frozenOffsets[colIdx] } : {}),
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    // Compute frozen / sticky styles for a body <td>
    const getTdStyle = (colIdx: number, align: 'left' | 'right' = 'left', rowIdx: number = 0): React.CSSProperties => {
        const base = align === 'right' ? numCell : txtCell;
        const frozen = colIdx < freezeCount;
        const isLastFrozen = frozen && colIdx === freezeCount - 1;
        if (!frozen) return { ...base, overflow: 'hidden', textOverflow: 'ellipsis' };
        return {
            ...base,
            position: 'sticky',
            left: frozenOffsets[colIdx],
            zIndex: 1,
            background: rowIdx % 2 === 0 ? 'var(--bg-color, #fff)' : 'hsl(0,0%,98.5%)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    // Grand-total row <td> — sticky on left for frozen cols (the row's <tr> handles top)
    const getGTdStyle = (colIdx: number, align: 'left' | 'right' = 'left'): React.CSSProperties => {
        const base = align === 'right' ? numCell : txtCell;
        const frozen = colIdx < freezeCount;
        const isLastFrozen = frozen && colIdx === freezeCount - 1;
        return {
            ...base,
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...(frozen ? { position: 'sticky', left: frozenOffsets[colIdx], zIndex: 3, background: 'var(--surface-raised)' } : {}),
            ...(isLastFrozen ? { boxShadow: FREEZE_SHADOW } : {}),
        };
    };

    // Drag handle rendered at the right edge of each <th>
    const resizeHandle = (key: ColKey) => (
        <div
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize', zIndex: 4, userSelect: 'none' }}
            onMouseDown={e => handleResizeStart(e, key)}
        />
    );

    const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.2rem', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' };

    const ctxItemStyle: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--text-primary)', font: 'inherit' };

    // ── Sort + filter header helpers ──────────────────────────────────────────
    const SortIndicator = ({ col }: { col: SortCol }) => {
        if (sortCol !== col) return <ChevronUp size={10} style={{ opacity: 0.25, marginLeft: '0.2rem', flexShrink: 0 }} />;
        return sortDir === 'asc'
            ? <ChevronUp   size={11} style={{ marginLeft: '0.2rem', color: 'var(--primary)', flexShrink: 0 }} />
            : <ChevronDown size={11} style={{ marginLeft: '0.2rem', color: 'var(--primary)', flexShrink: 0 }} />;
    };

    const FilterBtn = ({ col }: { col: FilterCol }) => {
        const active = isFilterActive(col);
        return (
            <button
                onMouseDown={e => { e.preventDefault(); openFilter(col, e.currentTarget); }}
                style={{ background: active ? 'hsla(263,70%,60%,0.15)' : 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem', borderRadius: '4px', color: active ? 'var(--primary)' : 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', flexShrink: 0, opacity: active ? 1 : 0.5 }}
                title={active ? 'Filter active — click to edit' : 'Add filter'}
            >
                <Filter size={9} />
            </button>
        );
    };

    // ── Inline header filter controls ─────────────────────────────────────────
    // Rendered as plain functions (not components) so the inputs keep focus while
    // typing — a nested component would remount on every parent render.
    const hdrColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 };

    const inlineTextFilter = (value: string, onChange: (v: string) => void, placeholder: string) => (
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

    // Unified filter control: [ = ▼ | Value ] — one outer border, subtle inner divider.
    const inlineNumFilter = (state: NumFilter, setState: (f: NumFilter) => void) => (
        <div style={{ display: 'flex', alignItems: 'stretch', fontWeight: 400, border: '1px solid var(--surface-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface-base)' }} onClick={e => e.stopPropagation()}>
            <select value={state.op} onChange={e => setState({ ...state, op: e.target.value as NumOp })}
                title="Comparison"
                style={{ margin: 0, width: '3rem', minWidth: '3rem', padding: '0.25rem 0.15rem', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', cursor: 'pointer', border: 'none', borderRight: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', flexShrink: 0 }}>
                {NUM_OPS.map(o => <option key={o.key} value={o.key} title={o.title}>{o.label}</option>)}
            </select>
            <input type="number" value={state.value} onChange={e => setState({ ...state, value: e.target.value })}
                placeholder="Value"
                style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400, textAlign: 'right', border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none' }} />
        </div>
    );

    // stockCell — receives colIdx + rowIdx for frozen styles + stockTone overlay
    const stockCell = (value: number | null, colIdx: number, rowIdx: number = 0, show = true, cellKey?: string) => {
        const base = getTdStyle(colIdx, 'right', rowIdx);
        if (!show) return <td key={cellKey} style={base} />;
        const s = stockTone(value);
        return (
            <td key={cellKey} style={{ ...base, ...s.td }}>
                {value == null
                    ? <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    : <span style={{ fontWeight: 700, color: s.text }}>{fmtNum(value)}{s.neg && <span style={NEG_BADGE}>NEG</span>}</span>}
            </td>
        );
    };

    // ── Date-range filter panel (still a popover — opened from the Date header) ─
    const DateFilterPanel = () => (
        <div style={{ minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>Date Range</span>
                {(filterDateFrom || filterDateTo) && <button onClick={() => clearFilter('date')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-tertiary)', padding: 0 }}>Clear</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div>
                    <label style={{ ...labelStyle, marginBottom: '0.2rem' }}>From</label>
                    <input autoFocus type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ width: '100%', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                </div>
                <div>
                    <label style={{ ...labelStyle, marginBottom: '0.2rem' }}>To</label>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ width: '100%', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                </div>
            </div>
        </div>
    );

    const renderFilterContent = () => {
        return filterOpen === 'date' ? <DateFilterPanel /> : null;
    };

    // ── Dynamic column renderers (drive colOrder-based layout) ────────────────

    const renderHeaderTh = (key: ColKey, colIdx: number) => {
        const isDragOver = dragOverKey === key && dragFromKey !== key;
        const isNarrow = ['b2bQty','b2cQty','gst','sr'].includes(key);
        const align: 'left'|'right' = ['sr','currentStock','b2bQty','b2cQty','remaining','purchaseAmount','salesAmount','gst','stockValue'].includes(key) ? 'right' : 'left';
        const needsWrap = key === 'product' || key === 'channel';
        const thStyle: React.CSSProperties = {
            ...getThStyle(colIdx, align),
            ...(needsWrap ? { whiteSpace: 'normal', verticalAlign: 'top' } : {}),
            ...(!isNarrow && !['sr','invoice','date','batchNumber','party'].includes(key) ? { cursor: 'default' } : {}),
            ...(isDragOver ? { borderLeft: '3px solid var(--primary)' } : {}),
            position: 'sticky' as const, // preserve sticky
        };
        const dragProps = {
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
        };

        let inner: React.ReactNode;
        switch (key) {
            case 'sr': inner = 'Sr. No.'; break;
            case 'product': inner = (
                <div style={hdrColStyle}>
                    <span>Product</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', fontWeight: 400 }} onClick={e => e.stopPropagation()}>
                        <Search size={11} style={{ position: 'absolute', left: '0.4rem', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                        <input ref={productInputRef} value={productSearch}
                            onChange={e => { setProductSearch(e.target.value); openProductDropdown(); }}
                            onFocus={openProductDropdown} placeholder="Search product…" className="input-field"
                            style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 1.4rem 0.25rem 1.5rem', fontSize: '0.75rem', fontWeight: 400 }} />
                        {productSearch && (
                            <button onClick={() => setProductSearch('')} title="Clear search"
                                style={{ position: 'absolute', right: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 0 }}>
                                <X size={11} />
                            </button>
                        )}
                    </div>
                    {selectedProducts.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', fontWeight: 400 }}>
                            {selectedProducts.map(p => (
                                <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'hsla(263,70%,60%,0.14)', color: 'var(--primary)', borderRadius: '999px', padding: '0.08rem 0.45rem', fontSize: '0.68rem', fontWeight: 600, maxWidth: '100%' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '9rem' }}>{p.name}</span>
                                    <button onClick={() => toggleProduct(p.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}><X size={9} /></button>
                                </span>
                            ))}
                            <button onClick={() => setSelectedProductIds(new Set())} title="Clear all" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.66rem', textDecoration: 'underline' }}>clear</button>
                        </div>
                    )}
                </div>
            ); break;
            case 'currentStock': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('currentStock')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }} title="Stock at the start of the data range">
                        Opening Stock <SortIndicator col="currentStock" />
                    </span>
                    {inlineNumFilter(fCurrentStock, setFCurrentStock)}
                </div>
            ); break;
            case 'batchNumber': inner = (
                <div style={hdrColStyle}>
                    <span>Batch Number</span>
                    {inlineTextFilter(filterBatch, setFilterBatch, 'Search…')}
                </div>
            ); break;
            case 'channel': inner = (
                <div style={hdrColStyle}>
                    <span>Channel</span>
                    <select value={channelSel} onChange={e => setChannelSel(e.target.value as ChannelSel)}
                        className="input-field" style={{ margin: 0, width: '100%', minWidth: 0, padding: '0.25rem 0.4rem', fontSize: '0.75rem', fontWeight: 400 }}>
                        {CHANNEL_SEL_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                </div>
            ); break;
            case 'party': inner = (
                <div style={hdrColStyle}>
                    <span>Retailer</span>
                    {inlineTextFilter(filterParty, setFilterParty, 'Search…')}
                </div>
            ); break;
            case 'date': inner = (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    Date <FilterBtn col="date" />
                </div>
            ); break;
            case 'invoice': inner = 'Invoice'; break;
            case 'b2bQty': inner = 'B2B'; break;
            case 'b2cQty': inner = 'B2C'; break;
            case 'remaining': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('remaining')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }} title="Opening + purchases − sales ± adjustments">
                        Remaining Stock <SortIndicator col="remaining" />
                    </span>
                    {inlineNumFilter(fRemaining, setFRemaining)}
                </div>
            ); break;
            case 'purchaseAmount': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('purchaseAmount')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }}>
                        Purchase Amount <SortIndicator col="purchaseAmount" />
                    </span>
                    {inlineNumFilter(fPurchase, setFPurchase)}
                </div>
            ); break;
            case 'salesAmount': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('salesAmount')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }}>
                        Sales Amount <SortIndicator col="salesAmount" />
                    </span>
                    {inlineNumFilter(fSales, setFSales)}
                </div>
            ); break;
            case 'gst': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('gst')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }}>
                        GST % <SortIndicator col="gst" />
                    </span>
                    {inlineNumFilter(fGst, setFGst)}
                </div>
            ); break;
            case 'stockValue': inner = (
                <div style={hdrColStyle}>
                    <span onClick={() => toggleSort('stockValue')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', userSelect: 'none' }} title="Remaining Stock × Purchase Rate">
                        Stock Value <SortIndicator col="stockValue" />
                    </span>
                    {inlineNumFilter(fStockValue, setFStockValue)}
                </div>
            ); break;
            default: inner = key;
        }
        return (
            <th key={key} style={thStyle} {...dragProps}>
                {inner}
                {resizeHandle(key)}
            </th>
        );
    };

    const renderBodyTd = (key: ColKey, colIdx: number, r: FlatRow, rowIdx: number): React.ReactNode => {
        const t = r.txn;
        const isSale = t?.kind === 'sale' && !!t.orderId;
        const chip = r.channel !== 'stock' ? CHANNEL_CHIP[r.channel as TxnChannel] : null;
        switch (key) {
            case 'sr':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: 'var(--text-tertiary)' }}>{rowIdx + 1}</td>;
            case 'product':
                // Wrap long product names within the (resizable) column width instead of truncating.
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), fontWeight: r.showStock ? 700 : 400, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-word' }}>{r.showStock ? r.productName : ''}</td>;
            case 'currentStock':
                return stockCell(r.openingStock, colIdx, rowIdx, r.showStock, key);
            case 'batchNumber':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.batchNumber || '—'}</td>;
            case 'channel':
                return (
                    <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)}>
                        {chip ? <span style={{ fontSize: '0.66rem', padding: '0.12rem 0.5rem', borderRadius: '999px', fontWeight: 700, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>{r.channelLabel}</span>
                            : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                );
            case 'party':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), color: 'var(--text-secondary)' }}>{r.party || '—'}</td>;
            case 'date':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'left', rowIdx), color: 'var(--text-secondary)' }}>{r.date ? fmtDate(r.date) : '—'}</td>;
            case 'invoice':
                return (
                    <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)}>
                        {isSale ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <button onClick={() => viewInvoice(t!)} title="Open invoice" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary-light)' }}>
                                    {t!.invoiceNumber}<Eye size={12} style={{ opacity: 0.8 }} />
                                </button>
                                <button onClick={() => viewInvoice(t!)} title="Download / print" style={iconBtn}><Download size={12} /></button>
                                <button onClick={() => editInvoice(t!)} title="Edit invoice" style={iconBtn}><Pencil size={12} /></button>
                            </span>
                        ) : t && t.invoiceNumber !== '—'
                            ? <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{t.invoiceNumber}</span>
                            : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                );
            case 'b2bQty':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.b2bQty ? '#8b5cf6' : 'var(--text-tertiary)', fontWeight: r.b2bQty ? 700 : 400 }}>{r.b2bQty != null ? fmtNum(r.b2bQty) : '—'}</td>;
            case 'b2cQty':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.b2cQty ? '#3b82f6' : 'var(--text-tertiary)', fontWeight: r.b2cQty ? 700 : 400 }}>{r.b2cQty != null ? fmtNum(r.b2cQty) : '—'}</td>;
            case 'remaining':
                return stockCell(r.remainingStock, colIdx, rowIdx, r.showStock, key);
            case 'purchaseAmount':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.purchaseAmount ? '#10b981' : 'var(--text-tertiary)' }}>{r.purchaseAmount ? fmtInr(r.purchaseAmount) : '—'}</td>;
            case 'salesAmount':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.salesAmount ? '#f59e0b' : 'var(--text-tertiary)' }}>{r.salesAmount ? fmtInr(r.salesAmount) : '—'}</td>;
            case 'gst':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: 'var(--text-secondary)' }}>{r.gstPct ? `${r.gstPct}%` : '—'}</td>;
            case 'stockValue':
                return <td key={key} style={{ ...getTdStyle(colIdx, 'right', rowIdx), color: r.showStock && r.stockValue > 0 ? 'var(--primary-light)' : 'var(--text-tertiary)', fontWeight: r.showStock && r.stockValue > 0 ? 700 : 400 }}>{r.showStock ? (r.stockValue > 0 ? fmtInr(r.stockValue) : '—') : ''}</td>;
            default: return <td key={key} style={getTdStyle(colIdx, 'left', rowIdx)} />;
        }
    };

    const renderGrandTd = (key: ColKey, colIdx: number): React.ReactNode => {
        switch (key) {
            case 'sr':            return <td key={key} style={getGTdStyle(colIdx, 'right')}>Total</td>;
            case 'product':       return <td key={key} style={getGTdStyle(colIdx, 'left')}>{fmtNum(grandTotal.productCount)} product{grandTotal.productCount === 1 ? '' : 's'}</td>;
            case 'currentStock':  return <td key={key} style={getGTdStyle(colIdx, 'right')}>{fmtNum(grandTotal.opening)}</td>;
            case 'batchNumber':   return <td key={key} style={getGTdStyle(colIdx, 'left')}>{fmtNum(grandTotal.batchCount)} batch{grandTotal.batchCount === 1 ? '' : 'es'}</td>;
            case 'channel':       return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'party':         return <td key={key} style={getGTdStyle(colIdx, 'left')}>{fmtNum(grandTotal.nameCount)} name{grandTotal.nameCount === 1 ? '' : 's'}</td>;
            case 'date':          return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'invoice':       return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
            case 'b2bQty':        return <td key={key} style={getGTdStyle(colIdx, 'right')}>{grandTotal.b2b ? fmtNum(grandTotal.b2b) : '—'}</td>;
            case 'b2cQty':        return <td key={key} style={getGTdStyle(colIdx, 'right')}>{grandTotal.b2c ? fmtNum(grandTotal.b2c) : '—'}</td>;
            case 'remaining':     return <td key={key} style={getGTdStyle(colIdx, 'right')}>{fmtNum(grandTotal.remaining)}</td>;
            case 'purchaseAmount':return <td key={key} style={{ ...getGTdStyle(colIdx, 'right'), color: '#10b981' }}>{fmtInr(grandTotal.purchase)}</td>;
            case 'salesAmount':   return <td key={key} style={{ ...getGTdStyle(colIdx, 'right'), color: '#f59e0b' }}>{fmtInr(grandTotal.sales)}</td>;
            case 'gst':           return <td key={key} style={getGTdStyle(colIdx, 'right')}>—</td>;
            case 'stockValue':    return <td key={key} style={{ ...getGTdStyle(colIdx, 'right'), color: 'var(--primary-light)' }}>{fmtInr(grandTotal.stockValue)}</td>;
            default:              return <td key={key} style={getGTdStyle(colIdx, 'left')} />;
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ width: '100%' }}>

            {/* Full-screen capture div during column resize — prevents cursor flicker and text selection */}
            {isResizing && <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />}

            {/* Filter popover */}
            {filterOpen && filterPopoverPos && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }} onMouseDown={() => setFilterOpen(null)} />
                    <div style={{ position: 'fixed', top: filterPopoverPos.top, left: Math.min(filterPopoverPos.left, window.innerWidth - 220), zIndex: 4001, background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '0.85rem 1rem', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }} onMouseDown={e => e.stopPropagation()}>
                        {renderFilterContent()}
                    </div>
                </>
            )}

            {/* Product multi-select dropdown (anchored to the Product-column search) */}
            {showProductDropdown && productDropdownPos && (
                <div ref={productDropdownRef}
                    style={{ position: 'fixed', top: productDropdownPos.top, left: Math.min(productDropdownPos.left, window.innerWidth - productDropdownPos.width - 8), width: productDropdownPos.width, maxHeight: '340px', overflowY: 'auto', zIndex: 4101, background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.22)', padding: '0.35rem' }}>
                    {productSuggestions.length === 0 ? (
                        <div style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>No products found.</div>
                    ) : productSuggestions.map(p => {
                        const checked = selectedProductIds.has(p.id);
                        return (
                            <button key={p.id} onClick={() => toggleProduct(p.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', padding: '0.45rem 0.55rem', background: checked ? 'hsla(263,70%,60%,0.10)' : 'none', border: 'none', borderRadius: '8px', cursor: 'pointer', font: 'inherit' }}>
                                <input type="checkbox" readOnly checked={checked} style={{ pointerEvents: 'none', flexShrink: 0 }} />
                                <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                    {(p.mfgCompany || p.type) && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{[p.mfgCompany, p.type].filter(Boolean).join(' · ')}</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Right-click column context menu */}
            {ctxMenu && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }} onMouseDown={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
                    <div
                        role="menu"
                        style={{
                            position: 'fixed',
                            top: Math.min(ctxMenu.y, window.innerHeight - 130),
                            left: Math.min(ctxMenu.x, window.innerWidth - 230),
                            zIndex: 5001,
                            minWidth: '210px',
                            background: 'var(--surface-raised)',
                            border: '1px solid var(--surface-border)',
                            borderRadius: '10px',
                            padding: '0.35rem',
                            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '0.25rem 0.6rem 0.4rem', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--surface-border)', marginBottom: '0.25rem' }}>
                            {COL_LABELS[colOrder[ctxMenu.colIdx]]}
                        </div>
                        <button onClick={() => freezeUpTo(ctxMenu.colIdx)} style={ctxItemStyle}>
                            Freeze this column
                        </button>
                        {freezeCount > 0 && (
                            <button onClick={unfreezeAll} style={ctxItemStyle}>
                                Unfreeze columns
                            </button>
                        )}
                        <button onClick={resetColumnWidths} style={ctxItemStyle}>
                            Reset all column widths
                        </button>
                        <button onClick={resetColOrder} style={ctxItemStyle}>
                            Reset column order
                        </button>
                    </div>
                </>
            )}

            {/* Page header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.15rem' }}>
                        <Package2 size={26} /> Stock Report
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Opening &amp; remaining stock, batches, channel and invoices across the selected data range.
                    </p>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                        Data range: {fmtDate(dateFrom)} – {fmtDate(dateTo)}
                    </p>
                </div>
                {/* Header controls — Data Range lives here (beside Export), not in a
                    separate filter bar. Data Range still drives the Firestore query. */}
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {hasAnyColumnFilter && (
                        <button
                            onClick={() => { setChannelSel('all'); setFilterBatch(''); setFilterParty(''); setFilterDateFrom(''); setFilterDateTo(''); setFCurrentStock({ op: 'eq', value: '' }); setFRemaining({ op: 'eq', value: '' }); setFPurchase({ op: 'eq', value: '' }); setFSales({ op: 'eq', value: '' }); setFGst({ op: 'eq', value: '' }); setFStockValue({ op: 'eq', value: '' }); }}
                            className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--primary)' }}>
                            <X size={13} /> Clear Filters
                        </button>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                            <Calendar size={14} style={{ position: 'absolute', left: '0.5rem', color: 'var(--text-tertiary)', pointerEvents: 'none', zIndex: 1 }} />
                            <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="input-field" style={{ margin: 0, minWidth: '160px', paddingLeft: '1.8rem' }} title="Data Range">
                                {PERIODS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                            </select>
                        </div>
                        {period === 'custom' && (
                            <>
                                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>to</span>
                                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.82rem', background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                            </>
                        )}
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowExportMenu(p => !p)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <Download size={15} /> Export <ChevronDown size={13} />
                        </button>
                        {showExportMenu && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 4990 }} onClick={() => setShowExportMenu(false)} />
                                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 4991, background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '0.55rem', width: '280px', boxShadow: '0 12px 34px rgba(0,0,0,0.28)' }}>
                                    {([
                                        { section: 'All Data',     rows: exportRows,      sheet: 'Stock Report', title: 'Stock Report',                 fileBase: `stock_report_${dateFrom}_${dateTo}` },
                                        { section: 'Product Data', rows: productDataRows,  sheet: 'Product Data', title: 'Stock Report — Product Data', fileBase: `stock_report_product_data_${dateFrom}_${dateTo}` },
                                    ] as const).map((group, gi) => (
                                        <div key={group.section} style={{ marginTop: gi > 0 ? '0.5rem' : 0, paddingTop: gi > 0 ? '0.5rem' : 0, borderTop: gi > 0 ? '1px solid var(--surface-border)' : 'none' }}>
                                            <div style={{ padding: '0 0.15rem 0.35rem', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.section}</div>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {([
                                                    { label: 'PDF',   Icon: FileText,        run: () => exportPDF(group.rows(), group.title, group.fileBase) },
                                                    { label: 'Excel', Icon: FileSpreadsheet, run: () => exportExcel(group.rows(), group.sheet, group.fileBase) },
                                                    { label: 'CSV',   Icon: FileType,        run: () => exportCSV(group.rows(), group.fileBase) },
                                                ] as const).map(item => (
                                                    <button key={item.label}
                                                        onClick={() => { item.run(); setShowExportMenu(false); }}
                                                        title={`Export ${group.section} as ${item.label}`}
                                                        style={{ flex: '1 1 4.5rem', minWidth: '4.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', cursor: 'pointer', padding: '0.5rem 0.4rem', borderRadius: '9px', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', font: 'inherit' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'hsla(263,70%,60%,0.12)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-base)'; e.currentTarget.style.borderColor = 'var(--surface-border)'; }}>
                                                        <item.Icon size={16} />
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Table hint bar */}
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '0.75rem', padding: '0.4rem 1rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                <span>Drag column headers to reorder.</span>
                <span>Drag column edges to resize.</span>
                <span>Right-click a header to freeze or reset.</span>
                {freezeCount > 0 && (
                    <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 600 }}>
                        Frozen up to “{COL_LABELS[colOrder[freezeCount - 1]]}”
                    </span>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" size={28} style={{ margin: '0 auto' }} /></div>
            ) : (
                <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }} onContextMenu={handleTableContextMenu}>
                        <table style={{ width: totalTableWidth, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.82rem' }}>

                            {/* Column widths — direct refs allow drag to bypass React */}
                            <colgroup>
                                {colOrder.map(key => (
                                    <col key={key}
                                        ref={el => { if (el) colElRefs.current[key] = el; else delete colElRefs.current[key]; }}
                                        style={{ width: colWidths[key] }}
                                    />
                                ))}
                            </colgroup>

                            <thead>
                                <tr ref={headerRowRef} style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                                    {colOrder.map((key, colIdx) => renderHeaderTh(key, colIdx))}
                                </tr>
                                <tr style={{ position: 'sticky', top: headerH, zIndex: 2, background: 'var(--surface-raised)', fontWeight: 800, borderBottom: '2px solid var(--surface-border)' } as React.CSSProperties}>
                                    {colOrder.map((key, colIdx) => renderGrandTd(key, colIdx))}
                                </tr>
                            </thead>

                            <tbody>
                                {displayRows.length === 0 ? (
                                    <tr><td colSpan={colOrder.length} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No stock or transactions found for this filter.</td></tr>
                                ) : displayRows.map((r, i) => {
                                    const groupStart = r.showStock && i > 0;
                                    return (
                                        <tr key={r.key} style={{ borderBottom: '1px solid var(--surface-border)', borderTop: groupStart ? '2px solid var(--surface-border)' : undefined, background: i % 2 === 0 ? 'transparent' : 'hsla(0,0%,50%,0.03)' }}>
                                            {colOrder.map((key, colIdx) => renderBodyTd(key, colIdx, r, i))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
