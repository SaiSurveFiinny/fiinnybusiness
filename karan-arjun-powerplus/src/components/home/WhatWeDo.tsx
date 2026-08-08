import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Full-width dark band with a horizontally divided strip of pillars —
 * replaces the floating white-card grid. Breaks the page's white rhythm
 * and matches the divided-strip pattern used on corporate agri sites
 * (e.g. UPL's icon strip, BASF's industry tiles).
 */
export function WhatWeDo() {
  const { t } = useLanguage();

  const pillars = [
    { icon: Icons.Box, title: t.whatwedo_products_title, desc: t.whatwedo_products_desc, href: '/products' },
    { icon: Icons.Leaf, title: t.whatwedo_solutions_title, desc: t.whatwedo_solutions_desc, href: '/crop-solutions' },
    { icon: Icons.Sprout, title: t.whatwedo_research_title, desc: t.whatwedo_research_desc, href: '/research-innovation' },
    { icon: Icons.Users, title: t.whatwedo_support_title, desc: t.whatwedo_support_desc, href: '/support' },
  ];

  return (
    <section className="relative z-10 bg-primary py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-8 mb-16">
        <div className="max-w-2xl">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary-container mb-4 block">
            {t.whatwedo_title}
          </span>
          <p className="font-serif text-xl md:text-2xl text-white/80">{t.whatwedo_subtitle}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10 border-y border-white/10">
        {pillars.map((pillar) => (
          <Link
            key={pillar.title}
            to={pillar.href}
            className="group py-10 md:px-8 flex flex-col gap-4 hover:bg-white/5 transition-colors"
          >
            <pillar.icon className="w-8 h-8 text-secondary-container" />
            <h3 className="font-sans text-lg font-extrabold text-white">{pillar.title}</h3>
            <p className="text-white/60 text-sm leading-relaxed flex-grow">{pillar.desc}</p>
            <span className="font-sans font-bold text-xs uppercase tracking-widest text-secondary-container inline-flex items-center gap-1 group-hover:gap-2 transition-all">
              <Icons.ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
