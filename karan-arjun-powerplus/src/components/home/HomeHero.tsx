import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Full-bleed photographic hero establishing corporate identity — replaces
 * the icon-decorated, centered-text hero pattern. Left-aligned headline over
 * a real field photograph with a dark gradient overlay, matching the
 * full-width photo-hero pattern used across corporate agri sites.
 */
export function HomeHero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-[92vh] flex items-end overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=80"
        alt="Farmer walking through a green field at sunrise"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/20 to-transparent" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-8 md:px-12 pb-20 pt-40">
        <p className="font-sans text-secondary-container mb-4 font-bold tracking-[0.3em] uppercase text-xs md:text-sm">
          {t.home_hero_tagline}
        </p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="font-sans text-[34px] md:text-6xl lg:text-7xl font-extrabold leading-[1.05] mb-6 text-white max-w-3xl"
        >
          {t.home_hero_heading_line1} <span className="text-secondary-container">{t.home_hero_heading_line2}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-serif text-base md:text-xl text-white/80 max-w-xl mb-10"
        >
          {t.home_hero_subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <Link
            to="/products"
            className="bg-secondary-container text-on-secondary-container px-9 py-4 rounded-full font-sans font-bold hover:bg-white transition-all shadow-xl uppercase tracking-widest text-sm inline-flex items-center justify-center gap-2"
          >
            {t.home_hero_cta_primary} <Icons.ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/who-we-are"
            className="border border-white/30 text-white px-9 py-4 rounded-full font-sans font-bold hover:bg-white/10 transition-all uppercase tracking-widest text-sm inline-flex items-center justify-center"
          >
            {t.home_hero_cta_secondary}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
