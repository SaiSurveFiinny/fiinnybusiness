import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/** Full-width dark divided strip with a subtle accent glow — reuses the pattern from components/home/WhatWeDo.tsx. */
export function Infrastructure() {
  const { t } = useLanguage();

  const items = [
    { icon: Icons.Box, title: t.infrastructure_facilities_title, desc: t.infrastructure_facilities_desc },
    { icon: Icons.PackageCheck, title: t.infrastructure_storage_title, desc: t.infrastructure_storage_desc },
    { icon: Icons.Truck, title: t.infrastructure_logistics_title, desc: t.infrastructure_logistics_desc },
    { icon: Icons.ShieldCheck, title: t.infrastructure_quality_title, desc: t.infrastructure_quality_desc },
  ];

  return (
    <section className="relative z-10 bg-primary py-16 md:py-24 overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-8 mb-14 relative z-10">
        <div className="max-w-2xl">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary-container mb-4 block">
            {t.infrastructure_title}
          </span>
          <p className="font-serif text-xl md:text-2xl text-white/80">{t.infrastructure_subtitle}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10 border-y border-white/10 relative z-10">
        {items.map((item, index) => (
          <div key={item.title} className="group py-8 md:px-8 flex flex-col gap-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-secondary-container group-hover:bg-secondary-container group-hover:text-primary transition-colors duration-300">
                <item.icon className="w-6 h-6" />
              </div>
              <span className="font-sans text-2xl font-extrabold text-white/10">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <h3 className="font-sans text-lg font-extrabold text-white">{item.title}</h3>
            <p className="text-white/60 text-sm leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
