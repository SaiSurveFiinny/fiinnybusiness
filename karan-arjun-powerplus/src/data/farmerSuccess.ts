/**
 * Farmer Success module domain types. Six flat top-level Firestore
 * collections — no nesting, matching this project's established pattern
 * (see data/career.ts for the closer precedent: independently-queryable
 * content types each get their own collection rather than one polymorphic
 * collection with a type discriminator):
 *
 *  - farmerStories: long-form editorial success stories (one farmer/case per doc).
 *  - farmerVideos: YouTube-hosted video entries (URL only, no uploaded video files).
 *  - testimonials: short quote-style entries.
 *  - beforeAfterCases: before/after comparison entries.
 *  - cropResults: field performance data entries.
 *  - caseStudies: long-form technical reports, optionally with a PDF download.
 *
 * Each collection mirrors Job's shape: a `status` enum (draft/published) +
 * `featured` flag + `seo` sub-object for the two content types with their
 * own detail page and SEO surface (stories, case studies); the four
 * simpler, always-shown-in-bulk types (videos, testimonials, before/after,
 * crop results) use a plain `published: boolean` instead, matching
 * CropSolution's simpler toggle for content with no independent SEO page.
 */

export type StoryStatus = 'draft' | 'published';

export interface StorySeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  ogImage: string;
}

export const emptyStorySeo: StorySeo = { metaTitle: '', metaDescription: '', keywords: '', ogImage: '' };

export interface FarmerStory {
  id: string;
  title: string;
  slug: string;
  subtitle: string;
  heroImage: string;
  storyBody: string;
  author: string;
  publishDate: string;
  crop: string;
  location: string;
  farmerName: string;
  farmerVillage: string;
  farmerDistrict: string;
  farmerState: string;
  challenge: string;
  solution: string;
  result: string;
  relatedProductIds: string[];
  gallery: string[];
  videoUrl: string;
  status: StoryStatus;
  featured: boolean;
  seo: StorySeo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyFarmerStory: Omit<FarmerStory, 'id'> = {
  title: '',
  slug: '',
  subtitle: '',
  heroImage: '',
  storyBody: '',
  author: '',
  publishDate: '',
  crop: '',
  location: '',
  farmerName: '',
  farmerVillage: '',
  farmerDistrict: '',
  farmerState: '',
  challenge: '',
  solution: '',
  result: '',
  relatedProductIds: [],
  gallery: [],
  videoUrl: '',
  status: 'draft',
  featured: false,
  seo: emptyStorySeo,
};

export type VideoKind = 'video' | 'short';

export interface FarmerVideo {
  id: string;
  title: string;
  slug: string;
  youtubeUrl: string;
  kind: VideoKind;
  crop: string;
  description: string;
  publishDate: string;
  featured: boolean;
  published: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyFarmerVideo: Omit<FarmerVideo, 'id'> = {
  title: '',
  slug: '',
  youtubeUrl: '',
  kind: 'video',
  crop: '',
  description: '',
  publishDate: '',
  featured: false,
  published: true,
};

export interface Testimonial {
  id: string;
  slug: string;
  farmerName: string;
  farmerPhoto: string;
  crop: string;
  location: string;
  quote: string;
  relatedProductId: string;
  rating: number;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyTestimonial: Omit<Testimonial, 'id'> = {
  slug: '',
  farmerName: '',
  farmerPhoto: '',
  crop: '',
  location: '',
  quote: '',
  relatedProductId: '',
  rating: 0,
  featured: false,
  published: true,
  order: 0,
};

export interface BeforeAfterCase {
  id: string;
  title: string;
  beforeImage: string;
  afterImage: string;
  crop: string;
  description: string;
  duration: string;
  resultMetrics: string;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyBeforeAfterCase: Omit<BeforeAfterCase, 'id'> = {
  title: '',
  beforeImage: '',
  afterImage: '',
  crop: '',
  description: '',
  duration: '',
  resultMetrics: '',
  featured: false,
  published: true,
  order: 0,
};

export interface CropResult {
  id: string;
  crop: string;
  productId: string;
  yieldIncrease: string;
  diseaseReduction: string;
  gallery: string[];
  notes: string;
  fieldObservations: string;
  featured: boolean;
  published: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyCropResult: Omit<CropResult, 'id'> = {
  crop: '',
  productId: '',
  yieldIncrease: '',
  diseaseReduction: '',
  gallery: [],
  notes: '',
  fieldObservations: '',
  featured: false,
  published: true,
  order: 0,
};

export interface CaseStudy {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  summary: string;
  fullArticle: string;
  pdfUrl: string;
  gallery: string[];
  relatedProductIds: string[];
  relatedCrops: string[];
  status: StoryStatus;
  featured: boolean;
  publishDate: string;
  seo: StorySeo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyCaseStudy: Omit<CaseStudy, 'id'> = {
  title: '',
  slug: '',
  coverImage: '',
  summary: '',
  fullArticle: '',
  pdfUrl: '',
  gallery: [],
  relatedProductIds: [],
  relatedCrops: [],
  status: 'draft',
  featured: false,
  publishDate: '',
  seo: emptyStorySeo,
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

export function isStoryPubliclyVisible(story: FarmerStory): boolean {
  if (story.status !== 'published') return false;
  if (!story.publishDate) return true;
  return new Date(story.publishDate).getTime() <= Date.now();
}

export function isCaseStudyPubliclyVisible(caseStudy: CaseStudy): boolean {
  if (caseStudy.status !== 'published') return false;
  if (!caseStudy.publishDate) return true;
  return new Date(caseStudy.publishDate).getTime() <= Date.now();
}

/** Extracts a YouTube video ID from watch/shortlink/shorts URL formats. */
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
