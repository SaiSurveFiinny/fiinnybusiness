import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icons } from './Icons';
import { useRef, useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Language } from '../translations';
import { BRAND_NAME, NAV_ITEMS, type NavItem } from '../config/navigation';

function LanguageSwitcher() {
  const { language, setLanguage, languageNames } = useLanguage();
  const [open, setOpen] = useState(false);

  const options = Object.entries(languageNames) as [Language, string][];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-on-surface text-xs font-sans font-bold hover:bg-slate-200 transition-colors"
        title="Change language"
      >
        <Icons.Globe className="w-3.5 h-3.5" />
        <span>{languageNames[language]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col py-1 z-50 min-w-[130px]">
          {options.map(([code, name]) => (
            <button
              key={code}
              onMouseDown={() => { setLanguage(code); setOpen(false); }}
              className={`px-4 py-2.5 text-left font-sans text-sm transition-colors ${
                language === code
                  ? 'bg-primary/5 text-primary font-bold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.children) return item.children.some((child) => pathname === child.href);
  return pathname === item.href;
}

/** Small delay before closing on mouse-out, so the cursor can travel from the trigger into the panel without it disappearing. */
const DROPDOWN_CLOSE_DELAY_MS = 150;

/**
 * Desktop top-level nav link. Plain items render as a `<Link>`; items with
 * `children` render as a hover-activated dropdown — opens on mouse enter,
 * stays open while the cursor is over the trigger or the panel, and closes
 * shortly after the cursor leaves both (enterprise nav convention: no click
 * required on desktop). The floating panel is positioned relative to the
 * trigger itself and the nav row has no overflow clipping, so the panel is
 * never cut off.
 */
function DesktopNavItem({ item }: { item: NavItem }) {
  const location = useLocation();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = isItemActive(item, location.pathname);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), DROPDOWN_CLOSE_DELAY_MS);
  };

  if (item.children) {
    return (
      <div
        className="relative"
        onMouseEnter={() => { clearCloseTimer(); setOpen(true); }}
        onMouseLeave={scheduleClose}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex items-center gap-1 whitespace-nowrap transition-colors duration-300 px-3 2xl:px-4 py-2.5 text-sm 2xl:text-[15px] border-b-[3px] ${
            active
              ? 'text-on-surface font-bold border-secondary-container'
              : 'text-on-surface/70 font-semibold border-transparent hover:text-on-surface'
          }`}
        >
          {t[item.labelKey]}
          <Icons.ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        <div
          className={`absolute left-0 top-full w-56 bg-white rounded-md border border-slate-200 shadow-lg py-2 flex flex-col z-[60] transition-all duration-150 ease-out ${
            open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
          }`}
        >
          {item.children.map((child) => (
            <Link
              key={child.href}
              to={child.href}
              onClick={() => setOpen(false)}
              className={`px-4 py-2.5 text-left font-sans text-sm font-medium transition-colors ${
                location.pathname === child.href ? 'text-primary font-semibold bg-primary/5' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t[child.labelKey]}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={item.href!}
      className={`whitespace-nowrap transition-colors duration-300 px-3 2xl:px-4 py-2.5 text-sm 2xl:text-[15px] border-b-[3px] ${
        active
          ? 'text-on-surface font-bold border-secondary-container'
          : 'text-on-surface/70 font-semibold border-transparent hover:text-on-surface'
      }`}
    >
      {t[item.labelKey]}
    </Link>
  );
}

/** Mobile nav link — same config, stacked full-width row. Items with `children` expand inline instead of navigating. */
function MobileNavItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const location = useLocation();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const active = isItemActive(item, location.pathname);

  if (item.children) {
    return (
      <div className="flex flex-col">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`px-4 py-3 rounded-xl font-sans font-medium text-base flex items-center justify-between ${
            active ? 'bg-primary/5 text-primary font-bold' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {t[item.labelKey]}
          <Icons.ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="flex flex-col pl-4">
            {item.children.map((child) => (
              <Link
                key={child.href}
                to={child.href}
                onClick={onNavigate}
                className={`px-4 py-2.5 rounded-xl font-sans text-sm ${
                  location.pathname === child.href ? 'bg-primary/5 text-primary font-bold' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {t[child.labelKey]}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.href!}
      onClick={onNavigate}
      className={`px-4 py-3 rounded-xl font-sans font-medium text-base ${
        active ? 'bg-primary/5 text-primary font-bold' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {t[item.labelKey]}
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { itemCount, setIsCartOpen } = useCart();
  const { user, profile, signOutUser, loading } = useAuth();
  const { t } = useLanguage();

  const handleSignOut = async () => {
    await signOutUser();
    navigate('/');
  };
  const showCustomerWhatsApp = !loading && Boolean(user && profile?.role !== 'admin');
  const closeMobileMenu = () => setIsMenuOpen(false);

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <nav className="bg-white/80 backdrop-blur-md border-b border-white/40 shadow-[0_4px_24px_rgba(10,25,19,0.06)]">
        <div className="flex justify-between items-center h-20 2xl:h-[5.5rem] w-full gap-6 px-6 md:px-10 2xl:px-16">
          {/* Left — Brand */}
          <Link to="/" className="flex items-center shrink-0 py-3">
            <img
              src="/brand/karan-arjun-logo.png"
              alt={BRAND_NAME}
              className="h-full w-auto max-w-[9rem] md:max-w-[11rem] object-contain"
            />
          </Link>

          {/* Center-left — Main Navigation. No overflow-x-auto here: it would clip the
              floating dropdown panels, which are absolutely positioned relative to
              their own trigger and need to escape this row vertically. */}
          <div className="hidden xl:flex items-center gap-1 2xl:gap-2 font-sans tracking-wide">
            {NAV_ITEMS.map((item) => (
              <DesktopNavItem key={item.labelKey} item={item} />
            ))}
          </div>

          {/* Right — Cart / Auth / Language */}
          <div className="flex items-center gap-2 2xl:gap-3 shrink-0 ml-auto xl:ml-0">
            <button onClick={() => setIsCartOpen(true)} className="text-on-surface/70 hover:text-on-surface transition-colors p-2 relative">
              <Icons.ShoppingCart className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </button>
            {!loading && (
              <>
                {profile?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="hidden xl:flex items-center px-3.5 py-2 rounded-full bg-slate-100 text-on-surface text-xs font-sans font-bold hover:bg-slate-200 transition-colors whitespace-nowrap"
                  >
                    {t.nav_admin}
                  </Link>
                )}
                {user ? (
                  <>
                    <Link to={profile?.role === 'admin' ? '/admin' : '/profile'} className="text-on-surface/70 hover:text-on-surface hover:bg-slate-100 transition-all duration-300 p-2 rounded-full hidden sm:block">
                      <Icons.User className="w-6 h-6" />
                    </Link>
                    <button
                      onClick={() => void handleSignOut()}
                      className="text-on-surface/70 hover:text-on-surface hover:bg-slate-100 transition-all duration-300 p-2 rounded-full hidden sm:block"
                      title={t.nav_logout}
                    >
                      <Icons.LogOut className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <Link
                    to="/auth"
                    className="hidden sm:flex items-center px-4 py-2 rounded-full bg-slate-100 text-on-surface text-xs font-sans font-bold hover:bg-slate-200 transition-colors whitespace-nowrap"
                  >
                    {t.nav_login}
                  </Link>
                )}
                <div className="hidden sm:block">
                  <LanguageSwitcher />
                </div>
              </>
            )}
            {/* Mobile / Tablet Menu Toggle */}
            <button
              className="xl:hidden p-2 text-on-surface/70 hover:text-on-surface transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMenuOpen ? <Icons.X className="w-6 h-6" /> : <Icons.Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Menu Dropdown */}
        {isMenuOpen && (
          <div className="xl:hidden absolute top-full left-0 right-0 bg-white shadow-xl border-t border-slate-100 overflow-hidden flex flex-col p-2 gap-1 z-50 max-h-[calc(100vh-5rem)] overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <MobileNavItem key={item.labelKey} item={item} onNavigate={closeMobileMenu} />
            ))}
            {!loading && (
              <>
                {user ? (
                  <Link
                    to={profile?.role === 'admin' ? '/admin' : '/profile'}
                    onClick={closeMobileMenu}
                    className={`px-4 py-3 rounded-xl font-sans font-medium text-base flex items-center gap-2 ${
                      (location.pathname === '/profile' || location.pathname.startsWith('/admin'))
                        ? 'bg-primary/5 text-primary font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icons.User className="w-5 h-5" /> {profile?.role === 'admin' ? t.nav_admin_dashboard : t.nav_profile}
                  </Link>
                ) : (
                  <Link
                    to="/auth"
                    onClick={closeMobileMenu}
                    className={`px-4 py-3 rounded-xl font-sans font-medium text-base flex items-center gap-2 ${
                      location.pathname === '/auth'
                        ? 'bg-primary/5 text-primary font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icons.Lock className="w-5 h-5" /> {t.nav_login}
                  </Link>
                )}
                {profile?.role === 'admin' && (
                  <Link
                    to="/admin"
                    onClick={closeMobileMenu}
                    className={`px-4 py-3 rounded-xl font-sans font-medium text-base flex items-center gap-2 ${
                      location.pathname.startsWith('/admin')
                        ? 'bg-primary/5 text-primary font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icons.LayoutDashboard className="w-5 h-5" /> {t.nav_admin}
                  </Link>
                )}
                {user && (
                  <button
                    onClick={() => {
                      closeMobileMenu();
                      void handleSignOut();
                    }}
                    className="px-4 py-3 rounded-xl font-sans font-medium text-base flex items-center gap-2 text-slate-600 hover:bg-slate-50"
                  >
                    <Icons.LogOut className="w-5 h-5" /> {t.nav_logout}
                  </button>
                )}
              </>
            )}
            <div className="px-2 pt-1 pb-2">
              <LanguageSwitcher />
            </div>
          </div>
        )}
      </nav>
      {showCustomerWhatsApp && (
        <a
          href="https://wa.me/919307199040"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex fixed right-6 top-24 w-12 h-12 rounded-full items-center justify-center bg-[#25D366] text-white shadow-[0_8px_24px_rgba(37,211,102,0.45)] hover:scale-105 transition-transform z-50"
          aria-label="Chat on WhatsApp"
          title="Chat on WhatsApp"
        >
          <Icons.MessageCircle className="w-6 h-6" />
        </a>
      )}
    </div>
  );
}

interface FooterLinkGroup {
  heading: string;
  links: { label: string; href: string }[];
}

/**
 * Enterprise footer — company block + four link columns + contact block +
 * legal bottom bar, replacing the earlier oversized-icon "contact card"
 * layout. Link groups only reference routes that exist in App.tsx today;
 * legal links (Privacy/Terms/Cookie Policy/Disclaimer) have no page yet and
 * render as inert text (not fake hrefs) rather than linking to placeholder
 * routes, matching the prior behavior — see feedback_karanarjun memory on
 * not inventing scope beyond what's asked.
 */
export function Footer() {
  const { t } = useLanguage();

  const linkGroups: FooterLinkGroup[] = [
    {
      heading: t.footer_company_heading,
      links: [
        { label: t.nav_who_we_are, href: '/who-we-are' },
        { label: t.nav_what_we_do, href: '/what-we-do' },
        { label: t.nav_products, href: '/products' },
        { label: t.nav_career, href: '/career' },
      ],
    },
    {
      heading: t.footer_solutions_heading,
      links: [
        { label: t.nav_crop_solutions, href: '/crop-solutions' },
        { label: t.nav_research_innovation, href: '/research-innovation' },
        { label: t.nav_farmer_success, href: '/farmer-success' },
        { label: t.nav_resources, href: '/resources' },
      ],
    },
    {
      heading: t.footer_resources_heading,
      links: [
        { label: t.footer_blogs, href: '/resources/blogs' },
        { label: t.footer_crop_guides, href: '/resources/guides' },
        { label: t.footer_faqs, href: '/resources/faqs' },
        { label: t.footer_downloads, href: '/resources/downloads' },
      ],
    },
    {
      heading: t.footer_support_heading,
      links: [
        { label: t.footer_contact, href: '/contact' },
        { label: t.footer_help_center, href: '/support' },
      ],
    },
  ];

  const legalLinks = [t.footer_privacy, t.footer_terms, t.footer_cookie_policy, t.footer_disclaimer];

  return (
    <footer className="bg-primary w-full mt-auto border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-20">
        {/* Top: brand + description + social */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 md:gap-10 pb-10 md:pb-14 border-b border-white/10">
          <div className="max-w-sm">
            <div className="text-2xl font-extrabold text-white font-sans tracking-tight mb-4">
              {BRAND_NAME}
            </div>
            <p className="text-white/60 font-serif text-sm leading-relaxed">
              {t.footer_tagline}
            </p>
          </div>
          <a
            href="https://www.instagram.com/karanarjun_ksk_priyanka_mall"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm font-sans font-semibold transition-colors w-fit"
          >
            <Icons.Instagram className="w-4 h-4" />
            {t.footer_instagram}
          </a>
        </div>

        {/* Company info + support: kept full-width and first on mobile
            (ahead of the link groups) so contact details stay prominent
            and easy to find without scrolling past four link lists first —
            unchanged at sm:/lg: where the 5-column grid already gives it
            its own column in the natural (last) position. */}
        <div className="pt-8 pb-8 sm:hidden border-b border-white/10">
          <h4 className="font-sans text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-3">
            {t.footer_hq_title}
          </h4>
          <p className="text-white/75 text-sm font-sans leading-relaxed whitespace-pre-line mb-5">
            {t.footer_hq_address}
          </p>
          <h4 className="font-sans text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-2">
            {t.footer_sales_title}
          </h4>
          <a href="tel:+919307199040" className="text-white text-sm font-sans font-semibold hover:text-secondary-container transition-colors">
            +91 93071 99040
          </a>
        </div>

        {/* Middle: link columns + contact. Two columns from the smallest
            screen up (grid-cols-2, not grid-cols-1) so the four link
            groups read as a scannable 2x2 block on mobile instead of one
            long stacked list — lg: is untouched (lg:grid-cols-5 still
            applies at desktop; grid-cols-2 now covers what sm:grid-cols-2
            used to be the first breakpoint to apply, so it's redundant and
            dropped). */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-8 sm:gap-10 py-8 sm:py-14 border-b border-white/10">
          {linkGroups.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h4 className="font-sans text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-4 sm:mb-5">
                {group.heading}
              </h4>
              <ul className="flex flex-col gap-2.5 sm:gap-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="text-white/75 hover:text-white text-sm font-sans transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="hidden sm:block">
            <h4 className="font-sans text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-5">
              {t.footer_hq_title}
            </h4>
            <p className="text-white/75 text-sm font-sans leading-relaxed whitespace-pre-line mb-6">
              {t.footer_hq_address}
            </p>
            <h4 className="font-sans text-xs font-bold uppercase tracking-[0.15em] text-white/50 mb-3">
              {t.footer_sales_title}
            </h4>
            <a href="tel:+919307199040" className="text-white text-sm font-sans font-semibold hover:text-secondary-container transition-colors">
              +91 93071 99040
            </a>
          </div>
        </div>

        {/* Bottom: legal */}
        <div className="pt-6 sm:pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/50 text-xs font-sans text-center md:text-left">
            © {new Date().getFullYear()} {BRAND_NAME} {t.footer_copyright}
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap items-center justify-items-center sm:justify-center text-xs font-sans">
            {legalLinks.map((link) => (
              <span key={link} className="text-white/40">
                {link}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
