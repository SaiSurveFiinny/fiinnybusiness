import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

interface WhyChooseUsProps {
  titleLine1?: string;
  titleLine2?: string;
  subtitle?: string;
}

/**
 * Extracted from the original single-product homepage's "Benefits Bento" section.
 * Content is currently Power Plus-specific (drought/quality/disease/root/freshness) —
 * reused verbatim here as the company's proof-of-quality section until broader,
 * multi-product "why choose us" copy is written.
 */
export function WhyChooseUs({ titleLine1, titleLine2, subtitle }: WhyChooseUsProps) {
  const { t } = useLanguage();

  return (
    <section className="py-24 relative z-10">
      <div className="max-w-7xl mx-auto px-8 relative">
        <div className="text-center mb-20">
          <h2 className="font-sans text-4xl md:text-5xl font-extrabold text-primary mb-6 tracking-tight">
            {titleLine1 ?? t.benefits_title_line1}<br/> {titleLine2 ?? t.benefits_title_line2}
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto text-lg">{subtitle ?? t.benefits_subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-auto">
          <div className="md:col-span-8 glass-panel rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden group flex flex-col justify-end min-h-[350px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(10,25,19,0.12)] hover:border-white/60">
            <img
              src="https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1400&q=80"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 opacity-[0.34] pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-white/42 via-white/28 to-white/52 pointer-events-none" />
            <div className="absolute top-6 right-6 md:top-10 md:right-10 w-16 h-16 md:w-20 md:h-20 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg z-10 text-primary group-hover:scale-110 transition-transform duration-500">
              <Icons.Droplets className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <div className="z-10 relative max-w-lg">
              <h3 className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-3">{t.drought_title}</h3>
              <p className="text-on-surface-variant text-base md:text-lg leading-relaxed">{t.drought_desc}</p>
            </div>
            <div className="absolute -bottom-20 -right-20 w-[500px] h-[500px] bg-primary-container/10 rounded-full blur-3xl group-hover:bg-primary-container/20 transition-colors duration-700"></div>
          </div>

          <div className="md:col-span-4 glass-panel rounded-[2.5rem] p-8 md:p-10 flex flex-col relative overflow-hidden min-h-[250px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(10,25,19,0.12)] hover:border-white/60 group">
            <img
              src="https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&w=1200&q=80"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 opacity-[0.34] pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/42 via-white/28 to-white/52 pointer-events-none" />
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg mb-6 text-primary group-hover:rotate-12 transition-transform duration-500 relative z-10">
              <Icons.Palette className="w-7 h-7 md:w-8 md:h-8" />
            </div>
            <h3 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-3 relative z-10">{t.quality_title}</h3>
            <p className="text-on-surface-variant text-base relative z-10">{t.quality_desc}</p>
          </div>

          <div className="md:col-span-4 glass-panel rounded-[2.5rem] p-8 md:p-10 flex flex-col relative overflow-hidden min-h-[250px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(10,25,19,0.12)] hover:border-white/60 group">
            <img
              src="https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1200&q=80"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 opacity-[0.34] pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/42 via-white/28 to-white/52 pointer-events-none" />
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg mb-6 text-primary group-hover:-rotate-12 transition-transform duration-500 relative z-10">
              <Icons.ShieldCheck className="w-7 h-7 md:w-8 md:h-8" />
            </div>
            <h3 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-3 relative z-10">{t.disease_title}</h3>
            <p className="text-on-surface-variant text-base relative z-10">{t.disease_desc}</p>
          </div>

          <div className="md:col-span-4 glass-panel rounded-[2.5rem] p-8 md:p-10 flex flex-col relative overflow-hidden min-h-[250px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(10,25,19,0.12)] hover:border-white/60 group">
            <img
              src="https://images.unsplash.com/photo-1461354464878-ad92f492a5a0?auto=format&fit=crop&w=1200&q=80"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 opacity-[0.34] pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/42 via-white/28 to-white/52 pointer-events-none" />
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg mb-6 text-primary group-hover:rotate-12 transition-transform duration-500 relative z-10">
              <Icons.Sprout className="w-7 h-7 md:w-8 md:h-8" />
            </div>
            <h3 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-3 relative z-10">{t.root_title}</h3>
            <p className="text-on-surface-variant text-base relative z-10">{t.root_desc}</p>
          </div>

          <div className="md:col-span-4 glass-panel rounded-[2.5rem] p-8 md:p-10 flex flex-col relative overflow-hidden min-h-[250px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(10,25,19,0.12)] hover:border-white/60 group">
            <img
              src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 opacity-[0.34] pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/42 via-white/28 to-white/52 pointer-events-none" />
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg mb-6 text-primary group-hover:-rotate-12 transition-transform duration-500 relative z-10">
              <Icons.Calendar className="w-7 h-7 md:w-8 md:h-8" />
            </div>
            <h3 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-3 relative z-10">{t.freshness_title}</h3>
            <p className="text-on-surface-variant text-base relative z-10">{t.freshness_desc}</p>
          </div>

          <div className="md:col-span-12 glass-panel-dark rounded-[2.5rem] p-10 md:p-12 text-white flex items-center justify-between overflow-hidden relative group transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(10,25,19,0.3)] hover:border-secondary/30 mt-4">
            <div className="z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-secondary-container border border-white/10 mb-6">
                <Icons.Star className="w-4 h-4" />
                <span className="font-sans font-bold text-xs uppercase tracking-widest">{t.cta_badge}</span>
              </div>
              <h3 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-4 leading-tight">{t.cta_title}</h3>
              <p className="text-white/80 mb-8 font-serif text-lg">{t.cta_desc}</p>
              <a
                href="https://wa.me/919307199040"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-secondary-container text-on-secondary-container px-8 py-4 rounded-xl font-sans font-bold hover:bg-white transition-colors inline-flex items-center space-x-2 shadow-xl"
              >
                <span>{t.cta_button}</span>
                <Icons.ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl mix-blend-overlay"></div>
            <Icons.Sprout className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 w-80 h-80 text-white/5 group-hover:rotate-12 transition-transform duration-700" />
          </div>
        </div>
      </div>
    </section>
  );
}
