import { useLanguage } from '../../context/LanguageContext';

/**
 * Light split layout (content-left, image-right) — deliberately NOT a dark
 * or green-heavy treatment, per explicit design guidance to vary section
 * backgrounds across the page rather than defaulting sustainability content
 * to green. Reuses the split-layout idiom already established on this page
 * and in components/company/Manufacturing.tsx.
 */
export function SustainableFarming() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 bg-surface">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center px-8 md:px-16 py-16">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4">
            {t.wwd_sustainability_label}
          </span>
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-6 leading-tight">
            {t.wwd_sustainability_title}
          </h2>
          <p className="font-serif text-lg text-on-surface-variant leading-relaxed max-w-lg">
            {t.wwd_sustainability_body}
          </p>
        </div>

        <div className="relative min-h-[320px] lg:min-h-[480px]">
          {/*
            Interim asset: verified real Unsplash photo of a lush wheat
            field. Should be replaced with licensed company photography
            before production.
          */}
          <img
            src="https://images.unsplash.com/photo-1498408040764-ab6eb772a145?auto=format&fit=crop&w=1400&q=80"
            alt="Healthy wheat field in natural daylight"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
