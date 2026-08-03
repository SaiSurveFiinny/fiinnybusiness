import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { db } from '../lib/firebase';
import { usePageSeo } from '../hooks/usePageSeo';
import { useCropSolutions } from '../hooks/useCropSolutions';
import type { Product } from '../data/mockData';

const severityColor: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
};

function useProductsById() {
  const [products, setProducts] = useState<Record<string, Product>>({});
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const map: Record<string, Product> = {};
      snapshot.docs.forEach((docItem) => {
        const data = docItem.data();
        map[docItem.id] = {
          id: docItem.id,
          name: String(data.name ?? 'Untitled Product'),
          desc: String(data.desc ?? ''),
          numericPrice: Number(data.numericPrice ?? data.price ?? 0),
          price: typeof data.price === 'string' ? data.price : `₹${Number(data.numericPrice ?? 0).toLocaleString('en-IN')}`,
          image: String(data.image ?? '/bottle-1l-Photoroom.png'),
          badge: data.badge ? String(data.badge) : undefined,
          featured: Boolean(data.featured),
        };
      });
      setProducts(map);
    });
    return () => unsubscribe();
  }, []);
  return products;
}

function ProductChips({ ids, products }: { ids: string[]; products: Record<string, Product> }) {
  const items = ids.map((id) => products[id]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {items.map((p) => (
        <Link
          key={p.id}
          to="/shop"
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/5 text-primary rounded-full text-xs font-sans font-semibold hover:bg-primary/10 transition-colors"
        >
          <Icons.Box className="w-3.5 h-3.5" /> {p.name}
        </Link>
      ))}
    </div>
  );
}

function toYouTubeEmbedUrl(url: string) {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  const shortLinkMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortLinkMatch) return `https://www.youtube.com/embed/${shortLinkMatch[1]}`;
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  return '';
}

/**
 * Crop detail page — /crop-solutions/:categorySlug/:cropSlug. Reads from the
 * same crops/cropCategories collections the Admin CropEditor writes to.
 * Structured as an editorial knowledge-portal page (hero, overview,
 * problems, practices, products, guides, videos, FAQ, related crops), each
 * section rendered conditionally so an incomplete crop entry never shows
 * empty headings.
 */
export default function CropDetailPage() {
  const { categorySlug, cropSlug } = useParams<{ categorySlug: string; cropSlug: string }>();
  const { categories, crops, isLoading } = useCropSolutions();
  const products = useProductsById();

  const category = categories.find((c) => c.slug === categorySlug);
  const crop = category ? crops.find((c) => c.categoryId === category.id && c.slug === cropSlug) : undefined;
  const relatedCrops = crop
    ? crop.relatedCropIds.map((id) => crops.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c))
    : [];

  const seoTitle = crop?.seo.metaTitle || (crop ? `${crop.name} | Crop Solutions | Karan Arjun Pvt. Ltd.` : 'Crop Solutions');
  const seoDescription = crop?.seo.metaDescription || crop?.shortDescription;

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    keywords: crop?.seo.keywords,
    ogImage: crop?.seo.ogImage || crop?.heroImage,
    canonicalUrl: crop?.seo.canonicalUrl,
    structuredData: crop
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Crop Solutions', item: `${window.location.origin}/crop-solutions` },
              { '@type': 'ListItem', position: 2, name: category?.name, item: `${window.location.origin}/crop-solutions/${category?.slug}` },
              { '@type': 'ListItem', position: 3, name: crop.name, item: window.location.href },
            ],
          },
          ...(crop.faqs.length > 0
            ? [{
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: crop.faqs.map((faq) => ({
                  '@type': 'Question',
                  name: faq.question,
                  acceptedAnswer: { '@type': 'Answer', text: faq.answer },
                })),
              }]
            : []),
        ]
      : [],
  });

  if (!isLoading && (!category || !crop)) {
    return <Navigate to="/crop-solutions" replace />;
  }

  if (!crop || !category) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      {/* Hero */}
      <section className="relative min-h-[55vh] flex items-end overflow-hidden">
        {crop.heroImage ? (
          <img src={crop.heroImage} alt={crop.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/crop-solutions" className="hover:text-white transition-colors">Crop Solutions</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to={`/crop-solutions/${category.slug}`} className="hover:text-white transition-colors">{category.name}</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{crop.name}</span>
          </nav>
          <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-white mb-3">{crop.name}</h1>
          {crop.scientificName && <p className="italic font-serif text-white/60 mb-4">{crop.scientificName}</p>}
          {crop.shortDescription && <p className="font-serif text-base md:text-lg text-white/80 max-w-2xl">{crop.shortDescription}</p>}
        </div>
      </section>

      {/* Overview */}
      {(crop.longOverview || crop.climate || crop.soil || crop.season || crop.regions) && (
        <section className="relative z-10 bg-surface py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4 block">Overview</span>
              <p className="font-serif text-xl text-primary leading-relaxed">{crop.longOverview}</p>
            </div>
            <div className="grid grid-cols-2 gap-6 content-start">
              {crop.climate && (
                <div className="p-5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1.5">Climate</p>
                  <p className="font-sans font-bold text-primary text-sm">{crop.climate}</p>
                </div>
              )}
              {crop.soil && (
                <div className="p-5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1.5">Soil</p>
                  <p className="font-sans font-bold text-primary text-sm">{crop.soil}</p>
                </div>
              )}
              {crop.season && (
                <div className="p-5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1.5">Season</p>
                  <p className="font-sans font-bold text-primary text-sm">{crop.season}</p>
                </div>
              )}
              {crop.regions && (
                <div className="p-5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1.5">Regions</p>
                  <p className="font-sans font-bold text-primary text-sm">{crop.regions}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Common Problems */}
      {crop.problems.length > 0 && (
        <section className="relative z-10 bg-primary py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-8 mb-12">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary-container mb-4 block">Common Problems</span>
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white">What to Watch For</h2>
          </div>
          <div className="max-w-6xl mx-auto px-8 flex flex-col gap-6">
            {crop.problems.sort((a, b) => a.order - b.order).map((problem) => (
              <div key={problem.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6">
                {problem.image && (
                  <img src={problem.image} alt={problem.title} className="w-full md:w-48 h-40 md:h-auto object-cover rounded-xl shrink-0" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-sans text-xl font-extrabold text-white">{problem.title}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider ${severityColor[problem.severity]}`}>
                      {problem.severity}
                    </span>
                  </div>
                  {problem.symptoms && <p className="text-white/70 text-sm mb-2"><span className="font-bold text-white/90">Symptoms: </span>{problem.symptoms}</p>}
                  {problem.causes && <p className="text-white/70 text-sm mb-2"><span className="font-bold text-white/90">Causes: </span>{problem.causes}</p>}
                  {problem.solution && <p className="text-white/70 text-sm"><span className="font-bold text-white/90">Solution: </span>{problem.solution}</p>}
                  <ProductChips ids={problem.productIds} products={products} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Practices */}
      {crop.practices.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-8 text-center mb-14">
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">Recommended Practices</h2>
          </div>
          <div className="max-w-6xl mx-auto px-8 flex flex-col gap-16 md:gap-24">
            {crop.practices.sort((a, b) => a.order - b.order).map((practice, index) => {
              const isEven = index % 2 === 0;
              const guide = crop.guides.find((g) => g.id === practice.guideId);
              return (
                <div key={practice.id} className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-10 md:gap-16`}>
                  <div className="w-full md:w-1/2">
                    <div className="relative rounded-[2.5rem] overflow-hidden aspect-[4/3] bg-primary/5">
                      {practice.image && <img src={practice.image} alt={practice.title} className="absolute inset-0 w-full h-full object-cover" />}
                    </div>
                  </div>
                  <div className="w-full md:w-1/2">
                    <div className="flex gap-2 mb-4">
                      {practice.stage && <span className="px-3 py-1 bg-primary/5 text-primary rounded-full text-xs font-sans font-bold uppercase tracking-wider">{practice.stage}</span>}
                      {practice.season && <span className="px-3 py-1 border border-primary/15 text-primary rounded-full text-xs font-sans font-bold uppercase tracking-wider">{practice.season}</span>}
                    </div>
                    <h3 className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-4">{practice.title}</h3>
                    <p className="text-on-surface-variant font-serif text-base md:text-lg leading-relaxed">{practice.description}</p>
                    <ProductChips ids={practice.productIds} products={products} />
                    {guide && (
                      <a href={guide.pdfUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 text-primary font-sans font-bold text-sm hover:underline">
                        <Icons.FileText className="w-4 h-4" /> {guide.title}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Learning Guides */}
      {crop.guides.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-12 tracking-tight text-center">Learning Guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {crop.guides.map((guide) => (
                <a
                  key={guide.id}
                  href={guide.type === 'pdf' ? guide.pdfUrl : undefined}
                  target={guide.type === 'pdf' ? '_blank' : undefined}
                  rel={guide.type === 'pdf' ? 'noreferrer' : undefined}
                  className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow flex flex-col"
                >
                  <div className="aspect-video bg-primary/5 relative overflow-hidden">
                    {guide.thumbnail && <img src={guide.thumbnail} alt={guide.title} className="absolute inset-0 w-full h-full object-cover" />}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-secondary mb-2">
                      {guide.type === 'pdf' ? 'PDF Guide' : 'Article'}
                    </span>
                    <h3 className="font-sans font-bold text-primary mb-2">{guide.title}</h3>
                    <p className="text-on-surface-variant text-sm font-serif flex-grow">{guide.description}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Videos */}
      {crop.videos.length > 0 && (
        <section className="relative z-10 bg-primary py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-12 tracking-tight text-center">Videos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {crop.videos.map((video) => {
                const embedUrl = video.provider === 'upload' ? '' : toYouTubeEmbedUrl(video.url);
                return (
                  <div key={video.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="aspect-video bg-black">
                      {video.provider === 'upload' ? (
                        <video controls src={video.url} className="w-full h-full" />
                      ) : embedUrl ? (
                        <iframe src={embedUrl} title={video.title} className="w-full h-full" allowFullScreen />
                      ) : (
                        <a href={video.url} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center text-white/60">
                          Watch Video
                        </a>
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <span className="font-sans font-semibold text-white text-sm">{video.title}</span>
                      {video.duration && <span className="text-white/50 text-xs">{video.duration}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {crop.faqs.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-8">
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-12 tracking-tight text-center">Frequently Asked Questions</h2>
            <div className="flex flex-col gap-4">
              {crop.faqs.sort((a, b) => a.order - b.order).map((faq) => (
                <details key={faq.id} className="group bg-white rounded-2xl border border-slate-100 p-6">
                  <summary className="font-sans font-bold text-primary cursor-pointer list-none flex items-center justify-between gap-4">
                    {faq.question}
                    <Icons.ChevronRight className="w-4 h-4 text-primary/40 shrink-0 group-open:rotate-90 transition-transform" />
                  </summary>
                  <p className="text-on-surface-variant font-serif text-sm mt-4 leading-relaxed">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Crops */}
      {relatedCrops.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-12 tracking-tight text-center">Related Crops</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedCrops.map((related) => {
                const relatedCategory = categories.find((c) => c.id === related.categoryId);
                if (!relatedCategory) return null;
                return (
                  <Link
                    key={related.id}
                    to={`/crop-solutions/${relatedCategory.slug}/${related.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow"
                  >
                    <div className="aspect-[4/3] relative overflow-hidden bg-primary/5">
                      {related.heroImage && <img src={related.heroImage} alt={related.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                    </div>
                    <div className="p-5">
                      <h3 className="font-sans font-bold text-primary">{related.name}</h3>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
