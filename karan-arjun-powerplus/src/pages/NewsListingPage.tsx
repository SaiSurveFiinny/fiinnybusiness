import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** News listing — /resources/news. Mirrors ArticleListingPage.tsx. */
export default function NewsListingPage() {
  const { news, isLoading } = useResourcesData();

  usePageSeo({
    title: 'News | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Company and industry news from Karan Arjun Pvt. Ltd.',
  });

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">News</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">News</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
            Company and industry updates.
          </p>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading news...</p>}
          {!isLoading && news.length === 0 && <p className="font-sans text-sm text-primary/60">No news published yet.</p>}

          <div className="flex flex-col divide-y divide-primary/10">
            {news.map((item) => (
              <Link key={item.id} to={`/resources/news/${item.slug}`} className="group py-7 flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                <div className="flex-1 min-w-0">
                  <h2 className="font-sans text-lg font-bold text-primary mb-1.5 group-hover:underline underline-offset-4">{item.title}</h2>
                  {item.publishDate && <p className="text-[13px] text-slate-500 font-sans font-medium mb-2">{new Date(item.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  {item.excerpt && <p className="text-sm text-on-surface-variant font-serif leading-relaxed max-w-2xl line-clamp-2">{item.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
