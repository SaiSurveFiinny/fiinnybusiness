import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import {
  isAnnouncementCurrentlyActive,
  isResourcePubliclyVisible,
  type Announcement,
  type Article,
  type Blog,
  type CropGuide,
  type Download,
  type Faq,
  type News,
  type ResourceVideo,
  type SeasonalAdvice,
} from '../data/resources';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

/**
 * Shared read hook for all public Resources pages (landing, per-type
 * listing/detail) — mirrors hooks/useFarmerSuccessData.ts exactly. Only
 * published (and, for status-enum types, publish-date-elapsed) items are
 * exposed here; drafts remain visible in the Admin ResourcesManager, which
 * reads each collection directly, unfiltered. Blogs have no status field
 * (pre-existing shape, always public) so they pass through unfiltered,
 * matching the original Blog.tsx page's behavior exactly.
 */
export function useResourcesData() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [cropGuides, setCropGuides] = useState<CropGuide[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [seasonalAdvice, setSeasonalAdvice] = useState<SeasonalAdvice[]>([]);
  const [videos, setVideos] = useState<ResourceVideo[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loaded: Record<string, boolean> = {};
    const keys = ['blogs', 'articles', 'cropGuides', 'downloads', 'faqs', 'seasonalAdvice', 'videos', 'news', 'announcements'];
    const checkLoaded = (key: string) => {
      loaded[key] = true;
      if (keys.every((k) => loaded[k])) setIsLoading(false);
    };

    const unsubscribeBlogs = onSnapshot(collection(db, 'blogs'), (snapshot) => {
      setBlogs(
        snapshot.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            title: String(data.title ?? ''),
            excerpt: String(data.excerpt ?? ''),
            date: String(data.date ?? ''),
            category: String(data.category ?? ''),
            content: String(data.content ?? ''),
            imageUrls: toStringArray(data.imageUrls),
            videoUrls: toStringArray(data.videoUrls),
            links: Array.isArray(data.links)
              ? data.links.map((item: { label?: unknown; url?: unknown }) => ({ label: String(item?.label ?? ''), url: String(item?.url ?? '') })).filter((item: { url: string }) => item.url.trim().length > 0)
              : [],
          };
        }),
      );
      checkLoaded('blogs');
    });

    const unsubscribeArticles = onSnapshot(collection(db, 'resourceArticles'), (snapshot) => {
      setArticles(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Article, 'id'>) })).filter(isResourcePubliclyVisible));
      checkLoaded('articles');
    });

    const unsubscribeCropGuides = onSnapshot(collection(db, 'resourceCropGuides'), (snapshot) => {
      setCropGuides(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CropGuide, 'id'>) })).filter(isResourcePubliclyVisible));
      checkLoaded('cropGuides');
    });

    const unsubscribeDownloads = onSnapshot(query(collection(db, 'resourceDownloads'), orderBy('order', 'asc')), (snapshot) => {
      setDownloads(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Download, 'id'>) })).filter((item) => item.published));
      checkLoaded('downloads');
    });

    const unsubscribeFaqs = onSnapshot(query(collection(db, 'resourceFaqs'), orderBy('order', 'asc')), (snapshot) => {
      setFaqs(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Faq, 'id'>) })).filter((item) => item.published));
      checkLoaded('faqs');
    });

    const unsubscribeSeasonalAdvice = onSnapshot(query(collection(db, 'resourceSeasonalAdvice'), orderBy('order', 'asc')), (snapshot) => {
      setSeasonalAdvice(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SeasonalAdvice, 'id'>) })).filter((item) => item.published));
      checkLoaded('seasonalAdvice');
    });

    const unsubscribeVideos = onSnapshot(collection(db, 'resourceVideos'), (snapshot) => {
      setVideos(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceVideo, 'id'>) })).filter((item) => item.published));
      checkLoaded('videos');
    });

    const unsubscribeNews = onSnapshot(collection(db, 'resourceNews'), (snapshot) => {
      setNews(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<News, 'id'>) })).filter(isResourcePubliclyVisible));
      checkLoaded('news');
    });

    const unsubscribeAnnouncements = onSnapshot(collection(db, 'resourceAnnouncements'), (snapshot) => {
      setAnnouncements(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) })).filter(isAnnouncementCurrentlyActive));
      checkLoaded('announcements');
    });

    return () => {
      unsubscribeBlogs();
      unsubscribeArticles();
      unsubscribeCropGuides();
      unsubscribeDownloads();
      unsubscribeFaqs();
      unsubscribeSeasonalAdvice();
      unsubscribeVideos();
      unsubscribeNews();
      unsubscribeAnnouncements();
    };
  }, []);

  return { blogs, articles, cropGuides, downloads, faqs, seasonalAdvice, videos, news, announcements, isLoading };
}
