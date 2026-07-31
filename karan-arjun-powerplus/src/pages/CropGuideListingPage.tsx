import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** Crop Guide listing — /resources/guides. Mirrors ArticleListingPage.tsx. */
export default function CropGuideListingPage() {
  const { cropGuides, isLoading } = useResourcesData();

  usePageSeo({
    title: 'Crop Guides | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Practical, crop-specific guidance for Indian farming conditions.',
  });

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Crop Guides</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">Crop Guides</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
            Practical, crop-specific guidance for Indian farming conditions.
          </p>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading crop guides...</p>}
          {!isLoading && cropGuides.length === 0 && <p className="font-sans text-sm text-primary/60">No crop guides published yet.</p>}

          <div className="flex flex-col divide-y divide-primary/10">
            {cropGuides.map((guide) => (
              <Link key={guide.id} to={`/resources/guides/${guide.slug}`} className="group py-7 flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h2 className="font-sans text-lg font-bold text-primary group-hover:underline underline-offset-4">{guide.title}</h2>
                    {guide.featured && <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-secondary">Featured</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 font-sans font-medium mb-2">
                    {guide.crop && <span>{guide.crop}</span>}
                    {guide.publishDate && <span>{new Date(guide.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                  {guide.excerpt && <p className="text-sm text-on-surface-variant font-serif leading-relaxed max-w-2xl line-clamp-2">{guide.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
