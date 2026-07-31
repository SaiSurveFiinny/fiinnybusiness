import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';
import { youTubeEmbedUrl, youTubeThumbnailUrl } from '../data/farmerSuccess';

/**
 * Video detail page — /farmer-success/video/:slug. Embeds the YouTube
 * player and emits VideoObject + BreadcrumbList JSON-LD, following the same
 * inline-object-literal construction style as JobDetailPage's JobPosting
 * schema and CropDetailPage's BreadcrumbList/FAQPage schemas.
 */
export default function VideoDetailPage() {
  const { videoSlug } = useParams<{ videoSlug: string }>();
  const { videos, isLoading } = useFarmerSuccessData();

  const video = videos.find((v) => v.slug === videoSlug);
  const relatedVideos = video ? videos.filter((v) => v.id !== video.id && v.crop === video.crop).slice(0, 3) : [];
  const embedUrl = video ? youTubeEmbedUrl(video.youtubeUrl) : '';
  const thumbnail = video ? youTubeThumbnailUrl(video.youtubeUrl) : '';

  usePageSeo({
    title: video ? `${video.title} | Farmer Success | Karan Arjun Pvt. Ltd.` : 'Farmer Success',
    description: video?.description,
    ogImage: thumbnail,
    structuredData: video
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Farmer Success', item: `${window.location.origin}/farmer-success` },
              { '@type': 'ListItem', position: 2, name: 'Videos', item: `${window.location.origin}/farmer-success/videos` },
              { '@type': 'ListItem', position: 3, name: video.title, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'VideoObject',
            name: video.title,
            description: video.description || video.title,
            thumbnailUrl: thumbnail || undefined,
            uploadDate: video.publishDate || undefined,
            embedUrl: embedUrl || undefined,
          },
        ]
      : [],
  });

  if (!isLoading && !video) {
    return <Navigate to="/farmer-success/videos" replace />;
  }

  if (!video) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      <div className="bg-primary py-8">
        <div className="max-w-4xl mx-auto px-8">
          <nav className="flex items-center gap-2 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/farmer-success" className="hover:text-white transition-colors">Farmer Success</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to="/farmer-success/videos" className="hover:text-white transition-colors">Videos</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{video.title}</span>
          </nav>
        </div>
      </div>

      <div className="bg-white py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-8">
          <div className="aspect-video rounded-lg overflow-hidden bg-black mb-8">
            {embedUrl ? (
              <iframe src={embedUrl} title={video.title} className="w-full h-full" allowFullScreen />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/60">Video unavailable</div>
            )}
          </div>

          <h1 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-3">{video.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 font-sans font-medium mb-6">
            {video.crop && <span>{video.crop}</span>}
            {video.publishDate && <span>{new Date(video.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
          {video.description && <p className="font-serif text-base text-on-surface-variant leading-relaxed max-w-2xl">{video.description}</p>}
        </div>
      </div>

      {relatedVideos.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">Related Videos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedVideos.map((related) => {
                const relatedThumbnail = youTubeThumbnailUrl(related.youtubeUrl);
                return (
                  <Link key={related.id} to={`/farmer-success/video/${related.slug}`} className="group">
                    <div className="relative rounded-lg overflow-hidden aspect-video bg-primary/5 mb-3">
                      {relatedThumbnail && <img src={relatedThumbnail} alt={related.title} className="absolute inset-0 w-full h-full object-cover" />}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                        <Icons.PlayCircle className="w-9 h-9 text-white" />
                      </div>
                    </div>
                    <h3 className="font-sans font-bold text-primary text-sm group-hover:underline underline-offset-4">{related.title}</h3>
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
