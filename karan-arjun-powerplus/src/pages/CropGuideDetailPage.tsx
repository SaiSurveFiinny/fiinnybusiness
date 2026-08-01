import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** Crop Guide detail page — /resources/guides/:slug. Mirrors CaseStudyDetailPage.tsx (PDF download link, Article JSON-LD). */
export default function CropGuideDetailPage() {
  const { guideSlug } = useParams<{ guideSlug: string }>();
  const { cropGuides, isLoading } = useResourcesData();

  const guide = cropGuides.find((g) => g.slug === guideSlug);
  const relatedGuides = guide ? cropGuides.filter((g) => g.id !== guide.id && g.crop === guide.crop).slice(0, 3) : [];

  usePageSeo({
    title: guide?.seo.metaTitle || (guide ? `${guide.title} | Resources | Karan Arjun Pvt. Ltd.` : 'Resources'),
    description: guide?.seo.metaDescription || guide?.excerpt,
    keywords: guide?.seo.keywords,
    ogImage: guide?.seo.ogImage || guide?.coverImage,
    structuredData: guide
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Resources', item: `${window.location.origin}/resources` },
              { '@type': 'ListItem', position: 2, name: 'Crop Guides', item: `${window.location.origin}/resources/guides` },
              { '@type': 'ListItem', position: 3, name: guide.title, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.excerpt,
            image: guide.coverImage || undefined,
            datePublished: guide.publishDate || undefined,
            publisher: { '@type': 'Organization', name: 'Karan Arjun Pvt. Ltd.' },
          },
        ]
      : [],
  });

  if (!isLoading && !guide) return <Navigate to="/resources/guides" replace />;
  if (!guide) return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative min-h-[45vh] flex items-end overflow-hidden">
        {guide.coverImage ? (
          <img src={guide.coverImage} alt={guide.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />
        <div className="relative z-10 w-full max-w-3xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to="/resources/guides" className="hover:text-white transition-colors">Crop Guides</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{guide.title}</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4 leading-tight">{guide.title}</h1>
          {guide.crop && <p className="text-sm text-white/70 font-sans font-medium">{guide.crop}</p>}
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8 flex flex-col gap-8">
          {guide.excerpt && <p className="font-serif text-xl text-primary leading-relaxed">{guide.excerpt}</p>}

          {guide.pdfUrl && (
            <a href={guide.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 border border-primary/20 rounded-lg font-sans font-bold text-sm text-primary hover:bg-primary/5 transition-colors w-fit">
              <Icons.Download className="w-4 h-4" /> Download Guide (PDF)
            </a>
          )}

          {guide.content && <p className="font-serif text-base text-on-surface-variant leading-relaxed whitespace-pre-line">{guide.content}</p>}
        </div>
      </div>

      {relatedGuides.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">Related Guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedGuides.map((related) => (
                <Link key={related.id} to={`/resources/guides/${related.slug}`} className="group bg-white rounded-lg overflow-hidden border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="aspect-[16/10] relative overflow-hidden bg-primary/5">
                    {related.coverImage && <img src={related.coverImage} alt={related.title} className="absolute inset-0 w-full h-full object-cover" />}
                  </div>
                  <div className="p-5">
                    <h3 className="font-sans font-bold text-primary group-hover:underline underline-offset-4">{related.title}</h3>
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
