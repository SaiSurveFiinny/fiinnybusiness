import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Split image/text "who we are" section — replaces the centered-heading +
 * stat-card-grid pattern. Photograph on one side, narrative + inline stats
 * on the other, matching the split layout used across corporate agri sites.
 * Grounded only in real, existing company facts.
 */
export function CompanySnapshot() {
  const { t } = useLanguage();

  const stats = [
    { value: t.snapshot_stat_farmers, label: t.snapshot_stat_farmers_label },
    { value: t.snapshot_stat_cert, label: t.snapshot_stat_cert_label },
    { value: t.snapshot_stat_reach, label: t.snapshot_stat_reach_label },
  ];

  return (
    <section className="relative z-10 bg-surface">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        <div className="relative min-h-[360px] lg:min-h-[560px]">
          <img
            src="https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1400&q=80"
            alt="Close-up of hands examining crop growth in soil"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col justify-center px-8 md:px-16 py-16 lg:py-0">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4">
            {t.snapshot_title}
          </span>
          <p className="font-serif text-xl md:text-2xl text-primary leading-relaxed mb-10 max-w-lg">
            {t.snapshot_body}
          </p>

          <div className="grid grid-cols-3 gap-6 mb-10 max-w-lg border-t border-primary/10 pt-8">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-1">{stat.value}</div>
                <div className="text-[10px] md:text-xs uppercase tracking-widest font-bold text-on-surface-variant leading-tight">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/who-we-are"
            className="inline-flex items-center gap-2 font-sans font-bold text-primary hover:text-secondary transition-colors w-fit"
          >
            {t.snapshot_link} <Icons.ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
