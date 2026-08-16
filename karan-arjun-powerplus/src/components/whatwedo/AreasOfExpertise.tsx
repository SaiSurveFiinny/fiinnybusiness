import { motion, useReducedMotion } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Asymmetric editorial composition — one large feature story, one reversed
 * secondary story, and a smaller captioned tile for the third topic —
 * replacing the earlier repeated alternating-row pattern. Content/translation
 * keys (wwd_expertise1-3_title/desc) are unchanged; only the visual
 * composition and image assignments changed. Images are distinct from the
 * ones used by the immediately adjacent sections on this page
 * (ExpertiseOverview's lab photo, AgriculturalInnovation's soil-sample photo)
 * to avoid repetition within the same page flow.
 */
export function AreasOfExpertise() {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();

  const fadeUp = (delay = 0) => ({
    initial: reduceMotion ? undefined : { opacity: 0, y: 24 },
    whileInView: reduceMotion ? undefined : { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-100px' } as const,
    transition: { duration: 0.6, ease: 'easeOut' as const, delay: reduceMotion ? 0 : delay },
  });

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-6 md:px-8 text-center mb-14 md:mb-20">
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">
          {t.wwd_expertise_title}
        </h2>
        <p className="font-serif text-lg text-on-surface-variant">{t.wwd_expertise_subtitle}</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-8 flex flex-col gap-4 md:gap-6">
        {/* Feature story — large landscape image + supporting copy column, asymmetric 3:2 split on desktop */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-stretch">
          <motion.div
            className="w-full lg:w-3/5 group"
            {...fadeUp()}
          >
            <div className="relative rounded-2xl overflow-hidden aspect-[16/10]">
              <img
                src="https://images.unsplash.com/photo-1498408040764-ab6eb772a145?auto=format&fit=crop&w=1400&q=80"
                alt="Vibrant green wheat field in daylight"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
          </motion.div>
          <motion.div className="w-full lg:w-2/5 flex flex-col justify-center" {...fadeUp(0.15)}>
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">01</span>
            <h3 className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-4 leading-tight">
              {t.wwd_expertise1_title}
            </h3>
            <p className="text-on-surface-variant font-serif text-base md:text-lg leading-relaxed">
              {t.wwd_expertise1_desc}
            </p>
          </motion.div>
        </div>

        {/* Secondary story — reversed proportions: copy leads, medium image follows */}
        <div className="flex flex-col lg:flex-row-reverse gap-6 lg:gap-10 items-stretch pt-6 md:pt-10">
          <motion.div className="w-full lg:w-2/5 group" {...fadeUp()}>
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-[3/4]">
              <img
                src="https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=1000&q=80"
                alt="Hands planting a seedling into dark soil"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
          </motion.div>
          <motion.div className="w-full lg:w-3/5 flex flex-col justify-center" {...fadeUp(0.15)}>
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">02</span>
            <h3 className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-4 leading-tight">
              {t.wwd_expertise2_title}
            </h3>
            <p className="text-on-surface-variant font-serif text-base md:text-lg leading-relaxed max-w-lg">
              {t.wwd_expertise2_desc}
            </p>
          </motion.div>
        </div>

        {/* Supporting tile — smaller captioned image, third topic closes the rhythm */}
        <motion.div
          className="pt-6 md:pt-10 border-t border-primary/10 mt-6 md:mt-10 flex flex-col md:flex-row gap-6 md:gap-10 items-center"
          {...fadeUp()}
        >
          <div className="relative w-full md:w-2/5 rounded-2xl overflow-hidden aspect-[16/9] group shrink-0">
            <img
              src="https://images.unsplash.com/photo-1707721690626-10e5f0366bcb?auto=format&fit=crop&w=1000&q=80"
              alt="A group of farmers working together in a field"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
          <div className="w-full md:w-3/5">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">03</span>
            <h3 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-3 leading-tight">
              {t.wwd_expertise3_title}
            </h3>
            <p className="text-on-surface-variant font-serif text-sm md:text-base leading-relaxed max-w-lg">
              {t.wwd_expertise3_desc}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
