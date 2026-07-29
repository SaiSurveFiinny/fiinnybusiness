import { motion } from 'motion/react';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Full-bleed corporate profile hero — reuses the exact photo-hero pattern
 * established in components/home/HomeHero.tsx (same gradient overlay
 * approach, same motion conventions). This is the new introduction to the
 * /who-we-are page; the page's original hero and content follow unchanged
 * below it.
 */
export function CompanyHero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-[70vh] flex items-end overflow-hidden">
      {/*
        Interim asset: verified real Unsplash photo of Indian agriculture
        (farmer transplanting rice in a paddy field). Chosen deliberately
        over the previous generic greenhouse photo to authentically
        represent Indian farming, per explicit design feedback. This should
        still be replaced with a licensed local /public asset more specific
        to the company's actual crops (grapes, onions) and Maharashtra
        region once one is available.
      */}
      <img
        src="https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?auto=format&fit=crop&w=2000&q=80&fp-y=0.3&crop=focalpoint"
        alt="Farmer transplanting rice seedlings in an Indian paddy field"
        className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/75 to-primary/30" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-8 md:px-12 pb-16 pt-32">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-secondary-container border border-white/10 mb-6 text-xs font-sans font-bold uppercase tracking-widest">
          <Icons.Leaf className="w-3.5 h-3.5" /> {t.company_hero_badge}
        </span>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="font-sans text-[32px] md:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6 text-white"
        >
          {t.company_hero_heading}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-serif text-base md:text-lg text-white/80 max-w-2xl leading-relaxed"
        >
          {t.company_hero_body}
        </motion.p>
      </div>
    </section>
  );
}
