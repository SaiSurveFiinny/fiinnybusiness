import { useLanguage } from '../../context/LanguageContext';

/**
 * Split content/image layout — reuses the exact pattern from
 * components/company/Manufacturing.tsx and components/home/CompanySnapshot.tsx,
 * with content on the left and image on the right (opposite order to
 * Manufacturing's image-left layout) to create page-level rhythm.
 */
export function ExpertiseOverview() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 bg-surface">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center px-8 md:px-16 py-16 order-2 lg:order-1">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4">
            {t.wwd_overview_label}
          </span>
          <p className="font-serif text-xl text-primary leading-relaxed max-w-lg">
            {t.wwd_overview_body}
          </p>
        </div>

        <div className="relative min-h-[320px] lg:min-h-[480px] order-1 lg:order-2">
          {/*
            Interim asset: verified real Unsplash photo of a scientist
            examining test tubes in a lab. Should be replaced with licensed
            company/facility photography before production.
          */}
          <img
            src="https://images.unsplash.com/photo-1614935151651-0bea6508db6b?auto=format&fit=crop&w=1400&q=80"
            alt="Scientist examining samples in a laboratory setting"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
