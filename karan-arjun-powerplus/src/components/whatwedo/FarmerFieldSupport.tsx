import { useLanguage } from '../../context/LanguageContext';

/**
 * Full-width photo banner with overlay text — a new pattern for this page,
 * but consistent with the site's established full-bleed-photo idiom (see
 * HomeHero.tsx, CompanyHero.tsx). No icons, no card grid — the photograph
 * carries the section.
 */
export function FarmerFieldSupport() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 min-h-[60vh] flex items-center overflow-hidden">
      {/*
        Interim asset: verified real Unsplash photo of a group of farmers
        in a field near Nagpur, Maharashtra. Should be replaced with
        licensed company field-support photography before production.
      */}
      <img
        src="https://images.unsplash.com/photo-1707721690544-781fe6ede937?auto=format&fit=crop&w=2000&q=80"
        alt="A group of farmers standing together in a field"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/85 via-primary/50 to-primary/10" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-8 md:px-12 py-20">
        <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary-container mb-4 block">
          {t.wwd_fieldsupport_label}
        </span>
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-6 max-w-xl leading-tight">
          {t.wwd_fieldsupport_title}
        </h2>
        <p className="font-serif text-lg text-white/80 max-w-xl leading-relaxed">
          {t.wwd_fieldsupport_body}
        </p>
      </div>
    </section>
  );
}
