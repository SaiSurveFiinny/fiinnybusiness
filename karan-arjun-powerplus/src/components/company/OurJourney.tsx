import { motion } from 'motion/react';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Numbered vertical timeline. Deliberately stage-based rather than
 * year-based — no dates are fabricated. Reuses the whileInView scroll-reveal
 * convention already established in components/home/WhyTrustUs.tsx.
 */
export function OurJourney() {
  const { t } = useLanguage();

  const steps = [
    { icon: Icons.MapPin, title: t.journey_step1_title, desc: t.journey_step1_desc },
    { icon: Icons.Sprout, title: t.journey_step2_title, desc: t.journey_step2_desc },
    { icon: Icons.Users, title: t.journey_step3_title, desc: t.journey_step3_desc },
    { icon: Icons.Box, title: t.journey_step4_title, desc: t.journey_step4_desc },
    { icon: Icons.Leaf, title: t.journey_step5_title, desc: t.journey_step5_desc },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4 block">
              {t.journey_title}
            </span>
            <p className="font-serif text-2xl text-primary leading-relaxed mb-8">{t.journey_subtitle}</p>
            <div className="hidden lg:flex items-center gap-3 text-on-surface-variant">
              <span className="text-4xl font-sans font-extrabold text-primary/10">{String(steps.length).padStart(2, '0')}</span>
              <span className="text-xs uppercase tracking-widest font-bold">Milestones</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 relative">
          <div className="absolute left-[23px] top-2 bottom-2 w-px bg-primary/10" aria-hidden="true" />
          <div className="flex flex-col gap-10">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="flex gap-6 relative"
              >
                <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shrink-0 relative z-10 font-sans font-bold text-sm">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="pt-1.5 pb-2 flex-1 border-b border-primary/5 last:border-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <step.icon className="w-4 h-4 text-secondary" />
                    <h3 className="font-sans text-lg font-extrabold text-primary">{step.title}</h3>
                  </div>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
