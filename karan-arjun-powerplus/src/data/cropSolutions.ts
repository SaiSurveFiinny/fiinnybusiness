/**
 * Crop Solutions domain types. Two top-level Firestore collections:
 *
 *  - cropCategories: { id, name, slug, description, coverImage, order, published }
 *  - crops: { id, categoryId, ...CropSolution fields below }
 *
 * Problems/practices/guides/videos/faqs are stored as arrays of objects
 * WITHIN a crop's own document (not separate collections or subcollections)
 * — they are always read/written together with the crop and never queried
 * independently across crops, so nesting them here keeps reads/writes simple
 * (one doc, one listener) rather than requiring joins across five
 * collections. This mirrors the existing `blogs` collection's pattern of
 * embedding imageUrls[]/videoUrls[]/links[] directly in the document.
 */

export interface CropCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string;
  order: number;
  published: boolean;
}

export interface CropProblem {
  id: string;
  title: string;
  severity: 'Low' | 'Medium' | 'High';
  symptoms: string;
  causes: string;
  solution: string;
  productIds: string[];
  image: string;
  order: number;
}

export interface CropPractice {
  id: string;
  title: string;
  description: string;
  stage: string;
  season: string;
  image: string;
  productIds: string[];
  guideId: string;
  order: number;
}

export interface CropGuide {
  id: string;
  title: string;
  description: string;
  type: 'pdf' | 'article';
  pdfUrl: string;
  articleContent: string;
  thumbnail: string;
}

export interface CropVideo {
  id: string;
  title: string;
  provider: 'youtube' | 'vimeo' | 'upload';
  url: string;
  thumbnail: string;
  duration: string;
}

export interface CropFaq {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export interface CropSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  ogImage: string;
  canonicalUrl: string;
}

export interface CropSolution {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  heroImage: string;
  gallery: string[];
  shortDescription: string;
  longOverview: string;
  climate: string;
  soil: string;
  season: string;
  regions: string;
  scientificName: string;
  featured: boolean;
  published: boolean;
  order: number;
  problems: CropProblem[];
  practices: CropPractice[];
  guides: CropGuide[];
  videos: CropVideo[];
  faqs: CropFaq[];
  relatedCropIds: string[];
  seo: CropSeo;
}

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

export const emptySeo: CropSeo = {
  metaTitle: '',
  metaDescription: '',
  keywords: '',
  ogImage: '',
  canonicalUrl: '',
};

export const emptyCropSolution: Omit<CropSolution, 'id'> = {
  categoryId: '',
  name: '',
  slug: '',
  heroImage: '',
  gallery: [],
  shortDescription: '',
  longOverview: '',
  climate: '',
  soil: '',
  season: '',
  regions: '',
  scientificName: '',
  featured: false,
  published: false,
  order: 0,
  problems: [],
  practices: [],
  guides: [],
  videos: [],
  faqs: [],
  relatedCropIds: [],
  seo: emptySeo,
};

export const initialCropCategories: Omit<CropCategory, 'id'>[] = [
  { name: 'Fruit Crops', slug: 'fruits', description: 'Solutions for fruit-bearing crops.', coverImage: '', order: 0, published: true },
  { name: 'Vegetables', slug: 'vegetables', description: 'Solutions for vegetable crops.', coverImage: '', order: 1, published: true },
  { name: 'Sugarcane', slug: 'sugarcane', description: 'Solutions for sugarcane cultivation.', coverImage: '', order: 2, published: true },
  { name: 'Cotton', slug: 'cotton', description: 'Solutions for cotton cultivation.', coverImage: '', order: 3, published: true },
  { name: 'Pulses', slug: 'pulses', description: 'Solutions for pulse crops.', coverImage: '', order: 4, published: true },
  { name: 'Cereals', slug: 'cereals', description: 'Solutions for cereal crops.', coverImage: '', order: 5, published: true },
  { name: 'Oil Seeds', slug: 'oil-seeds', description: 'Solutions for oil seed crops.', coverImage: '', order: 6, published: true },
];
