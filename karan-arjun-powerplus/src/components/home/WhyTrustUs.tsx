import { useLanguage } from '../../context/LanguageContext';

/**
 * Editorial "Why Farmers Choose Us" section — enterprise agri-brand
 * treatment (Corteva/Syngenta-style alternating photo/copy rows), replacing
 * the earlier icon-badge-in-a-circle version. Numbered index markers stand
 * in for icons, images use a single consistent aspect ratio and restrained
 * corner radius, and each row is separated by a hairline rule rather than
 * floating in isolation — the goal is a structured, editorial rhythm
 * instead of a stack of decorated cards. Content/translation keys are
 * unchanged from the prior implementation.
 */
export function WhyTrustUs() {
  const { t } = useLanguage();

  const rows = [
    {
      index: '01',
      title: t.drought_title,
      desc: t.drought_desc,
      image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1400&q=80',
      alt: 'Irrigation water reaching crop rows in a dry field',
    },
    {
      index: '02',
      title: t.disease_title,
      desc: t.disease_desc,
      image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1400&q=80',
      alt: 'Healthy dense vineyard rows under clear skies',
    },
    {
      index: '03',
      title: t.root_title,
      desc: t.root_desc,
      image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1400&q=80',
      alt: 'Close-up of a seedling emerging from rich soil',
    },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-10 md:mb-14">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-4 block">
            Proven Results
          </span>
          <h2 className="font-sans text-3xl md:text-[44px] font-extrabold text-primary tracking-tight leading-[1.1] mb-5">
            {t.whychooseus_title_line1} {t.whychooseus_title_line2}
          </h2>
          <p className="font-serif text-base md:text-lg text-on-surface-variant leading-relaxed">
            Field-tested outcomes farmers rely on season after season.
          </p>
        </div>

        {/* Rows */}
        <div className="flex flex-col">
          {rows.map((row, index) => {
            const isEven = index % 2 === 0;
            return (
              <div key={row.title} className={index > 0 ? 'border-t border-primary/10' : ''}>
                <div
                  className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-10 md:gap-16 py-10 md:py-14`}
                >
                  <div className="w-full md:w-1/2">
                    <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
                      <img
                        src={row.image}
                        alt={row.alt}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-1/2 flex flex-col">
                    <span className="font-sans text-sm font-bold text-secondary tracking-wide mb-4">
                      {row.index}
                    </span>
                    <h3 className="font-sans text-2xl md:text-[32px] font-extrabold text-primary mb-4 leading-tight tracking-tight">
                      {row.title}
                    </h3>
                    <p className="text-on-surface-variant font-serif text-base md:text-lg leading-relaxed max-w-md">
                      {row.desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
