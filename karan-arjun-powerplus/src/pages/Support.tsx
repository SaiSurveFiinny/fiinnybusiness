import { Icons } from '../components/Icons';
import { SupportTicketPanel } from '../components/home/SupportTicketPanel';
import { useLanguage } from '../context/LanguageContext';

/**
 * Permanent home of the support-ticket system. The ticket form, its
 * Firestore integration, authentication gating, validation, and
 * success/error states are all implemented once in SupportTicketPanel and
 * reused here unchanged — nothing on this page reimplements that logic.
 */
export default function Support() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col py-24 px-8 max-w-3xl mx-auto gap-10 min-h-screen">
      <header className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full text-primary border border-primary/10 mb-6">
          <Icons.MessageCircle className="w-4 h-4" />
          <span className="font-sans font-bold text-xs uppercase tracking-widest">{t.support_badge}</span>
        </div>
        <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-primary mb-4 leading-tight">
          {t.support_page_title}
        </h1>
        <p className="text-base md:text-lg text-on-surface-variant font-serif">{t.support_page_subtitle}</p>
      </header>

      <SupportTicketPanel />
    </div>
  );
}
