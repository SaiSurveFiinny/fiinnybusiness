import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * "Digital Agriculture Platform" — positions KrishiDukan as a Karan Arjun
 * flagship digital product, not a marketing banner. Enterprise SaaS
 * showcase composition (screenshot + headline/copy + capability list + one
 * CTA), matching the restraint of the recently-redesigned WhyTrustUs/
 * Footer sections rather than a card-grid feature-overload layout. Content
 * only names capabilities verified against the live product
 * (krishidukan.com) and its codebase — see project memory for the trace —
 * nothing here is invented (no user counts, no download numbers, no
 * awards).
 */
export function KrishiDukanShowcase() {
  const { t } = useLanguage();

  const capabilities = [
    { title: t.krishidukan_capability1_title, description: t.krishidukan_capability1_desc },
    { title: t.krishidukan_capability2_title, description: t.krishidukan_capability2_desc },
    { title: t.krishidukan_capability3_title, description: t.krishidukan_capability3_desc },
    { title: t.krishidukan_capability4_title, description: t.krishidukan_capability4_desc },
  ];

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Product visual — real screenshot of the live platform */}
          <div className="order-2 lg:order-1">
            <div className="relative rounded-lg overflow-hidden border border-slate-200 shadow-[0_20px_60px_-15px_rgba(10,25,19,0.18)]">
              <img
                src="/krishidukan/krishidukan-desktop-screenshot.png"
                alt="KrishiDukan platform shown on laptop and mobile — local marketplace with nearby stores, and the Crop Hub"
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
          </div>

          {/* Copy + capabilities */}
          <div className="order-1 lg:order-2">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-4 block">
              {t.krishidukan_label}
            </span>
            <h2 className="font-sans text-3xl md:text-[40px] font-extrabold text-primary tracking-tight leading-[1.1] mb-5">
              KrishiDukan
            </h2>
            <p className="font-serif text-base md:text-lg text-on-surface-variant leading-relaxed mb-8 max-w-lg">
              {t.krishidukan_body}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mb-8">
              {capabilities.map((capability) => (
                <div key={capability.title} className="border-l-2 border-primary/10 pl-4">
                  <h3 className="font-sans font-bold text-primary text-sm mb-1.5">{capability.title}</h3>
                  <p className="text-on-surface-variant text-sm font-serif leading-relaxed">{capability.description}</p>
                </div>
              ))}
            </div>

            <a
              href="https://krishidukan.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-sans font-bold text-primary text-sm hover:underline underline-offset-4"
            >
              {t.krishidukan_cta} <Icons.ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
