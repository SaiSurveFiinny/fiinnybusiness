import { useLanguage } from '../../context/LanguageContext';

/**
 * "Technology & Digital Agriculture" — light split layout (content-left,
 * screenshot-right), mirroring SustainableFarming.tsx's structure directly
 * below it on the page. Uses the same real KrishiDukan screenshot as
 * components/home/KrishiDukanShowcase.tsx rather than a second, different
 * visual, since this subsection is explaining the same verified platform,
 * not introducing a different one. Copy is fully translated (t.wwd_*),
 * matching every other section already on this page.
 */
export function TechnologyDigitalAgriculture() {
  const { t } = useLanguage();

  const points = [t.wwd_technology_point1, t.wwd_technology_point2, t.wwd_technology_point3, t.wwd_technology_point4];

  return (
    <section className="relative z-10 bg-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center px-8 md:px-16 py-16">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4">
            {t.wwd_technology_label}
          </span>
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-6 leading-tight">
            {t.wwd_technology_title}
          </h2>
          <p className="font-serif text-lg text-on-surface-variant leading-relaxed max-w-lg mb-8">
            {t.wwd_technology_body}
          </p>
          <ul className="flex flex-col gap-3 max-w-lg">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-sm text-on-surface-variant font-sans leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-center bg-surface-container px-8 py-12 lg:px-12">
          <img
            src="/krishidukan/krishidukan-mobile-screenshot.png"
            alt="KrishiDukan mobile app — home screen showing product categories and trending agri products"
            className="w-full h-auto max-w-md"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
