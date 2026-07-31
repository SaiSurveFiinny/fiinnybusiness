import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** News detail page — /resources/news/:slug. Mirrors ArticleDetailPage.tsx. */
export default function NewsDetailPage() {
  const { newsSlug } = useParams<{ newsSlug: string }>();
  const { news, isLoading } = useResourcesData();

  const item = news.find((n) => n.slug === newsSlug);

  usePageSeo({
    title: item?.seo.metaTitle || (item ? `${item.title} | Resources | Karan Arjun Pvt. Ltd.` : 'Resources'),
    description: item?.seo.metaDescription || item?.excerpt,
    keywords: item?.seo.keywords,
    ogImage: item?.seo.ogImage || item?.coverImage,
    structuredData: item
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Resources', item: `${window.location.origin}/resources` },
              { '@type': 'ListItem', position: 2, name: 'News', item: `${window.location.origin}/resources/news` },
              { '@type': 'ListItem', position: 3, name: item.title, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: item.title,
            description: item.excerpt,
            image: item.coverImage || undefined,
            datePublished: item.publishDate || undefined,
            publisher: { '@type': 'Organization', name: 'Karan Arjun Pvt. Ltd.' },
          },
        ]
      : [],
  });

  if (!isLoading && !item) return <Navigate to="/resources/news" replace />;
  if (!item) return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;

  return (
    <div className="flex flex-col relative min-h-screen">
      <div className="bg-primary py-8">
        <div className="max-w-3xl mx-auto px-8">
          <nav className="flex items-center gap-2 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to="/resources/news" className="hover:text-white transition-colors">News</Link>
          </nav>
        </div>
      </div>

      <div className="bg-white py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-8">
          {item.coverImage && <img src={item.coverImage} alt={item.title} className="w-full aspect-[16/9] object-cover rounded-lg mb-8" />}
          <h1 className="font-sans text-2xl md:text-[32px] font-extrabold text-primary mb-3">{item.title}</h1>
          {item.publishDate && <p className="text-sm text-slate-500 font-sans font-medium mb-8">{new Date(item.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
          {item.content && <p className="font-serif text-base text-on-surface-variant leading-relaxed whitespace-pre-line">{item.content}</p>}
        </div>
      </div>
    </div>
  );
}
