/**
 * Resources module domain types. Nine flat top-level Firestore collections —
 * no nesting, matching this project's established pattern (see
 * data/career.ts / data/farmerSuccess.ts for the precedent): each
 * independently-queryable content type gets its own collection rather than
 * one polymorphic collection with a type discriminator.
 *
 *  - blogs: PRE-EXISTING collection, kept as-is (not renamed) to preserve
 *    live Firestore data — this migration moves the Blog admin UI and adds
 *    a public /resources/blogs page, but never touches the collection name
 *    or document shape data already lives under.
 *  - resourceArticles, resourceCropGuides, resourceDownloads, resourceFaqs,
 *    resourceSeasonalAdvice, resourceVideos, resourceNews,
 *    resourceAnnouncements: new collections, one per new content type.
 *
 * Every long-form type (Article, CropGuide, News, Announcement) follows the
 * Blog/FarmerStory shape: title/slug/excerpt/content/status/featured/seo.
 * Simpler types (Download, Faq, SeasonalAdvice, ResourceVideo) follow the
 * Testimonial/CropResult shape: a plain `published: boolean` instead of a
 * status enum, no dedicated SEO sub-object, no individual detail route
 * unless the type has enough content to warrant one.
 */

export type ResourceStatus = 'draft' | 'published';

export interface ResourceSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  ogImage: string;
}

export const emptyResourceSeo: ResourceSeo = { metaTitle: '', metaDescription: '', keywords: '', ogImage: '' };

// --- Blog (pre-existing shape, unchanged — see data/mockData.ts's Blog for the original) ---

export interface Blog {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  content?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  links?: Array<{ label: string; url: string }>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// --- Article ---

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  coverImage: string;
  author: string;
  publishDate: string;
  status: ResourceStatus;
  featured: boolean;
  seo: ResourceSeo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyArticle: Omit<Article, 'id'> = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  category: 'General',
  coverImage: '',
  author: '',
  publishDate: '',
  status: 'draft',
  featured: false,
  seo: emptyResourceSeo,
};

// --- Crop Guide ---

export interface CropGuide {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  crop: string;
  coverImage: string;
  pdfUrl: string;
  publishDate: string;
  status: ResourceStatus;
  featured: boolean;
  seo: ResourceSeo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyCropGuide: Omit<CropGuide, 'id'> = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  crop: '',
  coverImage: '',
  pdfUrl: '',
  publishDate: '',
  status: 'draft',
  featured: false,
  seo: emptyResourceSeo,
};

// --- Download ---

export type DownloadFileType = 'pdf' | 'doc' | 'other';

export interface Download {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
  fileType: DownloadFileType;
  category: string;
  thumbnail: string;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyDownload: Omit<Download, 'id'> = {
  title: '',
  description: '',
  fileUrl: '',
  fileType: 'pdf',
  category: 'General',
  thumbnail: '',
  featured: false,
  published: true,
  order: 0,
};

// --- FAQ ---

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyFaq: Omit<Faq, 'id'> = {
  question: '',
  answer: '',
  category: 'General',
  featured: false,
  published: true,
  order: 0,
};

// --- Seasonal Advice ---

export interface SeasonalAdvice {
  id: string;
  title: string;
  season: string;
  crop: string;
  advice: string;
  coverImage: string;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptySeasonalAdvice: Omit<SeasonalAdvice, 'id'> = {
  title: '',
  season: '',
  crop: '',
  advice: '',
  coverImage: '',
  featured: false,
  published: true,
  order: 0,
};

// --- Resource Video (distinct from Farmer Success videos — these are educational/informational, not testimonial-style) ---

export type ResourceVideoKind = 'video' | 'short';

export interface ResourceVideo {
  id: string;
  title: string;
  slug: string;
  youtubeUrl: string;
  kind: ResourceVideoKind;
  category: string;
  description: string;
  publishDate: string;
  featured: boolean;
  published: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyResourceVideo: Omit<ResourceVideo, 'id'> = {
  title: '',
  slug: '',
  youtubeUrl: '',
  kind: 'video',
  category: '',
  description: '',
  publishDate: '',
  featured: false,
  published: true,
};

// --- News ---

export interface News {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  publishDate: string;
  status: ResourceStatus;
  featured: boolean;
  seo: ResourceSeo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyNews: Omit<News, 'id'> = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImage: '',
  publishDate: '',
  status: 'draft',
  featured: false,
  seo: emptyResourceSeo,
};

// --- Announcement ---

export interface Announcement {
  id: string;
  title: string;
  slug: string;
  message: string;
  coverImage: string;
  publishDate: string;
  expiryDate: string;
  status: ResourceStatus;
  featured: boolean;
  seo: ResourceSeo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyAnnouncement: Omit<Announcement, 'id'> = {
  title: '',
  slug: '',
  message: '',
  coverImage: '',
  publishDate: '',
  expiryDate: '',
  status: 'draft',
  featured: false,
  seo: emptyResourceSeo,
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function isResourcePubliclyVisible(item: { status: ResourceStatus; publishDate?: string }): boolean {
  if (item.status !== 'published') return false;
  if (!item.publishDate) return true;
  return new Date(item.publishDate).getTime() <= Date.now();
}

export function isAnnouncementCurrentlyActive(announcement: Announcement): boolean {
  if (!isResourcePubliclyVisible(announcement)) return false;
  if (!announcement.expiryDate) return true;
  return new Date(announcement.expiryDate).getTime() >= Date.now();
}

/** Extracts a YouTube video ID from watch/shortlink/shorts URL formats — duplicated from data/farmerSuccess.ts's helper of the same shape, matching this project's established per-module duplication convention (see career.ts/cropSolutions.ts's independent slugify/generateId). */
export function extractYouTubeId(url: string): string {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watchMatch) return watchMatch[1];
  const shortLinkMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortLinkMatch) return shortLinkMatch[1];
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (shortsMatch) return shortsMatch[1];
  return '';
}

export function youTubeEmbedUrl(url: string): string {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : '';
}

export function youTubeThumbnailUrl(url: string): string {
  const id = extractYouTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

/** Union type used by the Resources landing page's mixed "Latest Resources" feed and global search — each entry tagged with its content type so cards/routes can be resolved generically. */
export type ResourceKind = 'blog' | 'article' | 'guide' | 'download' | 'faq' | 'seasonal' | 'video' | 'news' | 'announcement';

export interface ResourceFeedItem {
  kind: ResourceKind;
  id: string;
  title: string;
  excerpt: string;
  coverImage: string;
  date: string;
  href: string;
}
