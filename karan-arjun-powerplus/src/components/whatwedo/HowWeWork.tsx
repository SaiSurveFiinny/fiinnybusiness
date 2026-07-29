import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Horizontal connected process flow (Research → Development → Field
 * Validation → Manufacturing → Farmer Support). Icons are used here
 * deliberately — this is a process/timeline, one of the few places the
 * scope calls icons appropriate — styled as a connected horizontal line on
 * desktop, stacking vertically on smaller screens.
 */
export function HowWeWork() {
  const { t } = useLanguage();

  const steps = [
    { icon: Icons.FileText, title: t.wwd_step1_title, desc: t.wwd_step1_desc },
    { icon: Icons.Sprout, title: t.wwd_step2_title, desc: t.wwd_step2_desc },
    { icon: Icons.MapPin, title: t.wwd_step3_title, desc: t.wwd_step3_desc },
    { icon: Icons.Box, title: t.wwd_step4_title, desc: t.wwd_step4_desc },
    { icon: Icons.Users, title: t.wwd_step5_title, desc: t.wwd_step5_desc },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-8 text-center mb-16">
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">
          {t.wwd_howwework_title}
        </h2>
        <p className="font-serif text-lg text-on-surface-variant">{t.wwd_howwework_subtitle}</p>
      </div>

      <div className="max-w-6xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-4 relative">
          <div className="hidden md:block absolute top-6 left-[10%] right-[10%] h-px bg-primary/10" aria-hidden="true" />
          {steps.map((step, index) => (
            <div key={step.title} className="flex flex-col items-center text-center relative">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-sans font-bold text-sm mb-5 relative z-10 shrink-0">
                {String(index + 1).padStart(2, '0')}
              </div>
              <step.icon className="w-5 h-5 text-secondary mb-3" />
              <h3 className="font-sans font-bold text-primary text-base mb-2">{step.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
