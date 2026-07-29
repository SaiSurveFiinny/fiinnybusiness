import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { initialHomeVideos } from '../../data/mockData';
import { db } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function toYouTubeEmbedUrl(url: string) {
  const trimmed = url.trim();
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (shortsMatch) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  }
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }
  const shortLinkMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortLinkMatch) {
    return `https://www.youtube.com/embed/${shortLinkMatch[1]}`;
  }
  return '';
}

interface FarmerSuccessProps {
  title?: string;
  description?: string;
  /** Homepage uses a full-bleed dark band; /who-we-are keeps the original light wrapper. */
  variant?: 'light' | 'dark';
}

/**
 * Firestore-backed video grid (settings/homepage.videos) — logic unchanged
 * from the original single-product homepage. Only the surrounding section
 * chrome is now variant-able so the homepage can use a dark full-width band
 * (breaking up the page's white-section rhythm) while /who-we-are keeps the
 * original light treatment.
 */
export function FarmerSuccess({ title, description, variant = 'light' }: FarmerSuccessProps) {
  const { t } = useLanguage();
  const [homeVideos, setHomeVideos] = useState<string[]>(initialHomeVideos);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'homepage'), (snapshot) => {
      if (!snapshot.exists()) {
        setHomeVideos(initialHomeVideos);
        return;
      }
      const data = snapshot.data();
      setHomeVideos(toStringArray(data.videos));
    });

    return () => unsubscribe();
  }, []);

  const embedVideos = homeVideos
    .map((video) => ({
      sourceUrl: video,
      embedUrl: toYouTubeEmbedUrl(video),
    }))
    .filter((video) => video.embedUrl.length > 0);

  if (embedVideos.length === 0) {
    return null;
  }

  const isDark = variant === 'dark';

  return (
    <section className={`relative z-10 py-20 md:py-28 ${isDark ? 'bg-primary' : ''}`}>
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center mb-14">
          <span className={`font-sans text-xs font-bold uppercase tracking-[0.25em] mb-4 block ${isDark ? 'text-secondary-container' : 'text-secondary'}`}>
            {title ?? t.videos_title}
          </span>
          <p className={`font-serif text-xl md:text-2xl max-w-2xl mx-auto ${isDark ? 'text-white/80' : 'text-on-surface-variant'}`}>
            {description ?? t.videos_desc}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {embedVideos.map((video) => (
            <article
              key={video.sourceUrl}
              className={isDark
                ? 'bg-white/5 border border-white/10 backdrop-blur-md rounded-[2rem] p-4'
                : 'glass-panel rounded-[2rem] p-4 border border-slate-100 shadow-sm'}
            >
              <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-black">
                <iframe
                  src={video.embedUrl}
                  title={`Karan Arjun video ${video.sourceUrl}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
