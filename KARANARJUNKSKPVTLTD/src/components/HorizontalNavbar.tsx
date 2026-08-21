import { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, BarChart3, Layers, ReceiptText, Activity, FileText, ClipboardList,
  Package, Calculator, BookOpen, Target, Receipt, ChevronLeft,
  ChevronRight, HelpCircle, Users, Settings,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AppScreen } from '../contexts/AuthContext';

type NavItem = { path: string; label: string; icon: React.ReactNode; screenKey: AppScreen; exact?: boolean };

// ── Main business nav ─────────────────────────────────────────────────────────
const PRIORITY_NAV: NavItem[] = [
  { path: '/reports',         label: 'Reports',           icon: <FileText size={15} />,      screenKey: 'analytics' },
  { path: '/dashboard',       label: 'B2B Dashboard',   icon: <Home size={15} />,          screenKey: 'dashboard' },
  { path: '/b2c-dashboard',   label: 'B2C Dashboard',   icon: <BarChart3 size={15} />,     screenKey: 'b2c_dashboard' },
  { path: '/analytics',       label: 'Analytics',        icon: <Layers size={15} />,        screenKey: 'analytics' },
  { path: '/worklist',        label: 'Worklist',          icon: <ReceiptText size={15} />,   screenKey: 'worklist' },
  { path: '/pos',             label: 'POS Billing',       icon: <Calculator size={15} />,    screenKey: 'pos' },
  { path: '/customers',       label: 'Customers',         icon: <Users size={15} />,         screenKey: 'customers' },
  { path: '/admin',           label: 'Admin',             icon: <Settings size={15} />,      screenKey: 'admin' },
  { path: '/digital-khata',   label: 'Khata (Udhari)',   icon: <BookOpen size={15} />,      screenKey: 'khata' },
  { path: '/supplier-ledger', label: 'Supplier Ledger',  icon: <ClipboardList size={15} />, screenKey: 'worklist' },
  { path: '/inventory',       label: 'Inventory',         icon: <Package size={15} />,       screenKey: 'inventory' },
  { path: '/b2b-invoice',     label: 'B2B GST Invoice',  icon: <ReceiptText size={15} />,   screenKey: 'worklist' },
  { path: '/sales-targets',   label: 'Sales Targets',    icon: <Target size={15} />,        screenKey: 'worklist' },
  { path: '/expenses',        label: 'Expenses',          icon: <Receipt size={15} />,       screenKey: 'expenses' },
  { path: '/order-history',   label: 'Order History',    icon: <ClipboardList size={15} />, screenKey: 'order_history' },
  { path: '/barcode',         label: 'Barcode Labels',   icon: <Activity size={15} />,      screenKey: 'inventory' },
  { path: '/help',            label: 'Help Center',       icon: <HelpCircle size={15} />,    screenKey: 'settings' },
];

// Admin sub-tabs are no longer separate routes — they render in-page at
// /admin#<tab> (see AdminHubPage). The navbar keeps a single "Admin" entry.

const SALES_NAV_PATHS = ['/sales-targets', '/worklist', '/help'];
// Analyst sees exactly these five items in the horizontal nav — nothing more
const ANALYST_NAV_PATHS = ['/reports', '/worklist', '/pos', '/supplier-ledger', '/inventory'];
const SCROLL_STEP = 220;

export default function HorizontalNavbar() {
  const location = useLocation();
  const { userRole, permissions } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const isOwner = userRole === 'admin' || userRole === 'analyst';
  const isSalesUser = userRole === 'sales';

  const visibleItems = (isOwner || isSalesUser) ? PRIORITY_NAV.filter(item => {
    if (!userRole || !permissions) return false;
    if (isSalesUser) return SALES_NAV_PATHS.includes(item.path);
    if (userRole === 'analyst') return ANALYST_NAV_PATHS.includes(item.path);
    if (item.path === '/sales-targets') return false;
    if (permissions[userRole] && !permissions[userRole][item.screenKey]) return false;
    return true;
  }) : [];

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, visibleItems.length]);

  if (!isOwner && !isSalesUser) return null;
  if (visibleItems.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? SCROLL_STEP : -SCROLL_STEP, behavior: 'smooth' });
  };

  const arrowBtn = (dir: 'left' | 'right', enabled: boolean) => (
    <button
      aria-label={dir === 'left' ? 'Scroll left' : 'Scroll right'}
      onClick={() => scroll(dir)}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '100%',
        minHeight: '38px',
        background: 'none',
        border: 'none',
        cursor: enabled ? 'pointer' : 'default',
        color: enabled ? 'var(--text-secondary)' : 'transparent',
        pointerEvents: enabled ? 'auto' : 'none',
        transition: 'color 0.15s',
        padding: 0,
        zIndex: 1,
      }}
      onMouseEnter={e => { if (enabled) e.currentTarget.style.color = 'var(--primary-light)'; }}
      onMouseLeave={e => { if (enabled) e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {dir === 'left' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );

  return (
    <nav
      aria-label="Priority navigation"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        background: 'var(--surface-base)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--surface-border)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
        flexShrink: 0,
      }}
    >
      {/* Left arrow */}
      {arrowBtn('left', canScrollLeft)}

      {/* Scrollable link strip */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '0.125rem',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '0 0.25rem',
        }}
      >
        {visibleItems.map(item => {
          const active = item.exact
            ? location.pathname === item.path
            : location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.625rem 0.875rem',
                color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
                textDecoration: 'none',
                fontSize: '0.84rem',
                fontWeight: active ? 600 : 400,
                borderBottom: `2px solid ${active ? 'var(--primary-light)' : 'transparent'}`,
                whiteSpace: 'nowrap',
                transition: 'color var(--transition-fast), border-color var(--transition-fast)',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-tertiary)'; }}
            >
              <span style={{ opacity: active ? 1 : 0.7, display: 'flex' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Right arrow */}
      {arrowBtn('right', canScrollRight)}
    </nav>
  );
}
