/**
 * Product Details CMS domain types. Extends (does not replace) the lean
 * `Product` shape already used by Shop.tsx/CartContext.tsx/ProductPicker.tsx
 * (see data/mockData.ts) — this file's `ProductDetail` is the full CMS
 * record for the /products/:slug detail page + admin ProductEditor, while
 * `mockData.ts`'s `Product` remains the lightweight shape everything else
 * (cart, pickers, cross-references) continues to use unchanged.
 *
 * Firestore shape: ONE `products` collection, one document per product,
 * everything embedded as arrays on that single document — matching the
 * CropSolution precedent (problems[]/practices[]/guides[]/videos[]/faqs[]
 * all on one crop doc) rather than subcollections, since every section
 * here is small, bounded, and always read together with the rest of the
 * product page. Only `productReviews` gets a real top-level collection,
 * since reviews are the one thing with genuine independent-query needs
 * (moderation queue, "my reviews", pagination) — same reasoning that split
 * `applications` out from `jobs` in the Career module.
 */

export type ProductStatus = 'draft' | 'published';

export interface ProductSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  focusKeyword: string;
  ogImage: string;
  canonicalUrl: string;
  /** Raw JSON-LD to merge over the auto-generated Product schema, for cases the generator can't cover. Left empty in normal use. */
  schemaOverride: string;
  robots: 'index' | 'noindex';
}

export const emptyProductSeo: ProductSeo = {
  metaTitle: '',
  metaDescription: '',
  keywords: '',
  focusKeyword: '',
  ogImage: '',
  canonicalUrl: '',
  schemaOverride: '',
  robots: 'index',
};

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
  mrp: number;
  stock: number;
  sku: string;
  barcode: string;
}

/**
 * Single source of truth for every product image (replaces the old
 * ProductMedia object — featuredImage/thumbnail/labelFront/labelBack/
 * packaging/gallery/usageImages, and the per-variant image field, all
 * collapsed into one ordered array). The first image by `order` is always
 * the primary/listing image; see `primaryImage()`.
 */
export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  caption: string;
  order: number;
}

export interface ProductBenefit {
  id: string;
  icon: string;
  title: string;
  description: string;
  order: number;
}

export interface RecommendedCrop {
  id: string;
  name: string;
  image: string;
  order: number;
}

export interface DosageRow {
  id: string;
  crop: string;
  dosage: string;
  method: string;
  growthStage: string;
  sprayInterval: string;
  remarks: string;
}

export interface CompositionRow {
  id: string;
  ingredient: string;
  percentage: string;
}

export interface SpecRow {
  id: string;
  property: string;
  value: string;
}

export interface HowToUseStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  image: string;
}

export interface ExpectedResult {
  id: string;
  day: string;
  result: string;
}

export interface ProductFaq {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export interface ProductCertification {
  id: string;
  title: string;
  image: string;
  description: string;
  certificateNumber: string;
  expiryDate: string;
}

export type DownloadType = 'pdf' | 'doc' | 'image' | 'other';

export interface ProductDownload {
  id: string;
  title: string;
  type: DownloadType;
  url: string;
  /** Free-text display size (e.g. "2.3 MB") — file size isn't queried programmatically, only shown, so no need to compute it from the actual blob. */
  size: string;
}

export type VideoProvider = 'youtube' | 'youtubeShort' | 'vimeo' | 'upload';

export interface ProductVideo {
  id: string;
  title: string;
  provider: VideoProvider;
  url: string;
  thumbnail: string;
  /** At most one video should be featured; enforced by the admin UI (setting one clears the others), not by the type. */
  featured: boolean;
}

export type RelatedProductsMode = 'auto' | 'manual';

/**
 * Predefined product categories shown in the admin's Category dropdown.
 * `category` on `ProductDetail` stays a plain string (not a union type) so
 * an older product with a category value outside this list still loads and
 * saves correctly — the editor just falls back to showing that raw value
 * as an extra option instead of silently dropping it. See ProductEditor.tsx.
 */
export const PRODUCT_CATEGORIES: string[] = [
  'Fertilizers',
  'Biostimulants',
  'Plant Growth Regulators (PGR)',
  'Micronutrients',
  'Water Soluble Fertilizers (WSF)',
  'Organic Fertilizers',
  'Soil Conditioners',
  'Bio Fertilizers',
  'Crop Protection',
  'Fungicides',
  'Insecticides',
  'Herbicides',
  'Seed Treatment',
  'Adjuvants',
  'Specialty Nutrition',
  'Others',
];

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  category: string;
  brand: string;
  badges: string[];
  sku: string;
  status: ProductStatus;
  featured: boolean;

  /** Simple flat price shown when the product has no variants (or before variants are added). Variants, when present, take priority for display — see `displayPrice()`. */
  price: number;
  mrp: number;

  images: ProductImage[];
  variants: ProductVariant[];

  highlights: string[];
  description: string;
  benefits: ProductBenefit[];
  recommendedCrops: RecommendedCrop[];

  dosage: DosageRow[];
  composition: CompositionRow[];
  specifications: SpecRow[];
  howToUse: HowToUseStep[];
  safetyChecklist: string[];
  storageChecklist: string[];
  expectedResults: ExpectedResult[];
  faqs: ProductFaq[];
  certifications: ProductCertification[];
  downloads: ProductDownload[];

  featuredVideo: ProductVideo | null;
  videos: ProductVideo[];

  relatedProductsMode: RelatedProductsMode;
  relatedProductIds: string[];

  seo: ProductSeo;

  /**
   * External purchase destination — this site never processes payment
   * itself; Buy Now opens this URL in a new tab instead of local checkout.
   * Kept as flat optional fields (not a nested `commerce` object) so an
   * older product doc without either field still satisfies the type via
   * `normalizeProduct()`'s `...raw` spread, same as every other optional
   * field here. `purchasePlatform` is display-only today (e.g. shown next
   * to the admin's Purchase Link field) but keeps the schema ready to
   * support more than one destination (Amazon, Flipkart, a distributor
   * portal, ...) later without a UI rework — see `getPurchaseUrl()`.
   */
  purchaseUrl?: string;
  purchasePlatform?: string;

  createdAt?: unknown;
  updatedAt?: unknown;
}

export const emptyProductDetail: Omit<ProductDetail, 'id'> = {
  name: '',
  slug: '',
  tagline: '',
  category: '',
  brand: 'Karan Arjun Pvt. Ltd.',
  badges: [],
  sku: '',
  status: 'draft',
  featured: false,

  price: 0,
  mrp: 0,

  images: [],
  variants: [],

  highlights: [],
  description: '',
  benefits: [],
  recommendedCrops: [],

  dosage: [],
  composition: [],
  specifications: [],
  howToUse: [],
  safetyChecklist: [],
  storageChecklist: [],
  expectedResults: [],
  faqs: [],
  certifications: [],
  downloads: [],

  featuredVideo: null,
  videos: [],

  relatedProductsMode: 'auto',
  relatedProductIds: [],

  seo: emptyProductSeo,

  purchaseUrl: '',
  purchasePlatform: '',
};

/**
 * Coerces a raw Firestore doc into a well-formed `ProductDetail`, filling in
 * every field `emptyProductDetail` defines. Needed because this schema has
 * changed shape multiple times during development (media object → images[],
 * flat price/mrp added, variant.image removed) — older documents in
 * Firestore can be missing fields the current type assumes always exist
 * (e.g. `images`/`variants` as arrays, `price` as a number), and a blind
 * `as ProductDetail` cast then crashes downstream `.length`/`.map`/`[0]`
 * calls with "Cannot read properties of undefined". Every read site (Shop,
 * ProductDetailPage, ProductManager) should route raw doc data through this
 * before using it.
 */
export function normalizeProduct(id: string, raw: Record<string, unknown>): ProductDetail {
  const media = raw.media as { featuredImage?: string; gallery?: string[] } | undefined;
  const legacyImages: ProductImage[] = Array.isArray(raw.images)
    ? (raw.images as ProductImage[])
    : media
      ? [media.featuredImage, ...(media.gallery ?? [])]
          .filter((url): url is string => Boolean(url))
          .map((url, idx) => ({ id: generateId(), url, alt: '', caption: '', order: idx }))
      : [];

  return {
    ...emptyProductDetail,
    ...raw,
    id,
    badges: Array.isArray(raw.badges) ? (raw.badges as string[]) : [],
    price: typeof raw.price === 'number' ? raw.price : 0,
    mrp: typeof raw.mrp === 'number' ? raw.mrp : 0,
    images: legacyImages,
    variants: Array.isArray(raw.variants) ? (raw.variants as ProductVariant[]) : [],
    highlights: Array.isArray(raw.highlights) ? (raw.highlights as string[]) : [],
    benefits: Array.isArray(raw.benefits) ? (raw.benefits as ProductBenefit[]) : [],
    recommendedCrops: Array.isArray(raw.recommendedCrops) ? (raw.recommendedCrops as RecommendedCrop[]) : [],
    dosage: Array.isArray(raw.dosage) ? (raw.dosage as DosageRow[]) : [],
    composition: Array.isArray(raw.composition) ? (raw.composition as CompositionRow[]) : [],
    specifications: Array.isArray(raw.specifications) ? (raw.specifications as SpecRow[]) : [],
    howToUse: Array.isArray(raw.howToUse) ? (raw.howToUse as HowToUseStep[]) : [],
    safetyChecklist: Array.isArray(raw.safetyChecklist) ? (raw.safetyChecklist as string[]) : [],
    storageChecklist: Array.isArray(raw.storageChecklist) ? (raw.storageChecklist as string[]) : [],
    expectedResults: Array.isArray(raw.expectedResults) ? (raw.expectedResults as ExpectedResult[]) : [],
    faqs: Array.isArray(raw.faqs) ? (raw.faqs as ProductFaq[]) : [],
    certifications: Array.isArray(raw.certifications) ? (raw.certifications as ProductCertification[]) : [],
    downloads: Array.isArray(raw.downloads) ? (raw.downloads as ProductDownload[]) : [],
    videos: Array.isArray(raw.videos) ? (raw.videos as ProductVideo[]) : [],
    featuredVideo: (raw.featuredVideo as ProductVideo | null | undefined) ?? null,
    relatedProductIds: Array.isArray(raw.relatedProductIds) ? (raw.relatedProductIds as string[]) : [],
    relatedProductsMode: raw.relatedProductsMode === 'manual' ? 'manual' : 'auto',
    seo: { ...emptyProductSeo, ...(raw.seo as Partial<ProductSeo> | undefined) },
  };
}

/** Prepared for a future public review-submission flow (architecture only, per spec — no submission UI built yet). */
export interface ProductReview {
  id: string;
  productId: string;
  rating: number;
  authorName: string;
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: unknown;
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

export function isProductPubliclyVisible(product: ProductDetail): boolean {
  return product.status === 'published';
}

/** Lowest variant price, or undefined if the product has no variants. */
export function lowestVariantPrice(product: ProductDetail): number | undefined {
  if (product.variants.length === 0) return undefined;
  return Math.min(...product.variants.map((v) => v.price));
}

/**
 * Card/listing display price, in priority order: flat `price` field (if
 * set), else the lowest variant price, else `undefined` — callers render
 * "Contact for Price" on `undefined` rather than ever showing ₹0.
 */
export function displayPrice(product: ProductDetail): number | undefined {
  if (product.price > 0) return product.price;
  return lowestVariantPrice(product);
}

/** MRP counterpart to `displayPrice()`, for the same product/variant the price came from. */
export function displayMrp(product: ProductDetail): number | undefined {
  if (product.price > 0) return product.mrp > product.price ? product.mrp : undefined;
  if (product.variants.length === 0) return undefined;
  const cheapest = [...product.variants].sort((a, b) => a.price - b.price)[0];
  return cheapest.mrp > cheapest.price ? cheapest.mrp : undefined;
}

/** Primary/listing image: the lowest-`order` entry in `images`, or undefined if none exist yet — callers fall back to a placeholder. */
export function primaryImage(product: ProductDetail): ProductImage | undefined {
  if (product.images.length === 0) return undefined;
  return [...product.images].sort((a, b) => a.order - b.order)[0];
}

/** Remaining images (excluding the primary) in display order — for detail-page thumbnails. */
export function secondaryImages(product: ProductDetail): ProductImage[] {
  const sorted = [...product.images].sort((a, b) => a.order - b.order);
  return sorted.slice(1);
}

/** Auto-related suggestion: same category, excluding self, capped to a small count — used when relatedProductsMode === 'auto'. Manual mode uses relatedProductIds directly instead. */
export function autoRelatedProducts(product: ProductDetail, allProducts: ProductDetail[], limit = 4): ProductDetail[] {
  return allProducts
    .filter((p) => p.id !== product.id && p.category && p.category === product.category)
    .slice(0, limit);
}

/**
 * Content-validity helpers for the Product Detail page. The admin editor's
 * "Add Row" buttons create array entries with every field blank (e.g.
 * `{id, crop: '', dosage: '', ...}`), and `normalizeProduct()` can produce
 * similarly-shaped placeholders — so `array.length > 0` alone is not enough
 * to decide whether a section has real content to show. These helpers filter
 * out blank entries so the detail page only renders sections/rows that
 * actually have something to say.
 */
export function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasItems<T>(items: T[] | null | undefined): items is T[] {
  return Array.isArray(items) && items.length > 0;
}

/** True if the string array has at least one non-blank entry (e.g. highlights, safety/storage checklists). */
export function hasTextItems(items: string[] | null | undefined): boolean {
  return hasItems(items) && items.some(hasText);
}

export function meaningfulBenefits(benefits: ProductBenefit[]): ProductBenefit[] {
  return benefits.filter((b) => hasText(b.title) || hasText(b.description));
}

export function meaningfulCrops(crops: RecommendedCrop[]): RecommendedCrop[] {
  return crops.filter((c) => hasText(c.name) || hasText(c.image));
}

export function meaningfulDosageRows(rows: DosageRow[]): DosageRow[] {
  return rows.filter((r) => hasText(r.crop) || hasText(r.dosage) || hasText(r.method) || hasText(r.growthStage) || hasText(r.sprayInterval) || hasText(r.remarks));
}

export function meaningfulCompositionRows(rows: CompositionRow[]): CompositionRow[] {
  return rows.filter((r) => hasText(r.ingredient) || hasText(r.percentage));
}

export function meaningfulSpecRows(rows: SpecRow[]): SpecRow[] {
  return rows.filter((r) => hasText(r.property) || hasText(r.value));
}

export function meaningfulSteps(steps: HowToUseStep[]): HowToUseStep[] {
  return steps.filter((s) => hasText(s.title) || hasText(s.description) || hasText(s.image));
}

export function meaningfulExpectedResults(results: ExpectedResult[]): ExpectedResult[] {
  return results.filter((r) => hasText(r.day) || hasText(r.result));
}

export function meaningfulFaqs(faqs: ProductFaq[]): ProductFaq[] {
  return faqs.filter((f) => hasText(f.question) || hasText(f.answer));
}

export function meaningfulCertifications(certs: ProductCertification[]): ProductCertification[] {
  return certs.filter((c) => hasText(c.title) || hasText(c.image) || hasText(c.description));
}

export function meaningfulDownloads(downloads: ProductDownload[]): ProductDownload[] {
  return downloads.filter((d) => hasText(d.url));
}

export function meaningfulVideos(videos: ProductVideo[]): ProductVideo[] {
  return videos.filter((v) => hasText(v.url));
}

/** True for a well-formed `https://` URL — the only scheme allowed for an external purchase link. */
export function isValidHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The external purchase destination for a product, or undefined if none is
 * configured (callers should then disable Buy Now rather than link nowhere).
 * Centralizing the lookup here — instead of reading `product.purchaseUrl`
 * directly at each call site — is what keeps the eventual move to multiple
 * platforms (Amazon, Flipkart, ...) a one-function change instead of a
 * find-and-replace across Shop.tsx/ProductDetailPage.tsx.
 */
export function getPurchaseUrl(product: ProductDetail): string | undefined {
  const url = product.purchaseUrl?.trim();
  return url && isValidHttpsUrl(url) ? url : undefined;
}

/**
 * Extracts the 11-character YouTube video ID from any common URL shape —
 * standard watch links, youtu.be short links, existing /embed/ links, and
 * Shorts links (/shorts/VIDEO_ID, with or without query params like
 * ?feature=share). Single source of truth so both the normal-video embed
 * and the YouTube Short embed (see `toYouTubeEmbedUrl`) share one regex
 * instead of each screen re-deriving its own.
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

/** Builds a standard `/embed/VIDEO_ID` URL for any recognized YouTube link shape, including Shorts — the stored URL itself is never rewritten, only transformed at render time. */
export function toYouTubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
