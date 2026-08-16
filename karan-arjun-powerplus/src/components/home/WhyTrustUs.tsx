import { motion, useReducedMotion } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * "Why Farmers Choose Us" — single full-bleed background-image section with
 * result columns laid directly over the photograph (editorial agri-corporate
 * treatment), replacing the earlier per-result alternating image/text rows.
 * Background image + gradient-overlay technique matches the established
 * full-bleed pattern used in CropSolutionsLanding/FarmerSuccessLanding hero
 * sections (absolutely-positioned <img> + object-cover + primary-tinted
 * gradient, content in a relative z-10 wrapper) rather than a CSS
 * background-image, to stay consistent with the rest of the codebase.
 */
export function WhyTrustUs() {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();

  const results = [
    { index: '01', title: t.drought_title, desc: t.drought_desc },
    { index: '02', title: t.disease_title, desc: t.disease_desc },
    { index: '03', title: t.root_title, desc: t.root_desc },
  ];

  return (
    <section className="relative z-10 overflow-hidden">
      {/* Interim asset: verified real Unsplash photo of a seedling emerging from rich soil — already used as a full-bleed hero background elsewhere in this codebase (CropSolutionsLanding, FarmerSuccessLanding). */}
      <motion.img
        src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=2000&q=80"
        alt="Close-up of a seedling emerging from rich soil"
        className="absolute inset-0 w-full h-full object-cover"
        initial={reduceMotion ? undefined : { opacity: 0, scale: 1.04 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 1 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/70 to-primary/90" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 pt-20 pb-14 md:pt-28 md:pb-20 flex flex-col min-h-[640px] md:min-h-[720px]">
        {/* Header */}
        <motion.div
          className="max-w-2xl mb-16 md:mb-24"
          initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary-container mb-4 block">
            {t.whychooseus_label}
          </span>
          <h2 className="font-sans text-3xl md:text-[44px] font-extrabold text-white tracking-tight leading-[1.1] mb-5">
            {t.whychooseus_title_line1} {t.whychooseus_title_line2}
          </h2>
          <p className="font-serif text-base md:text-lg text-white/80 leading-relaxed">
            {t.whychooseus_subtitle}
          </p>
        </motion.div>

        {/* Results — stacked with horizontal rules on mobile, side-by-side with vertical rules from md up */}
        <div className="mt-auto flex flex-col md:flex-row md:divide-x md:divide-white/20">
          {results.map((result, i) => (
            <motion.div
              key={result.title}
              className={`group flex-1 py-8 md:py-0 md:px-8 lg:px-10 first:pt-0 md:first:pl-0 last:pb-0 md:last:pr-0 ${
                i > 0 ? 'border-t border-white/20 md:border-t-0' : ''
              }`}
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: reduceMotion ? 0 : 0.1 * i }}
            >
              <span className="font-sans text-sm font-bold text-secondary-container tracking-wide mb-3 block transition-opacity duration-300 group-hover:opacity-80">
                {result.index}
              </span>
              <h3 className="font-sans text-xl md:text-2xl font-extrabold text-white mb-3 leading-tight tracking-tight transition-colors duration-300 group-hover:text-secondary-container">
                {result.title}
              </h3>
              <p className="text-white/75 font-serif text-sm md:text-base leading-relaxed">{result.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
