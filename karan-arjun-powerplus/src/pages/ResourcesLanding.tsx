import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';
import type { ResourceFeedItem } from '../data/resources';

interface ResourceTypeCard {
  label: string;
  description: string;
  href: string;
  count: number;
}

/**
 * Resources landing page — the enterprise knowledge-center entry point
 * that replaces the /resources PlaceholderPage. Sections: Hero -> Featured
 * Resource -> Browse by Resource Type -> Latest Resources (mixed
 * chronological feed) -> Search. Editorial, content-first layout matching
 * the spacing/typography conventions established in CareerLanding.tsx and
 * FarmerSuccessLanding.tsx (result-first ordering, restrained typography,
 * no icons, no decorative cards).
 */
export default function ResourcesLanding() {
  const { blogs, articles, cropGuides, downloads, faqs, seasonalAdvice, videos, news, announcements, isLoading } = useResourcesData();
  const [searchTerm, setSearchTerm] = useState('');

  usePageSeo({
    title: 'Resources | Karan Arjun Pvt. Ltd.',
    description: 'A knowledge center for farmers — blogs, articles, crop guides, downloads, FAQs, seasonal advice, videos, news, and announcements.',
  });

  const typeCards: ResourceTypeCard[] = [
    { label: 'Blogs', description: 'Agricultural insights and field advice.', href: '/resources/blogs', count: blogs.length },
    { label: 'Articles', description: 'In-depth editorial coverage.', href: '/resources/articles', count: articles.length },
    { label: 'Crop Guides', description: 'Practical, crop-specific guidance.', href: '/resources/guides', count: cropGuides.length },
    { label: 'Downloads', description: 'Guides and reference documents.', href: '/resources/downloads', count: downloads.length },
    { label: 'Videos', description: 'Field visits and demonstrations.', href: '/resources/videos', count: videos.length },
    { label: 'News', description: 'Company and industry updates.', href: '/resources/news', count: news.length },
    { label: 'FAQs', description: 'Answers to common questions.', href: '/resources/faqs', count: faqs.length },
    { label: 'Seasonal Advice', description: 'Guidance for the current season.', href: '/resources/seasonal-advice', count: seasonalAdvice.length },
    { label: 'Announcements', description: 'Time-sensitive updates.', href: '/resources/announcements', count: announcements.length },
  ];

  const latestFeed: ResourceFeedItem[] = useMemo(() => {
    const items: ResourceFeedItem[] = [
      ...blogs.map((b) => ({ kind: 'blog' as const, id: b.id, title: b.title, excerpt: b.excerpt, coverImage: b.imageUrls?.[0] ?? '', date: b.date, href: '/resources/blogs' })),
      ...articles.map((a) => ({ kind: 'article' as const, id: a.id, title: a.title, excerpt: a.excerpt, coverImage: a.coverImage, date: a.publishDate, href: `/resources/articles/${a.slug}` })),
      ...cropGuides.map((g) => ({ kind: 'guide' as const, id: g.id, title: g.title, excerpt: g.excerpt, coverImage: g.coverImage, date: g.publishDate, href: `/resources/guides/${g.slug}` })),
      ...news.map((n) => ({ kind: 'news' as const, id: n.id, title: n.title, excerpt: n.excerpt, coverImage: n.coverImage, date: n.publishDate, href: `/resources/news/${n.slug}` })),
      ...announcements.map((a) => ({ kind: 'announcement' as const, id: a.id, title: a.title, excerpt: a.message, coverImage: a.coverImage, date: a.publishDate, href: `/resources/announcements/${a.slug}` })),
    ];
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
  }, [blogs, articles, cropGuides, news, announcements]);

  const searchResults: ResourceFeedItem[] = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    const all: ResourceFeedItem[] = [
      ...blogs.map((b) => ({ kind: 'blog' as const, id: b.id, title: b.title, excerpt: b.excerpt, coverImage: b.imageUrls?.[0] ?? '', date: b.date, href: '/resources/blogs' })),
      ...articles.map((a) => ({ kind: 'article' as const, id: a.id, title: a.title, excerpt: a.excerpt, coverImage: a.coverImage, date: a.publishDate, href: `/resources/articles/${a.slug}` })),
      ...cropGuides.map((g) => ({ kind: 'guide' as const, id: g.id, title: g.title, excerpt: g.excerpt, coverImage: g.coverImage, date: g.publishDate, href: `/resources/guides/${g.slug}` })),
      ...news.map((n) => ({ kind: 'news' as const, id: n.id, title: n.title, excerpt: n.excerpt, coverImage: n.coverImage, date: n.publishDate, href: `/resources/news/${n.slug}` })),
      ...faqs.map((f) => ({ kind: 'faq' as const, id: f.id, title: f.question, excerpt: f.answer, coverImage: '', date: '', href: '/resources/faqs' })),
    ];
    return all.filter((item) => item.title.toLowerCase().includes(term) || item.excerpt.toLowerCase().includes(term)).slice(0, 10);
  }, [searchTerm, blogs, articles, cropGuides, news, faqs]);

  const featuredResource = latestFeed[0];

  return (
    <div className="flex flex-col relative">
      {/* Hero */}
      <section className="relative bg-primary py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-8">
          <span className="inline-block font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary-container mb-5">
            Knowledge Centre
          </span>
          <h1 className="font-sans text-[28px] md:text-[42px] lg:text-5xl font-extrabold leading-[1.15] mb-5 text-white max-w-2xl">
            Resources
          </h1>
          <p className="font-serif text-base md:text-lg text-white/75 max-w-xl leading-relaxed mb-10">
            Agricultural knowledge, field guidance, and company updates — everything a farmer needs in one place.
          </p>
          <div className="max-w-lg">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search resources..."
              className="w-full px-4 py-3 rounded-lg bg-white/95 text-sm font-sans focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="mt-2 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
                {searchResults.map((item) => (
                  <Link
                    key={`${item.kind}-${item.id}`}
                    to={item.href}
                    onClick={() => setSearchTerm('')}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    <span className="font-sans text-sm font-semibold text-primary truncate">{item.title}</span>
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wide text-slate-400 shrink-0">{item.kind}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {isLoading && <div className="py-24 text-center font-sans text-sm text-primary/60">Loading resources...</div>}

      {/* Featured Resource */}
      {featuredResource && (
        <section className="relative z-10 bg-white py-20 md:py-28">
          <div className="max-w-5xl mx-auto px-8">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-6 block">Featured</span>
            <Link to={featuredResource.href} className="group grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div className="relative rounded-lg overflow-hidden aspect-[4/3] bg-primary/5">
                {featuredResource.coverImage && <img src={featuredResource.coverImage} alt={featuredResource.title} className="absolute inset-0 w-full h-full object-cover" />}
              </div>
              <div>
                <span className="text-[10px] font-sans font-bold uppercase tracking-wide text-slate-400 mb-3 block">{featuredResource.kind}</span>
                <h2 className="font-sans text-2xl md:text-[32px] font-extrabold text-primary mb-4 leading-tight group-hover:underline underline-offset-4">{featuredResource.title}</h2>
                {featuredResource.excerpt && <p className="text-on-surface-variant font-serif text-base leading-relaxed max-w-md line-clamp-3">{featuredResource.excerpt}</p>}
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Browse by Resource Type */}
      <section className="relative z-10 bg-surface py-20 md:py-28 border-t border-primary/5">
        <div className="max-w-5xl mx-auto px-8">
          <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight mb-12">Browse by Resource Type</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {typeCards.map((card) => (
              <Link key={card.label} to={card.href} className="group bg-white rounded-lg border border-slate-200 hover:shadow-md transition-shadow p-6 flex flex-col">
                <h3 className="font-sans text-lg font-bold text-primary mb-2 group-hover:underline underline-offset-4">{card.label}</h3>
                <p className="text-sm text-on-surface-variant font-serif leading-relaxed mb-4 flex-1">{card.description}</p>
                <div className="flex items-center justify-between text-xs font-sans font-medium text-slate-400">
                  <span>{card.count} item{card.count === 1 ? '' : 's'}</span>
                  <span className="font-bold text-primary group-hover:underline underline-offset-4">View section</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Resources */}
      {latestFeed.length > 0 && (
        <section className="relative z-10 bg-white py-20 md:py-28 border-t border-primary/5">
          <div className="max-w-4xl mx-auto px-8">
            <div className="flex items-baseline justify-between gap-6 mb-10 pb-6 border-b border-primary/10">
              <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight">Latest Resources</h2>
            </div>
            <div className="flex flex-col divide-y divide-primary/10">
              {latestFeed.map((item) => (
                <Link key={`${item.kind}-${item.id}`} to={item.href} className="group py-7 flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-sans font-bold uppercase tracking-wide text-slate-400">{item.kind}</span>
                      {item.date && <span className="text-[10px] font-sans text-slate-300">· {item.date}</span>}
                    </div>
                    <h3 className="font-sans text-lg font-bold text-primary mb-1.5 group-hover:underline underline-offset-4">{item.title}</h3>
                    {item.excerpt && <p className="text-sm text-on-surface-variant font-serif leading-relaxed max-w-2xl line-clamp-2">{item.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
