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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-sans font-bold hover:bg-white/20 transition-colors"
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
          className={`flex items-center gap-1 whitespace-nowrap transition-colors duration-300 px-3 2xl:px-4 py-2.5 text-sm 2xl:text-[15px] border-b-2 ${
            active
              ? 'text-white font-bold border-secondary-container'
              : 'text-white/80 font-semibold border-transparent hover:text-white'
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
      className={`whitespace-nowrap transition-colors duration-300 px-3 2xl:px-4 py-2.5 text-sm 2xl:text-[15px] border-b-2 ${
        active
          ? 'text-white font-bold border-secondary-container'
          : 'text-white/80 font-semibold border-transparent hover:text-white'
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
      <nav className="bg-primary/95 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_30px_rgba(10,25,19,0.25)]">
        <div className="flex justify-between items-center h-20 2xl:h-[5.5rem] w-full gap-6 px-6 md:px-10 2xl:px-16">
          {/* Left — Brand */}
          <Link to="/" className="text-lg 2xl:text-xl font-extrabold text-white tracking-tight font-sans shrink-0 whitespace-nowrap">
            {BRAND_NAME}
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
            <button onClick={() => setIsCartOpen(true)} className="text-white/80 hover:text-white transition-colors p-2 relative">
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
                    className="hidden xl:flex items-center px-3.5 py-2 rounded-full bg-white/10 text-white text-xs font-sans font-bold hover:bg-white/20 transition-colors whitespace-nowrap"
                  >
                    {t.nav_admin}
                  </Link>
                )}
                {user ? (
                  <>
                    <Link to={profile?.role === 'admin' ? '/admin' : '/profile'} className="text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 p-2 rounded-full hidden sm:block">
                      <Icons.User className="w-6 h-6" />
                    </Link>
                    <button
                      onClick={() => void handleSignOut()}
                      className="text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 p-2 rounded-full hidden sm:block"
                      title={t.nav_logout}
                    >
                      <Icons.LogOut className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <Link
                    to="/auth"
                    className="hidden sm:flex items-center px-4 py-2 rounded-full bg-white/10 text-white text-xs font-sans font-bold hover:bg-white/20 transition-colors whitespace-nowrap"
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
              className="xl:hidden p-2 text-white/80 hover:text-white transition-colors"
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

export function Footer() {
  const { t } = useLanguage();
  const links = [t.footer_privacy, t.footer_terms, t.footer_contact, t.footer_shipping];

  return (
    <footer className="bg-primary w-full mt-auto border-t border-white/10 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-secondary-container/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="flex flex-col items-center py-24 px-6 max-w-7xl mx-auto gap-12 text-center relative z-10">
        <div className="text-3xl md:text-5xl font-extrabold text-white font-sans tracking-tight">
          {BRAND_NAME}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-white/80 font-sans text-sm max-w-5xl w-full text-center md:text-left bg-white/5 p-8 md:p-12 rounded-[2.5rem] border border-white/10 backdrop-blur-md shadow-2xl">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="bg-white/10 p-4 rounded-2xl text-secondary-container"><Icons.MapPin className="w-7 h-7" /></div>
            <h4 className="font-bold text-white text-xl">{t.footer_hq_title}</h4>
            <p className="text-white/70 leading-relaxed whitespace-pre-line">{t.footer_hq_address}</p>
          </div>

          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="bg-white/10 p-4 rounded-2xl text-secondary-container"><Icons.MessageCircle className="w-7 h-7" /></div>
            <h4 className="font-bold text-white text-xl">{t.footer_sales_title}</h4>
            <p className="text-white/70 leading-relaxed">{t.footer_sales_desc}<br/><span className="font-bold text-secondary-container text-xl block mt-1">+91 9307199040</span></p>
          </div>

          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="bg-white/10 p-4 rounded-2xl text-secondary-container"><Icons.Instagram className="w-7 h-7" /></div>
            <h4 className="font-bold text-white text-xl">{t.footer_community_title}</h4>
            <p className="text-white/70 leading-relaxed">{t.footer_community_desc}<br/><a href="#" className="font-bold text-white hover:text-secondary-container transition-colors">@karanarjun_ksk_priyanka_mall</a><br/><span className="inline-block mt-2 px-3 py-1 bg-secondary-container/20 text-secondary-container text-[10px] font-bold tracking-widest uppercase rounded-full">75.8K+ Followers</span></p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 font-sans text-[10px] sm:text-xs uppercase tracking-widest font-bold mt-8">
          {links.map((link) => (
            <a key={link} href="#" className="text-white/70 hover:text-secondary-container transition-colors">
              {link}
            </a>
          ))}
        </div>
        <div className="text-white/50 text-[10px] sm:text-xs font-sans max-w-md">
          © {new Date().getFullYear()} {BRAND_NAME} {t.footer_copyright}
        </div>
      </div>
    </footer>
  );
}
