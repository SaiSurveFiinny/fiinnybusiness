import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';
import { youTubeEmbedUrl, youTubeThumbnailUrl } from '../data/resources';

/** Resource Videos — /resources/videos. Click-to-play inline (no separate detail route needed for this simpler, non-testimonial video type), mirrors VideoLibraryPage.tsx's thumbnail grid. */
export default function ResourceVideosPage() {
  const { videos, isLoading } = useResourcesData();
  const [playingId, setPlayingId] = useState<string | null>(null);

  usePageSeo({
    title: 'Videos | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Educational videos on agricultural practices and products.',
  });

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Videos</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">Videos</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
            Educational videos on agricultural practices and products.
          </p>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading videos...</p>}
          {!isLoading && videos.length === 0 && <p className="font-sans text-sm text-primary/60">No videos published yet.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => {
              const isPlaying = playingId === video.id;
              const embedUrl = youTubeEmbedUrl(video.youtubeUrl);
              const thumbnail = youTubeThumbnailUrl(video.youtubeUrl);
              return (
                <div key={video.id}>
                  <div className="relative rounded-lg overflow-hidden aspect-video bg-black mb-3">
                    {isPlaying && embedUrl ? (
                      <iframe src={embedUrl} title={video.title} className="w-full h-full" allowFullScreen />
                    ) : (
                      <button onClick={() => setPlayingId(video.id)} className="group w-full h-full block relative">
                        {thumbnail && <img src={thumbnail} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                          <Icons.PlayCircle className="w-10 h-10 text-white" />
                        </div>
                      </button>
                    )}
                  </div>
                  <h3 className="font-sans font-bold text-primary text-sm">{video.title}</h3>
                  {video.category && <p className="text-xs text-slate-400 font-sans mt-1">{video.category}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
