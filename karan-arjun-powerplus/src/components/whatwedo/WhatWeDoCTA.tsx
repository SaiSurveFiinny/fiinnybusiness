import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Clean closing CTA band — reuses the dark-band + accent-glow idiom from
 * components/home/SupportContactCTA.tsx and components/company/Infrastructure.tsx,
 * simplified to a single centered message and two buttons rather than that
 * component's two-panel layout, since this page's closing CTA is meant to
 * be a light-touch handoff, not another content section.
 */
export function WhatWeDoCTA() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 bg-primary py-20 md:py-28 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-secondary-container/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto px-8 text-center relative z-10">
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
          {t.wwd_cta_title}
        </h2>
        <p className="font-serif text-lg text-white/70 mb-10">{t.wwd_cta_subtitle}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/shop"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-8 py-4 rounded-full font-sans font-bold hover:bg-white transition-colors shadow-xl uppercase tracking-widest text-sm"
          >
            {t.wwd_cta_products} <Icons.ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/contact"
            className="w-full sm:w-auto inline-flex items-center justify-center border border-white/30 text-white px-8 py-4 rounded-full font-sans font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-sm"
          >
            {t.wwd_cta_contact}
          </Link>
        </div>
      </div>
    </section>
  );
}
