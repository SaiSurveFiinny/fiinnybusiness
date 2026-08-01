import { useLanguage } from '../../context/LanguageContext';

/**
 * Dark full-width split section — research-focused imagery and copy, no
 * icons. Reuses the split-layout idiom from components/company/Manufacturing.tsx
 * but on a dark background for page-level rhythm (light → dark → light
 * alternation across the page).
 */
export function AgriculturalInnovation() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 bg-primary">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        <div className="relative min-h-[320px] lg:min-h-[480px]">
          {/*
            Interim asset: verified real Unsplash photo of a researcher
            examining plant/soil samples. Should be replaced with licensed
            company research photography before production.
          */}
          <img
            src="https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=1400&q=80"
            alt="Close examination of a seedling and soil sample"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />
        </div>

        <div className="flex flex-col justify-center px-8 md:px-16 py-16">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary-container mb-4">
            {t.wwd_innovation_label}
          </span>
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-6 leading-tight">
            {t.wwd_innovation_title}
          </h2>
          <p className="font-serif text-lg text-white/70 leading-relaxed max-w-lg">
            {t.wwd_innovation_body}
          </p>
        </div>
      </div>
    </section>
  );
}
