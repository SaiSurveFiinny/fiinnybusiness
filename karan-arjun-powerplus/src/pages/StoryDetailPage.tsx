import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';
import { youTubeEmbedUrl } from '../data/farmerSuccess';

/**
 * Farmer story detail page — /farmer-success/story/:slug. Mirrors
 * JobDetailPage.tsx/CropDetailPage.tsx: hero, conditional sections, related
 * items grid, BreadcrumbList + Article JSON-LD.
 */
export default function StoryDetailPage() {
  const { storySlug } = useParams<{ storySlug: string }>();
  const { stories, isLoading } = useFarmerSuccessData();
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const story = stories.find((s) => s.slug === storySlug);
  const relatedStories = story ? stories.filter((s) => s.id !== story.id && s.crop === story.crop).slice(0, 3) : [];

  const seoTitle = story?.seo.metaTitle || (story ? `${story.title} | Farmer Success | Karan Arjun Pvt. Ltd.` : 'Farmer Success');
  const seoDescription = story?.seo.metaDescription || story?.subtitle;

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    keywords: story?.seo.keywords,
    ogImage: story?.seo.ogImage || story?.heroImage,
    structuredData: story
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Farmer Success', item: `${window.location.origin}/farmer-success` },
              { '@type': 'ListItem', position: 2, name: story.title, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: story.title,
            description: story.subtitle || story.storyBody.slice(0, 160),
            image: story.heroImage || undefined,
            datePublished: story.publishDate || undefined,
            author: { '@type': 'Person', name: story.author || 'Karan Arjun Pvt. Ltd.' },
            publisher: { '@type': 'Organization', name: 'Karan Arjun Pvt. Ltd.' },
          },
        ]
      : [],
  });

  if (!isLoading && !story) {
    return <Navigate to="/farmer-success" replace />;
  }

  if (!story) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      {/* Hero */}
      <section className="relative min-h-[50vh] flex items-end overflow-hidden">
        {story.heroImage ? (
          <img src={story.heroImage} alt={story.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />

        <div className="relative z-10 w-full max-w-4xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/farmer-success" className="hover:text-white transition-colors">Farmer Success</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{story.title}</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4 leading-tight">{story.title}</h1>
          {story.subtitle && <p className="font-serif text-base md:text-lg text-white/80 max-w-xl leading-relaxed mb-5">{story.subtitle}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70 font-sans font-medium">
            {story.farmerName && <span>{story.farmerName}</span>}
            {story.location && <span>{story.location}</span>}
            {story.crop && <span>{story.crop}</span>}
            {story.publishDate && <span>{new Date(story.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
        </div>
      </section>

      <div className="relative z-10 bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8 flex flex-col gap-12">
          {story.storyBody && (
            <p className="font-serif text-lg text-primary leading-relaxed whitespace-pre-line">{story.storyBody}</p>
          )}

          {(story.challenge || story.solution || story.result) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-y border-primary/10">
              {story.challenge && (
                <div>
                  <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2 block">Challenge</span>
                  <p className="text-sm text-on-surface-variant font-serif leading-relaxed">{story.challenge}</p>
                </div>
              )}
              {story.solution && (
                <div>
                  <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2 block">Solution</span>
                  <p className="text-sm text-on-surface-variant font-serif leading-relaxed">{story.solution}</p>
                </div>
              )}
              {story.result && (
                <div>
                  <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2 block">Result</span>
                  <p className="text-sm text-on-surface-variant font-serif leading-relaxed">{story.result}</p>
                </div>
              )}
            </div>
          )}

          {(story.farmerVillage || story.farmerDistrict || story.farmerState) && (
            <div>
              <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">Farmer Information</span>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-primary/80 font-sans">
                {story.farmerName && <span><span className="text-slate-400">Name:</span> {story.farmerName}</span>}
                {story.farmerVillage && <span><span className="text-slate-400">Village:</span> {story.farmerVillage}</span>}
                {story.farmerDistrict && <span><span className="text-slate-400">District:</span> {story.farmerDistrict}</span>}
                {story.farmerState && <span><span className="text-slate-400">State:</span> {story.farmerState}</span>}
              </div>
            </div>
          )}

          {story.videoUrl && youTubeEmbedUrl(story.videoUrl) && (
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <iframe src={youTubeEmbedUrl(story.videoUrl)} title={story.title} className="w-full h-full" allowFullScreen />
            </div>
          )}

          {story.gallery.length > 0 && (
            <div>
              <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-4 block">Gallery</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {story.gallery.map((url, idx) => (
                  <button key={`${url}-${idx}`} onClick={() => setGalleryIndex(idx)} className="relative rounded-lg overflow-hidden aspect-[4/3]">
                    <img src={url} alt={`${story.title} gallery ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {galleryIndex !== null && story.gallery[galleryIndex] && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6" onClick={() => setGalleryIndex(null)}>
          <img src={story.gallery[galleryIndex]} alt="" className="max-w-full max-h-full object-contain" />
          <button onClick={() => setGalleryIndex(null)} className="absolute top-6 right-6 text-white/80 hover:text-white">
            <Icons.X className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Related Stories */}
      {relatedStories.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">Related Stories</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedStories.map((related) => (
                <Link key={related.id} to={`/farmer-success/story/${related.slug}`} className="group bg-white rounded-lg overflow-hidden border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="aspect-[4/3] relative overflow-hidden bg-primary/5">
                    {related.heroImage && <img src={related.heroImage} alt={related.title} className="absolute inset-0 w-full h-full object-cover" />}
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
