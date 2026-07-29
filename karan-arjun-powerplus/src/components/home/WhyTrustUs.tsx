import { motion } from 'motion/react';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Alternating left-right image/text rows — the homepage's trust section.
 * Deliberately distinct from the bento-grid "WhyChooseUs" component (which
 * remains unchanged on /who-we-are) so each page keeps its own appropriate
 * visual treatment rather than one component serving two different jobs.
 * Directly modeled on the alternating photo-panel pattern used across
 * corporate agri sites (e.g. Corteva's History/Innovation/Purpose rows).
 */
export function WhyTrustUs() {
  const { t } = useLanguage();

  const rows = [
    {
      icon: Icons.Droplets,
      title: t.drought_title,
      desc: t.drought_desc,
      image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=80',
      alt: 'Irrigation water reaching crop rows in a dry field',
    },
    {
      icon: Icons.ShieldCheck,
      title: t.disease_title,
      desc: t.disease_desc,
      image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=80',
      alt: 'Healthy dense vineyard rows under clear skies',
    },
    {
      icon: Icons.Sprout,
      title: t.root_title,
      desc: t.root_desc,
      image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80',
      alt: 'Close-up of a seedling emerging from rich soil',
    },
  ];

  return (
    <section className="relative z-10 bg-surface py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-8 mb-16 text-center">
        <h2 className="font-sans text-4xl md:text-5xl font-extrabold text-primary tracking-tight">
          {t.whychooseus_title_line1} {t.whychooseus_title_line2}
        </h2>
      </div>

      <div className="max-w-6xl mx-auto px-8 flex flex-col gap-20 md:gap-28">
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
                <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center text-primary mb-6">
                  <row.icon className="w-7 h-7" />
                </div>
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
