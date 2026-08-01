import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { db } from '../../lib/firebase';
import { BlogEditor } from './resources/BlogEditor';
import { ArticleEditor } from './resources/ArticleEditor';
import { CropGuideEditor } from './resources/CropGuideEditor';
import { DownloadEditor } from './resources/DownloadEditor';
import { FaqEditor } from './resources/FaqEditor';
import { SeasonalAdviceEditor } from './resources/SeasonalAdviceEditor';
import { ResourceVideoEditor } from './resources/ResourceVideoEditor';
import { NewsEditor } from './resources/NewsEditor';
import { AnnouncementEditor } from './resources/AnnouncementEditor';
import type {
  Announcement,
  Article,
  Blog,
  CropGuide,
  Download,
  Faq,
  News,
  ResourceVideo,
  SeasonalAdvice,
} from '../../data/resources';

type ResourcesSubTab = 'Dashboard' | 'Blogs' | 'Articles' | 'Crop Guides' | 'Downloads' | 'FAQs' | 'Seasonal Advice' | 'Videos' | 'News' | 'Announcements';
const SUB_TABS: ResourcesSubTab[] = ['Dashboard', 'Blogs', 'Articles', 'Crop Guides', 'Downloads', 'FAQs', 'Seasonal Advice', 'Videos', 'News', 'Announcements'];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

/** Maps Firestore error codes to actionable admin-facing messages — same pattern established in CareerManager.tsx / FarmerSuccessManager.tsx. */
function describeFirestoreError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return 'Permission denied by Firestore security rules. Your account may not have write access to this collection.';
    case 'unavailable':
      return 'Could not reach Firestore. Check your internet connection and try again.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    default:
      return err instanceof Error ? `Could not save: ${err.message}` : 'Could not save. Please try again.';
  }
}

/** Shared row chrome for status-enum content types (Articles/Crop Guides/News/Announcements) — title, meta, featured/status toggle, edit, two-click delete. Mirrors FarmerSuccessManager.tsx's ContentRow. */
function ContentRow({
  title,
  meta,
  featured,
  published,
  onToggleFeatured,
  onTogglePublished,
  onEdit,
  pendingDelete,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  title: string;
  meta: string;
  featured: boolean;
  published: boolean;
  onToggleFeatured: () => void;
  onTogglePublished: () => void;
  onEdit: () => void;
  pendingDelete: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-sans font-bold text-primary">{title || 'Untitled'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {published ? 'Published' : 'Draft'}
          </span>
          {featured && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-secondary-container/20 text-secondary">Featured</span>}
        </div>
        <p className="text-xs text-slate-400 font-sans mt-1">{meta}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggleFeatured} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle featured">
          <Icons.Star className={`w-4 h-4 ${featured ? 'text-secondary fill-secondary' : ''}`} />
        </button>
        <button onClick={onTogglePublished} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle published">
          {published ? <Icons.CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Icons.X className="w-4 h-4" />}
        </button>
        <button onClick={onEdit} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <Icons.Edit className="w-4 h-4" />
        </button>
        {pendingDelete ? (
          <>
            <button onClick={onConfirmDelete} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
            <button onClick={onCancelDelete} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
          </>
        ) : (
          <button onClick={onRequestDelete} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Icons.Trash className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Admin entry point for the Resources module — dashboard stats plus CRUD
 * for all nine content types (Blogs plus the eight new Article/CropGuide/
 * Download/Faq/SeasonalAdvice/ResourceVideo/News/Announcement types).
 * Follows the exact structure and error-handling discipline of
 * CareerManager.tsx / FarmerSuccessManager.tsx: onSnapshot + addDoc/
 * updateDoc/deleteDoc, every write wrapped in try/catch, two-click delete
 * confirmation, no silent failures. This replaces the Blog CRUD that
 * previously lived inline inside Admin.tsx's "Blogs" tab — the `blogs`
 * Firestore collection itself is untouched (same name, same document
 * shape), only the admin UI moved and gained try/catch it didn't have
 * before (see BlogEditor.tsx's doc comment).
 */
export function ResourcesManager() {
  const [subTab, setSubTab] = useState<ResourcesSubTab>('Dashboard');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatus(message);
    setStatusType(type);
  };

  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [cropGuides, setCropGuides] = useState<CropGuide[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [seasonalAdvice, setSeasonalAdvice] = useState<SeasonalAdvice[]>([]);
  const [videos, setVideos] = useState<ResourceVideo[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(collection(db, 'blogs'), (snapshot) => {
        setBlogs(snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
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
        }));
      }, (err) => showStatus(`Could not load blogs: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'resourceArticles'), (snapshot) => setArticles(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Article, 'id'>) }))), (err) => showStatus(`Could not load articles: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'resourceCropGuides'), (snapshot) => setCropGuides(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CropGuide, 'id'>) }))), (err) => showStatus(`Could not load crop guides: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(query(collection(db, 'resourceDownloads'), orderBy('order', 'asc')), (snapshot) => setDownloads(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Download, 'id'>) }))), (err) => showStatus(`Could not load downloads: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(query(collection(db, 'resourceFaqs'), orderBy('order', 'asc')), (snapshot) => setFaqs(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Faq, 'id'>) }))), (err) => showStatus(`Could not load FAQs: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(query(collection(db, 'resourceSeasonalAdvice'), orderBy('order', 'asc')), (snapshot) => setSeasonalAdvice(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SeasonalAdvice, 'id'>) }))), (err) => showStatus(`Could not load seasonal advice: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'resourceVideos'), (snapshot) => setVideos(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceVideo, 'id'>) }))), (err) => showStatus(`Could not load videos: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'resourceNews'), (snapshot) => setNews(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<News, 'id'>) }))), (err) => showStatus(`Could not load news: ${describeFirestoreError(err)}`, 'error')),
      onSnapshot(collection(db, 'resourceAnnouncements'), (snapshot) => setAnnouncements(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }))), (err) => showStatus(`Could not load announcements: ${describeFirestoreError(err)}`, 'error')),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  // --- Blogs ---
  const [isBlogEditorOpen, setIsBlogEditorOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null);
  const [pendingBlogDeleteId, setPendingBlogDeleteId] = useState<string | null>(null);

  const handleSaveBlog = async (form: Omit<Blog, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'blogs', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus('Blog updated.', 'success');
      } else {
        await addDoc(collection(db, 'blogs'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus('Blog post created.', 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteBlog = async (blog: Blog) => {
    try {
      await deleteDoc(doc(db, 'blogs', blog.id));
      showStatus('Blog deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingBlogDeleteId(null);
    }
  };

  // --- Articles ---
  const [isArticleEditorOpen, setIsArticleEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [pendingArticleDeleteId, setPendingArticleDeleteId] = useState<string | null>(null);

  const handleSaveArticle = async (form: Omit<Article, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceArticles', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Article "${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceArticles'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Article "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteArticle = async (article: Article) => {
    try {
      await deleteDoc(doc(db, 'resourceArticles', article.id));
      showStatus('Article deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingArticleDeleteId(null);
    }
  };
  const toggleArticleFeatured = async (article: Article) => {
    try { await updateDoc(doc(db, 'resourceArticles', article.id), { featured: !article.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleArticlePublished = async (article: Article) => {
    try { await updateDoc(doc(db, 'resourceArticles', article.id), { status: article.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Crop Guides ---
  const [isCropGuideEditorOpen, setIsCropGuideEditorOpen] = useState(false);
  const [editingCropGuide, setEditingCropGuide] = useState<CropGuide | null>(null);
  const [pendingCropGuideDeleteId, setPendingCropGuideDeleteId] = useState<string | null>(null);

  const handleSaveCropGuide = async (form: Omit<CropGuide, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceCropGuides', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Crop guide "${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceCropGuides'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Crop guide "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteCropGuide = async (guide: CropGuide) => {
    try {
      await deleteDoc(doc(db, 'resourceCropGuides', guide.id));
      showStatus('Crop guide deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingCropGuideDeleteId(null);
    }
  };
  const toggleCropGuideFeatured = async (guide: CropGuide) => {
    try { await updateDoc(doc(db, 'resourceCropGuides', guide.id), { featured: !guide.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleCropGuidePublished = async (guide: CropGuide) => {
    try { await updateDoc(doc(db, 'resourceCropGuides', guide.id), { status: guide.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Downloads ---
  const [isDownloadEditorOpen, setIsDownloadEditorOpen] = useState(false);
  const [editingDownload, setEditingDownload] = useState<Download | null>(null);
  const [pendingDownloadDeleteId, setPendingDownloadDeleteId] = useState<string | null>(null);

  const handleSaveDownload = async (form: Omit<Download, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceDownloads', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceDownloads'), { ...payload, order: downloads.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteDownload = async (download: Download) => {
    try {
      await deleteDoc(doc(db, 'resourceDownloads', download.id));
      showStatus('Download deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingDownloadDeleteId(null);
    }
  };
  const toggleDownloadFeatured = async (download: Download) => {
    try { await updateDoc(doc(db, 'resourceDownloads', download.id), { featured: !download.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleDownloadPublished = async (download: Download) => {
    try { await updateDoc(doc(db, 'resourceDownloads', download.id), { published: !download.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- FAQs ---
  const [isFaqEditorOpen, setIsFaqEditorOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [pendingFaqDeleteId, setPendingFaqDeleteId] = useState<string | null>(null);

  const handleSaveFaq = async (form: Omit<Faq, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceFaqs', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus('FAQ updated.', 'success');
      } else {
        await addDoc(collection(db, 'resourceFaqs'), { ...payload, order: faqs.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus('FAQ created.', 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteFaq = async (faq: Faq) => {
    try {
      await deleteDoc(doc(db, 'resourceFaqs', faq.id));
      showStatus('FAQ deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingFaqDeleteId(null);
    }
  };
  const toggleFaqFeatured = async (faq: Faq) => {
    try { await updateDoc(doc(db, 'resourceFaqs', faq.id), { featured: !faq.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleFaqPublished = async (faq: Faq) => {
    try { await updateDoc(doc(db, 'resourceFaqs', faq.id), { published: !faq.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Seasonal Advice ---
  const [isSeasonalAdviceEditorOpen, setIsSeasonalAdviceEditorOpen] = useState(false);
  const [editingSeasonalAdvice, setEditingSeasonalAdvice] = useState<SeasonalAdvice | null>(null);
  const [pendingSeasonalAdviceDeleteId, setPendingSeasonalAdviceDeleteId] = useState<string | null>(null);

  const handleSaveSeasonalAdvice = async (form: Omit<SeasonalAdvice, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceSeasonalAdvice', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceSeasonalAdvice'), { ...payload, order: seasonalAdvice.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteSeasonalAdvice = async (advice: SeasonalAdvice) => {
    try {
      await deleteDoc(doc(db, 'resourceSeasonalAdvice', advice.id));
      showStatus('Seasonal advice deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingSeasonalAdviceDeleteId(null);
    }
  };
  const toggleSeasonalAdviceFeatured = async (advice: SeasonalAdvice) => {
    try { await updateDoc(doc(db, 'resourceSeasonalAdvice', advice.id), { featured: !advice.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleSeasonalAdvicePublished = async (advice: SeasonalAdvice) => {
    try { await updateDoc(doc(db, 'resourceSeasonalAdvice', advice.id), { published: !advice.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Videos ---
  const [isVideoEditorOpen, setIsVideoEditorOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<ResourceVideo | null>(null);
  const [pendingVideoDeleteId, setPendingVideoDeleteId] = useState<string | null>(null);

  const handleSaveVideo = async (form: Omit<ResourceVideo, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceVideos', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Video "${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceVideos'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Video "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteVideo = async (video: ResourceVideo) => {
    try {
      await deleteDoc(doc(db, 'resourceVideos', video.id));
      showStatus('Video deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingVideoDeleteId(null);
    }
  };
  const toggleVideoFeatured = async (video: ResourceVideo) => {
    try { await updateDoc(doc(db, 'resourceVideos', video.id), { featured: !video.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleVideoPublished = async (video: ResourceVideo) => {
    try { await updateDoc(doc(db, 'resourceVideos', video.id), { published: !video.published, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- News ---
  const [isNewsEditorOpen, setIsNewsEditorOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [pendingNewsDeleteId, setPendingNewsDeleteId] = useState<string | null>(null);

  const handleSaveNews = async (form: Omit<News, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceNews', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceNews'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteNews = async (item: News) => {
    try {
      await deleteDoc(doc(db, 'resourceNews', item.id));
      showStatus('News item deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingNewsDeleteId(null);
    }
  };
  const toggleNewsFeatured = async (item: News) => {
    try { await updateDoc(doc(db, 'resourceNews', item.id), { featured: !item.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleNewsPublished = async (item: News) => {
    try { await updateDoc(doc(db, 'resourceNews', item.id), { status: item.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  // --- Announcements ---
  const [isAnnouncementEditorOpen, setIsAnnouncementEditorOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [pendingAnnouncementDeleteId, setPendingAnnouncementDeleteId] = useState<string | null>(null);

  const handleSaveAnnouncement = async (form: Omit<Announcement, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'resourceAnnouncements', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" updated.`, 'success');
      } else {
        await addDoc(collection(db, 'resourceAnnouncements'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`"${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };
  const confirmDeleteAnnouncement = async (item: Announcement) => {
    try {
      await deleteDoc(doc(db, 'resourceAnnouncements', item.id));
      showStatus('Announcement deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingAnnouncementDeleteId(null);
    }
  };
  const toggleAnnouncementFeatured = async (item: Announcement) => {
    try { await updateDoc(doc(db, 'resourceAnnouncements', item.id), { featured: !item.featured, updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };
  const toggleAnnouncementPublished = async (item: Announcement) => {
    try { await updateDoc(doc(db, 'resourceAnnouncements', item.id), { status: item.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() }); } catch (err) { showStatus(describeFirestoreError(err), 'error'); }
  };

  const stats = {
    blogs: blogs.length,
    articles: articles.length,
    publishedArticles: articles.filter((a) => a.status === 'published').length,
    cropGuides: cropGuides.length,
    downloads: downloads.length,
    faqs: faqs.length,
    seasonalAdvice: seasonalAdvice.length,
    videos: videos.length,
    news: news.length,
    announcements: announcements.length,
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="font-sans text-xl font-bold text-primary">Resources</h2>
            <p className="text-sm text-primary/60 font-sans mt-1">Manage blogs, articles, guides, downloads, and every other knowledge-center content type shown at /resources.</p>
          </div>
        </div>
        {status && (
          <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-xl text-sm font-sans font-semibold ${statusType === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {statusType === 'error' ? <Icons.AlertCircle className="w-4 h-4 shrink-0" /> : <Icons.CheckCircle2 className="w-4 h-4 shrink-0" />}
            {status}
            <button onClick={() => setStatus('')} className="ml-auto text-current opacity-60 hover:opacity-100"><Icons.X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex gap-1 mt-6 border-b border-slate-100 overflow-x-auto">
          {SUB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`px-4 py-2.5 font-sans text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                subTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-primary/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'Dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Blogs', value: stats.blogs },
            { label: 'Articles', value: stats.articles },
            { label: 'Published Articles', value: stats.publishedArticles },
            { label: 'Crop Guides', value: stats.cropGuides },
            { label: 'Downloads', value: stats.downloads },
            { label: 'FAQs', value: stats.faqs },
            { label: 'Seasonal Advice', value: stats.seasonalAdvice },
            { label: 'Videos', value: stats.videos },
            { label: 'News', value: stats.news },
            { label: 'Announcements', value: stats.announcements },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
              <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <h4 className="text-3xl font-sans font-black text-primary mt-3">{stat.value}</h4>
            </div>
          ))}
        </div>
      )}

      {subTab === 'Blogs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingBlog(null); setIsBlogEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Blog
            </button>
          </div>
          {blogs.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No blog posts yet. Click "Add Blog" to create your first one.</p>
            </div>
          )}
          {blogs.map((blog) => (
            <div key={blog.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <span className="font-sans font-bold text-primary">{blog.title || 'Untitled'}</span>
                <p className="text-xs text-slate-400 font-sans mt-1">
                  {blog.category || 'General'} · {blog.date} · Img:{blog.imageUrls?.length ?? 0} / Vid:{blog.videoUrls?.length ?? 0} / Link:{blog.links?.length ?? 0}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditingBlog(blog); setIsBlogEditorOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Icons.Edit className="w-4 h-4" />
                </button>
                {pendingBlogDeleteId === blog.id ? (
                  <>
                    <button onClick={() => void confirmDeleteBlog(blog)} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
                    <button onClick={() => setPendingBlogDeleteId(null)} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setPendingBlogDeleteId(blog.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'Articles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingArticle(null); setIsArticleEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Article
            </button>
          </div>
          {articles.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No articles yet.</p>
            </div>
          )}
          {articles.map((article) => (
            <ContentRow
              key={article.id}
              title={article.title}
              meta={`${article.category || 'General'} · /resources/articles/${article.slug}`}
              featured={article.featured}
              published={article.status === 'published'}
              onToggleFeatured={() => void toggleArticleFeatured(article)}
              onTogglePublished={() => void toggleArticlePublished(article)}
              onEdit={() => { setEditingArticle(article); setIsArticleEditorOpen(true); }}
              pendingDelete={pendingArticleDeleteId === article.id}
              onRequestDelete={() => setPendingArticleDeleteId(article.id)}
              onConfirmDelete={() => void confirmDeleteArticle(article)}
              onCancelDelete={() => setPendingArticleDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Crop Guides' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingCropGuide(null); setIsCropGuideEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Crop Guide
            </button>
          </div>
          {cropGuides.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No crop guides yet.</p>
            </div>
          )}
          {cropGuides.map((guide) => (
            <ContentRow
              key={guide.id}
              title={guide.title}
              meta={`${guide.crop || 'No crop'} · /resources/guides/${guide.slug}`}
              featured={guide.featured}
              published={guide.status === 'published'}
              onToggleFeatured={() => void toggleCropGuideFeatured(guide)}
              onTogglePublished={() => void toggleCropGuidePublished(guide)}
              onEdit={() => { setEditingCropGuide(guide); setIsCropGuideEditorOpen(true); }}
              pendingDelete={pendingCropGuideDeleteId === guide.id}
              onRequestDelete={() => setPendingCropGuideDeleteId(guide.id)}
              onConfirmDelete={() => void confirmDeleteCropGuide(guide)}
              onCancelDelete={() => setPendingCropGuideDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Downloads' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingDownload(null); setIsDownloadEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Download
            </button>
          </div>
          {downloads.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No downloads yet.</p>
            </div>
          )}
          {downloads.map((download) => (
            <ContentRow
              key={download.id}
              title={download.title}
              meta={`${download.category || 'General'} · ${download.fileType.toUpperCase()}`}
              featured={download.featured}
              published={download.published}
              onToggleFeatured={() => void toggleDownloadFeatured(download)}
              onTogglePublished={() => void toggleDownloadPublished(download)}
              onEdit={() => { setEditingDownload(download); setIsDownloadEditorOpen(true); }}
              pendingDelete={pendingDownloadDeleteId === download.id}
              onRequestDelete={() => setPendingDownloadDeleteId(download.id)}
              onConfirmDelete={() => void confirmDeleteDownload(download)}
              onCancelDelete={() => setPendingDownloadDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'FAQs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingFaq(null); setIsFaqEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add FAQ
            </button>
          </div>
          {faqs.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No FAQs yet.</p>
            </div>
          )}
          {faqs.map((faq) => (
            <ContentRow
              key={faq.id}
              title={faq.question}
              meta={faq.category || 'General'}
              featured={faq.featured}
              published={faq.published}
              onToggleFeatured={() => void toggleFaqFeatured(faq)}
              onTogglePublished={() => void toggleFaqPublished(faq)}
              onEdit={() => { setEditingFaq(faq); setIsFaqEditorOpen(true); }}
              pendingDelete={pendingFaqDeleteId === faq.id}
              onRequestDelete={() => setPendingFaqDeleteId(faq.id)}
              onConfirmDelete={() => void confirmDeleteFaq(faq)}
              onCancelDelete={() => setPendingFaqDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Seasonal Advice' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingSeasonalAdvice(null); setIsSeasonalAdviceEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Advice
            </button>
          </div>
          {seasonalAdvice.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No seasonal advice yet.</p>
            </div>
          )}
          {seasonalAdvice.map((advice) => (
            <ContentRow
              key={advice.id}
              title={advice.title}
              meta={`${advice.season || 'No season'} · ${advice.crop || 'No crop'}`}
              featured={advice.featured}
              published={advice.published}
              onToggleFeatured={() => void toggleSeasonalAdviceFeatured(advice)}
              onTogglePublished={() => void toggleSeasonalAdvicePublished(advice)}
              onEdit={() => { setEditingSeasonalAdvice(advice); setIsSeasonalAdviceEditorOpen(true); }}
              pendingDelete={pendingSeasonalAdviceDeleteId === advice.id}
              onRequestDelete={() => setPendingSeasonalAdviceDeleteId(advice.id)}
              onConfirmDelete={() => void confirmDeleteSeasonalAdvice(advice)}
              onCancelDelete={() => setPendingSeasonalAdviceDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Videos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingVideo(null); setIsVideoEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Video
            </button>
          </div>
          {videos.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No videos yet.</p>
            </div>
          )}
          {videos.map((video) => (
            <ContentRow
              key={video.id}
              title={video.title}
              meta={`${video.kind === 'short' ? 'Short' : 'Video'} · ${video.category || 'No category'}`}
              featured={video.featured}
              published={video.published}
              onToggleFeatured={() => void toggleVideoFeatured(video)}
              onTogglePublished={() => void toggleVideoPublished(video)}
              onEdit={() => { setEditingVideo(video); setIsVideoEditorOpen(true); }}
              pendingDelete={pendingVideoDeleteId === video.id}
              onRequestDelete={() => setPendingVideoDeleteId(video.id)}
              onConfirmDelete={() => void confirmDeleteVideo(video)}
              onCancelDelete={() => setPendingVideoDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'News' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingNews(null); setIsNewsEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add News
            </button>
          </div>
          {news.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No news items yet.</p>
            </div>
          )}
          {news.map((item) => (
            <ContentRow
              key={item.id}
              title={item.title}
              meta={`/resources/news/${item.slug}`}
              featured={item.featured}
              published={item.status === 'published'}
              onToggleFeatured={() => void toggleNewsFeatured(item)}
              onTogglePublished={() => void toggleNewsPublished(item)}
              onEdit={() => { setEditingNews(item); setIsNewsEditorOpen(true); }}
              pendingDelete={pendingNewsDeleteId === item.id}
              onRequestDelete={() => setPendingNewsDeleteId(item.id)}
              onConfirmDelete={() => void confirmDeleteNews(item)}
              onCancelDelete={() => setPendingNewsDeleteId(null)}
            />
          ))}
        </div>
      )}

      {subTab === 'Announcements' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingAnnouncement(null); setIsAnnouncementEditorOpen(true); }} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Announcement
            </button>
          </div>
          {announcements.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No announcements yet.</p>
            </div>
          )}
          {announcements.map((item) => (
            <ContentRow
              key={item.id}
              title={item.title}
              meta={item.expiryDate ? `Expires ${item.expiryDate}` : 'No expiry'}
              featured={item.featured}
              published={item.status === 'published'}
              onToggleFeatured={() => void toggleAnnouncementFeatured(item)}
              onTogglePublished={() => void toggleAnnouncementPublished(item)}
              onEdit={() => { setEditingAnnouncement(item); setIsAnnouncementEditorOpen(true); }}
              pendingDelete={pendingAnnouncementDeleteId === item.id}
              onRequestDelete={() => setPendingAnnouncementDeleteId(item.id)}
              onConfirmDelete={() => void confirmDeleteAnnouncement(item)}
              onCancelDelete={() => setPendingAnnouncementDeleteId(null)}
            />
          ))}
        </div>
      )}

      {isBlogEditorOpen && <BlogEditor blog={editingBlog} onSave={handleSaveBlog} onClose={() => { setIsBlogEditorOpen(false); setEditingBlog(null); }} />}
      {isArticleEditorOpen && <ArticleEditor article={editingArticle} onSave={handleSaveArticle} onClose={() => { setIsArticleEditorOpen(false); setEditingArticle(null); }} />}
      {isCropGuideEditorOpen && <CropGuideEditor guide={editingCropGuide} onSave={handleSaveCropGuide} onClose={() => { setIsCropGuideEditorOpen(false); setEditingCropGuide(null); }} />}
      {isDownloadEditorOpen && <DownloadEditor download={editingDownload} onSave={handleSaveDownload} onClose={() => { setIsDownloadEditorOpen(false); setEditingDownload(null); }} />}
      {isFaqEditorOpen && <FaqEditor faq={editingFaq} onSave={handleSaveFaq} onClose={() => { setIsFaqEditorOpen(false); setEditingFaq(null); }} />}
      {isSeasonalAdviceEditorOpen && <SeasonalAdviceEditor advice={editingSeasonalAdvice} onSave={handleSaveSeasonalAdvice} onClose={() => { setIsSeasonalAdviceEditorOpen(false); setEditingSeasonalAdvice(null); }} />}
      {isVideoEditorOpen && <ResourceVideoEditor video={editingVideo} onSave={handleSaveVideo} onClose={() => { setIsVideoEditorOpen(false); setEditingVideo(null); }} />}
      {isNewsEditorOpen && <NewsEditor news={editingNews} onSave={handleSaveNews} onClose={() => { setIsNewsEditorOpen(false); setEditingNews(null); }} />}
      {isAnnouncementEditorOpen && <AnnouncementEditor announcement={editingAnnouncement} onSave={handleSaveAnnouncement} onClose={() => { setIsAnnouncementEditorOpen(false); setEditingAnnouncement(null); }} />}
    </div>
  );
}
