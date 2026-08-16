import { FileText, BarChart3, Package2 } from 'lucide-react';
import { useHashTab } from '../hooks/useHashTab';
import FinancialReportsPage from './FinancialReportsPage';
import GSTReportsPage from './GSTReportsPage';
import StockReportPage from './StockReportPage';

type ReportTab = 'financial' | 'gst' | 'stock';
const VALID_TABS: readonly ReportTab[] = ['financial', 'gst', 'stock'];

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'stock',     label: 'Stock Report',      icon: <Package2 size={16} /> },
    { id: 'financial', label: 'Financial Report', icon: <BarChart3 size={16} /> },
    { id: 'gst',       label: 'GST Report',       icon: <FileText size={16} /> },
];

export default function ReportsPage() {
    const [active, setActive] = useHashTab<ReportTab>(VALID_TABS, 'stock', 'fiinny-tab-reports');

    return (
        <div className="animate-fade-in" style={{ width: '100%' }}>

            {/* Sticky Tab Bar */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'var(--surface-base)',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                display: 'flex', gap: '0.25rem',
                borderBottom: '2px solid var(--surface-border)',
                overflowX: 'auto', scrollbarWidth: 'none',
                marginLeft: '-2rem', marginRight: '-2rem',
                paddingLeft: '2rem', paddingRight: '2rem',
                marginTop: '-2rem', paddingTop: '0.75rem',
                marginBottom: '1.75rem',
            }}>
                {TABS.map(tab => {
                    const isActive = active === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActive(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                background: 'transparent', border: 'none',
                                borderBottom: isActive ? '2px solid var(--primary-light)' : '2px solid transparent',
                                marginBottom: '-2px',
                                color: isActive ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                fontWeight: isActive ? 700 : 400,
                                fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                transition: 'color 0.15s ease, border-color 0.15s ease',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
                        >
                            <span style={{ opacity: isActive ? 1 : 0.6, display: 'flex' }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {active === 'financial' && <FinancialReportsPage />}
            {active === 'gst'       && <GSTReportsPage />}
            {active === 'stock'     && <StockReportPage />}
        </div>
    );
}
