import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** Announcement detail page — /resources/announcements/:slug. Mirrors NewsDetailPage.tsx. */
export default function AnnouncementDetailPage() {
  const { announcementSlug } = useParams<{ announcementSlug: string }>();
  const { announcements, isLoading } = useResourcesData();

  const item = announcements.find((a) => a.slug === announcementSlug);

  usePageSeo({
    title: item?.seo.metaTitle || (item ? `${item.title} | Resources | Karan Arjun Pvt. Ltd.` : 'Resources'),
    description: item?.seo.metaDescription || item?.message,
    keywords: item?.seo.keywords,
    ogImage: item?.seo.ogImage || item?.coverImage,
    structuredData: item
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Resources', item: `${window.location.origin}/resources` },
              { '@type': 'ListItem', position: 2, name: 'Announcements', item: `${window.location.origin}/resources/announcements` },
              { '@type': 'ListItem', position: 3, name: item.title, item: window.location.href },
            ],
          },
        ]
      : [],
  });

  if (!isLoading && !item) return <Navigate to="/resources/announcements" replace />;
  if (!item) return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;

  return (
    <div className="flex flex-col relative min-h-screen">
      <div className="bg-primary py-8">
        <div className="max-w-3xl mx-auto px-8">
          <nav className="flex items-center gap-2 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to="/resources/announcements" className="hover:text-white transition-colors">Announcements</Link>
          </nav>
        </div>
      </div>

      <div className="bg-white py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-8">
          {item.coverImage && <img src={item.coverImage} alt={item.title} className="w-full aspect-[16/9] object-cover rounded-lg mb-8" />}
          <h1 className="font-sans text-2xl md:text-[32px] font-extrabold text-primary mb-3">{item.title}</h1>
          {item.publishDate && <p className="text-sm text-slate-500 font-sans font-medium mb-8">{new Date(item.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
          <p className="font-serif text-base text-on-surface-variant leading-relaxed whitespace-pre-line">{item.message}</p>
        </div>
      </div>
    </div>
  );
}
