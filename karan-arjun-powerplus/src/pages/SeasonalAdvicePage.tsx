import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** Seasonal Advice — /resources/seasonal-advice. Card grid, no detail route since entries are short-form guidance blocks. */
export default function SeasonalAdvicePage() {
  const { seasonalAdvice, isLoading } = useResourcesData();

  usePageSeo({
    title: 'Seasonal Advice | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Guidance for the current growing season.',
  });

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Seasonal Advice</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">Seasonal Advice</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
            Guidance tailored to the current season and crop.
          </p>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading seasonal advice...</p>}
          {!isLoading && seasonalAdvice.length === 0 && <p className="font-sans text-sm text-primary/60">No seasonal advice published yet.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {seasonalAdvice.map((advice) => (
              <div key={advice.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {advice.coverImage && <img src={advice.coverImage} alt={advice.title} className="w-full aspect-[4/3] object-cover" />}
                <div className="p-6">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-sans font-bold uppercase tracking-wide text-secondary mb-2">
                    {advice.season && <span>{advice.season}</span>}
                    {advice.crop && <span className="text-slate-400">{advice.crop}</span>}
                  </div>
                  <h3 className="font-sans text-lg font-bold text-primary mb-2">{advice.title}</h3>
                  <p className="text-sm text-on-surface-variant font-serif leading-relaxed">{advice.advice}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
