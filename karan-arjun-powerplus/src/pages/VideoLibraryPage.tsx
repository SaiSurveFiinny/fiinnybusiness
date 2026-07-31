import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';
import { youTubeThumbnailUrl } from '../data/farmerSuccess';

/**
 * Video library — /farmer-success/videos. Crop filter + featured/latest
 * split, following CareerLanding.tsx's filter-bar convention. Cards link to
 * the video detail page rather than embedding playback inline, keeping this
 * page a lightweight index.
 */
export default function VideoLibraryPage() {
  const { videos, isLoading } = useFarmerSuccessData();
  const [cropFilter, setCropFilter] = useState('all');

  usePageSeo({
    title: 'Video Library | Farmer Success | Karan Arjun Pvt. Ltd.',
    description: 'Watch videos and shorts from farmers who work with Karan Arjun Pvt. Ltd.',
  });

  const crops = useMemo(() => Array.from(new Set(videos.map((v) => v.crop).filter(Boolean))), [videos]);
  const filteredVideos = useMemo(
    () => videos.filter((v) => cropFilter === 'all' || v.crop === cropFilter).sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || '')),
    [videos, cropFilter],
  );
  const featuredVideos = useMemo(() => filteredVideos.filter((v) => v.featured), [filteredVideos]);
  const latestVideos = useMemo(() => filteredVideos.filter((v) => !v.featured), [filteredVideos]);

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/farmer-success" className="hover:text-white transition-colors">Farmer Success</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Videos</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">Video Library</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed mb-8">
            Field visits, farmer interviews, and product demonstrations.
          </p>
          {crops.length > 0 && (
            <select value={cropFilter} onChange={(e) => setCropFilter(e.target.value)} className="px-4 py-2.5 rounded-lg bg-white/95 text-sm font-sans">
              <option value="all">All Crops</option>
              {crops.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
            </select>
          )}
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading videos...</p>}
          {!isLoading && filteredVideos.length === 0 && <p className="font-sans text-sm text-primary/60">No videos match this filter.</p>}

          {featuredVideos.length > 0 && (
            <div className="mb-16">
              <h2 className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-6">Featured</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredVideos.map((video) => <VideoCard key={video.id} video={video} />)}
              </div>
            </div>
          )}

          {latestVideos.length > 0 && (
            <div>
              <h2 className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-6">All Videos</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {latestVideos.map((video) => <VideoCard key={video.id} video={video} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: ReturnType<typeof useFarmerSuccessData>['videos'][number] }) {
  const thumbnail = youTubeThumbnailUrl(video.youtubeUrl);
  return (
    <Link to={`/farmer-success/video/${video.slug}`} className="group">
      <div className="relative rounded-lg overflow-hidden aspect-video bg-primary/5 mb-3">
        {thumbnail && <img src={thumbnail} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <Icons.PlayCircle className="w-10 h-10 text-white" />
        </div>
        {video.kind === 'short' && (
          <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 text-white text-[10px] font-sans font-bold uppercase rounded">Short</span>
        )}
      </div>
      <h3 className="font-sans font-bold text-primary text-sm group-hover:underline underline-offset-4">{video.title}</h3>
      {video.crop && <p className="text-xs text-slate-400 font-sans mt-1">{video.crop}</p>}
    </Link>
  );
}
