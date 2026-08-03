import { motion } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Alternating left-right image/text rows — reuses the exact pattern from
 * components/home/WhyTrustUs.tsx. The 7 capability areas suggested in scope
 * (crop nutrition, plant health, yield improvement, soil enhancement,
 * agricultural innovation, farmer education, sustainable farming) are
 * consolidated into 3 richer rows here — innovation, farmer education, and
 * sustainable farming each get their own full section further down the page,
 * so grouping them here avoids repeating that content in a thinner form.
 */
export function AreasOfExpertise() {
  const { t } = useLanguage();

  const rows = [
    {
      title: t.wwd_expertise1_title,
      desc: t.wwd_expertise1_desc,
      // Interim asset: verified real Unsplash photo of a vibrant green wheat field.
      image: 'https://images.unsplash.com/photo-1498408040764-ab6eb772a145?auto=format&fit=crop&w=1200&q=80',
      alt: 'Vibrant green wheat field in daylight',
    },
    {
      title: t.wwd_expertise2_title,
      desc: t.wwd_expertise2_desc,
      // Interim asset: verified real Unsplash photo of a seedling being planted in soil.
      image: 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=1200&q=80',
      alt: 'Hands planting a seedling into dark soil',
    },
    {
      title: t.wwd_expertise3_title,
      desc: t.wwd_expertise3_desc,
      // Interim asset: verified real Unsplash photo of farmers working together in a field near Nagpur.
      image: 'https://images.unsplash.com/photo-1707721690626-10e5f0366bcb?auto=format&fit=crop&w=1200&q=80',
      alt: 'A group of farmers working together in a field',
    },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-8 text-center mb-16">
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">
          {t.wwd_expertise_title}
        </h2>
        <p className="font-serif text-lg text-on-surface-variant">{t.wwd_expertise_subtitle}</p>
      </div>

      <div className="max-w-6xl mx-auto px-8 flex flex-col gap-16 md:gap-24">
        {rows.map((row, index) => {
          const isEven = index % 2 === 0;
          return (
            <motion.div
              key={row.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.7 }}
              className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-10 md:gap-16`}
            >
              <div className="w-full md:w-1/2">
                <div className="relative rounded-[2.5rem] overflow-hidden aspect-[4/3]">
                  <img src={row.image} alt={row.alt} className="absolute inset-0 w-full h-full object-cover" />
                </div>
              </div>
              <div className="w-full md:w-1/2 flex flex-col">
                <h3 className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-4">{row.title}</h3>
                <p className="text-on-surface-variant font-serif text-base md:text-lg leading-relaxed">{row.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
