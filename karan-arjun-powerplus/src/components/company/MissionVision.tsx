import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/** Two-column mission/vision — dark band, concise factual statements. */
export function MissionVision() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 bg-primary py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-8 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
        <div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-secondary-container mb-6">
            <Icons.ArrowRight className="w-6 h-6" />
          </div>
          <h2 className="font-sans text-2xl md:text-3xl font-extrabold text-white mb-4">{t.mission_title}</h2>
          <p className="font-serif text-white/70 leading-relaxed">{t.mission_body}</p>
        </div>
        <div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-secondary-container mb-6">
            <Icons.Star className="w-6 h-6" />
          </div>
          <h2 className="font-sans text-2xl md:text-3xl font-extrabold text-white mb-4">{t.vision_title}</h2>
          <p className="font-serif text-white/70 leading-relaxed">{t.vision_body}</p>
        </div>
      </div>
    </section>
  );
}
