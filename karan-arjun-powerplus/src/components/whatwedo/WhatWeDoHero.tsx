import { motion } from 'motion/react';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Full-bleed corporate hero for the "What We Do" page — reuses the exact
 * photo-hero pattern established in components/company/CompanyHero.tsx
 * (same gradient overlay, same motion conventions), with new copy specific
 * to the company's capabilities rather than its story.
 */
export function WhatWeDoHero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-[70vh] flex items-end overflow-hidden">
      {/*
        Interim asset: verified real Unsplash photo (farmer applying crop
        treatment in a field near Nagpur, Maharashtra). Should be replaced
        with licensed company photography before production.
      */}
      <img
        src="https://images.unsplash.com/photo-1709532388333-acf472eae61a?auto=format&fit=crop&w=2000&q=80"
        alt="Farmer applying crop treatment in a field in Maharashtra"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/75 to-primary/30" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-8 md:px-12 pb-16 pt-32">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-secondary-container border border-white/10 mb-6 text-xs font-sans font-bold uppercase tracking-widest">
          <Icons.Leaf className="w-3.5 h-3.5" /> {t.wwd_hero_badge}
        </span>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="font-sans text-[32px] md:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6 text-white max-w-3xl"
        >
          {t.wwd_hero_heading}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-serif text-base md:text-lg text-white/80 max-w-2xl leading-relaxed"
        >
          {t.wwd_hero_body}
        </motion.p>
      </div>
    </section>
  );
}
