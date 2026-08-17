import { Package, Layers, Truck, History } from 'lucide-react';
import { useHashTab } from '../hooks/useHashTab';

// Import sub-pages directly (InventoryPage itself is lazy-loaded by App.tsx)
import RateSheetPage from './RateSheetPage';
import WarehousePage from './WarehousePage';
import InventoryBatchPage from './InventoryBatchPage';
import ManageTransportPage from './ManageTransportPage';
import StockMovementPage from './StockMovementPage';
import ManufacturersPage from './ManufacturersPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type InventoryTab = 'products' | 'batches' | 'stock-movement' | 'warehouses' | 'transport' | 'manufacturers';
const VALID_TABS: readonly InventoryTab[] = ['products', 'batches', 'stock-movement', 'warehouses', 'transport', 'manufacturers'];

// Warehouses and Manufacturers are intentionally omitted here — unused in the
// active inventory workflow. Their routes/components/data remain untouched;
// this list only controls what's shown in the tab bar.
const INVENTORY_TABS: { id: InventoryTab; label: string; icon: React.ReactNode }[] = [
    { id: 'products',       label: 'Product Master',    icon: <Package size={16} /> },
    { id: 'batches',        label: 'Inventory Batches', icon: <Layers size={16} /> },
    { id: 'stock-movement', label: 'Stock Movement',    icon: <History size={16} /> },
    { id: 'transport',      label: 'Transport',         icon: <Truck size={16} /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryPage() {
    const [activeTab, setActiveTab] = useHashTab<InventoryTab>(VALID_TABS, 'products', 'fiinny-tab-inventory');

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* ── Sticky Tab Bar ── */}
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                    background: 'var(--surface-base)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex',
                    gap: '0.25rem',
                    borderBottom: '2px solid var(--surface-border)',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    marginLeft: '-2rem',
                    marginRight: '-2rem',
                    paddingLeft: '2rem',
                    paddingRight: '2rem',
                    marginTop: '-2rem',
                    paddingTop: '0.75rem',
                    marginBottom: '1.75rem',
                }}
            >
                {INVENTORY_TABS.map(tab => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: active
                                    ? '2px solid var(--primary-light)'
                                    : '2px solid transparent',
                                marginBottom: '-2px',
                                color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                fontWeight: active ? 700 : 400,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                transition: 'color 0.15s ease, border-color 0.15s ease',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => {
                                if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={e => {
                                if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
                            }}
                        >
                            <span style={{ opacity: active ? 1 : 0.6, display: 'flex' }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content ── */}
            {activeTab === 'products'       && <RateSheetPage />}
            {activeTab === 'batches'        && <InventoryBatchPage />}
            {activeTab === 'stock-movement' && <StockMovementPage />}
            {activeTab === 'warehouses'     && <WarehousePage />}
            {activeTab === 'transport'      && <ManageTransportPage />}
            {activeTab === 'manufacturers'  && <ManufacturersPage />}
        </div>
    );
}
