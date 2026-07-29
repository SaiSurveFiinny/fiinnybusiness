import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/**
 * Exactly the three names provided — no fabricated titles, bios, or
 * achievements. Placeholder avatars use the same initials-circle pattern
 * already used for signed-in users in pages/Profile.tsx, wrapped in a
 * proper card so real photographs (an `image` field) can be swapped in
 * later without any layout change. The role-label line is present in the
 * markup but only renders if a title is ever supplied — nothing invented.
 */
export function Leadership() {
  const { t } = useLanguage();

  const people: { name: string; role?: string }[] = [
    { name: 'Savita Tanpure' },
    { name: 'Karan Tanpure' },
    { name: 'Arjun Tanpure' },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-8 text-center mb-14">
        <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">
          {t.leadership_title}
        </h2>
        <p className="font-serif text-lg text-on-surface-variant">{t.leadership_subtitle}</p>
      </div>

      <div className="max-w-4xl mx-auto px-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {people.map((person) => (
          <div
            key={person.name}
            className="group flex flex-col items-center text-center p-8 border border-primary/10 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(10,25,19,0.08)] hover:border-primary/20"
          >
            <div className="relative mb-5">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-container to-primary flex items-center justify-center shadow-sm">
                <span className="text-2xl font-sans font-bold text-secondary-container">{initials(person.name)}</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-secondary-container flex items-center justify-center border-2 border-surface">
                <Icons.Leaf className="w-3.5 h-3.5 text-on-secondary-container" />
              </div>
            </div>
            <div className="w-8 h-px bg-primary/10 mb-4" />
            <h3 className="font-sans font-bold text-primary text-lg">{person.name}</h3>
            {person.role && (
              <p className="text-xs uppercase tracking-widest font-bold text-on-surface-variant mt-1.5">{person.role}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
