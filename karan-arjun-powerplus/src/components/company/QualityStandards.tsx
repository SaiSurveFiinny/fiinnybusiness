import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Factual quality-commitment statement plus a 3-step process-checkpoint row
 * (Formulation → Manufacturing → Testing) to give the section real visual
 * structure. No specific technical claims, capacities, or lab details are
 * fabricated — only generic, evergreen process language.
 */
export function QualityStandards() {
  const { t } = useLanguage();

  const checkpoints = [
    { icon: Icons.Droplets, title: t.quality_checkpoint1_title, desc: t.quality_checkpoint1_desc },
    { icon: Icons.Box, title: t.quality_checkpoint2_title, desc: t.quality_checkpoint2_desc },
    { icon: Icons.CheckCircle2, title: t.quality_checkpoint3_title, desc: t.quality_checkpoint3_desc },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-8 text-center mb-14">
        <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center text-primary mx-auto mb-6">
          <Icons.ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-5 tracking-tight">
          {t.quality_standards_title}
        </h2>
        <p className="font-serif text-lg text-on-surface-variant leading-relaxed">
          {t.quality_standards_body}
        </p>
      </div>

      <div className="max-w-4xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {checkpoints.map((checkpoint, index) => (
            <div key={checkpoint.title} className="relative flex flex-col items-center text-center p-6 border border-primary/10 rounded-2xl">
              {index < checkpoints.length - 1 && (
                <Icons.ChevronRight className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 w-5 h-5 text-primary/15 z-10" />
              )}
              <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-4">
                <checkpoint.icon className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-bold text-primary text-base mb-1.5">{checkpoint.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{checkpoint.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
