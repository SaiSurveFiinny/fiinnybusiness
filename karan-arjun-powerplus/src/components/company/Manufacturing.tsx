import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Split image/text layout — reuses the exact pattern from
 * components/home/CompanySnapshot.tsx. Facility pairings (Diksal–
 * Ahilyanagar, Sambhajinagar, Mumbai–Kalyan) reflect the corrected facility
 * structure — no capacities, sizes, or specifications are fabricated.
 */
export function Manufacturing() {
  const { t } = useLanguage();

  const facilities = [
    { primary: 'Diksal', secondary: 'Ahilyanagar' },
    { primary: 'Sambhajinagar', secondary: null },
    { primary: 'Mumbai', secondary: 'Kalyan' },
  ];

  return (
    <section className="relative z-10 bg-surface">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        <div className="relative min-h-[320px] lg:min-h-[520px]">
          <img
            src="https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=1400&q=80"
            alt="Agricultural production facility"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col justify-center px-8 md:px-16 py-16">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4">
            {t.manufacturing_title}
          </span>
          <p className="font-serif text-xl text-primary leading-relaxed mb-10 max-w-lg">
            {t.manufacturing_body}
          </p>

          <div className="border-t border-primary/10 pt-8 max-w-lg">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-4">
              {t.manufacturing_facilities_label}
            </p>
            <div className="flex flex-col gap-3">
              {facilities.map((facility) => (
                <div
                  key={facility.primary}
                  className="flex items-center gap-3 px-5 py-4 rounded-xl border border-primary/10 bg-white"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/5 flex items-center justify-center text-primary shrink-0">
                    <Icons.MapPin className="w-4 h-4" />
                  </div>
                  <span className="font-sans font-bold text-primary">
                    {facility.primary}
                    {facility.secondary && (
                      <span className="font-normal text-on-surface-variant"> – {facility.secondary}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
