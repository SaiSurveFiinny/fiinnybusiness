import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';

/**
 * Case study detail page — /farmer-success/case-study/:slug. Mirrors
 * StoryDetailPage.tsx's structure (hero, conditional sections, related
 * items, BreadcrumbList + Article JSON-LD), with a PDF download link
 * distinct to this content type.
 */
export default function CaseStudyDetailPage() {
  const { caseStudySlug } = useParams<{ caseStudySlug: string }>();
  const { caseStudies, isLoading } = useFarmerSuccessData();

  const caseStudy = caseStudies.find((c) => c.slug === caseStudySlug);
  const relatedCaseStudies = caseStudy ? caseStudies.filter((c) => c.id !== caseStudy.id).slice(0, 3) : [];

  const seoTitle = caseStudy?.seo.metaTitle || (caseStudy ? `${caseStudy.title} | Farmer Success | Karan Arjun Pvt. Ltd.` : 'Farmer Success');
  const seoDescription = caseStudy?.seo.metaDescription || caseStudy?.summary;

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    keywords: caseStudy?.seo.keywords,
    ogImage: caseStudy?.seo.ogImage || caseStudy?.coverImage,
    structuredData: caseStudy
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Farmer Success', item: `${window.location.origin}/farmer-success` },
              { '@type': 'ListItem', position: 2, name: caseStudy.title, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: caseStudy.title,
            description: caseStudy.summary,
            image: caseStudy.coverImage || undefined,
            datePublished: caseStudy.publishDate || undefined,
            publisher: { '@type': 'Organization', name: 'Karan Arjun Pvt. Ltd.' },
          },
        ]
      : [],
  });

  if (!isLoading && !caseStudy) {
    return <Navigate to="/farmer-success" replace />;
  }

  if (!caseStudy) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      {/* Hero */}
      <section className="relative min-h-[45vh] flex items-end overflow-hidden">
        {caseStudy.coverImage ? (
          <img src={caseStudy.coverImage} alt={caseStudy.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />

        <div className="relative z-10 w-full max-w-4xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/farmer-success" className="hover:text-white transition-colors">Farmer Success</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Case Study</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white leading-tight">{caseStudy.title}</h1>
        </div>
      </section>

      <div className="relative z-10 bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8 flex flex-col gap-10">
          {caseStudy.summary && (
            <p className="font-serif text-xl text-primary leading-relaxed">{caseStudy.summary}</p>
          )}

          {caseStudy.pdfUrl && (
            <a
              href={caseStudy.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border border-primary/20 rounded-lg font-sans font-bold text-sm text-primary hover:bg-primary/5 transition-colors w-fit"
            >
              <Icons.Download className="w-4 h-4" /> Download Full Report (PDF)
            </a>
          )}

          {caseStudy.fullArticle && (
            <p className="font-serif text-base text-on-surface-variant leading-relaxed whitespace-pre-line">{caseStudy.fullArticle}</p>
          )}

          {caseStudy.relatedCrops.length > 0 && (
            <div>
              <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">Related Crops</span>
              <div className="flex flex-wrap gap-2">
                {caseStudy.relatedCrops.map((crop) => (
                  <span key={crop} className="px-3 py-1.5 border border-slate-200 rounded-full text-xs font-sans font-semibold text-primary">{crop}</span>
                ))}
              </div>
            </div>
          )}

          {caseStudy.gallery.length > 0 && (
            <div>
              <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-4 block">Gallery</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {caseStudy.gallery.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="relative rounded-lg overflow-hidden aspect-[4/3]">
                    <img src={url} alt={`${caseStudy.title} gallery ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Case Studies */}
      {relatedCaseStudies.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">Related Case Studies</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedCaseStudies.map((related) => (
                <Link key={related.id} to={`/farmer-success/case-study/${related.slug}`} className="group bg-white rounded-lg overflow-hidden border border-slate-200 hover:shadow-md transition-shadow">
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
