import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Core values grid — icon-in-circle treatment, hover lift, and a subtle
 * accent glow per enterprise-card conventions, while staying restrained:
 * one icon, one title, one short description per card, no extra filler.
 */
export function CoreValues() {
  const { t } = useLanguage();

  const values = [
    { icon: Icons.ShieldCheck, title: t.value_integrity_title, desc: t.value_integrity_desc },
    { icon: Icons.Sprout, title: t.value_innovation_title, desc: t.value_innovation_desc },
    { icon: Icons.CheckCircle2, title: t.value_quality_title, desc: t.value_quality_desc },
    { icon: Icons.Users, title: t.value_farmerfirst_title, desc: t.value_farmerfirst_desc },
    { icon: Icons.HandHeart, title: t.value_trust_title, desc: t.value_trust_desc },
    { icon: Icons.Leaf, title: t.value_sustainability_title, desc: t.value_sustainability_desc },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-8 text-center mb-12">
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">
          {t.values_title}
        </h2>
        <p className="font-serif text-lg text-on-surface-variant">{t.values_subtitle}</p>
      </div>

      <div className="max-w-6xl mx-auto px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {values.map((value) => (
          <div
            key={value.title}
            className="group relative p-7 border border-primary/10 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(10,25,19,0.08)] hover:border-primary/20"
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-secondary-container/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-5 group-hover:bg-primary group-hover:text-secondary-container transition-colors duration-300">
                <value.icon className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-bold text-primary text-lg mb-2">{value.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{value.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
