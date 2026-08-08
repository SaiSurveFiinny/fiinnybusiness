import { useState } from 'react';
import { Icons } from '../Icons';
import { ImageUploadField } from './ImageUploadField';
import { ProductPicker } from './ProductPicker';
import {
  emptyProductDetail,
  generateId,
  isValidHttpsUrl,
  PRODUCT_CATEGORIES,
  slugify,
  type CompositionRow,
  type DosageRow,
  type DownloadType,
  type ExpectedResult,
  type HowToUseStep,
  type ProductBenefit,
  type ProductCertification,
  type ProductDetail,
  type ProductDownload,
  type ProductFaq,
  type ProductImage,
  type ProductVariant,
  type ProductVideo,
  type RecommendedCrop,
  type SpecRow,
  type VideoProvider,
} from '../../data/products';

type EditorTab =
  | 'General'
  | 'Pricing & Variants'
  | 'Product Images'
  | 'Description'
  | 'Benefits & Highlights'
  | 'Application'
  | 'Specifications'
  | 'Videos'
  | 'Downloads & Certifications'
  | 'Related Products'
  | 'SEO';

const TABS: EditorTab[] = [
  'General',
  'Pricing & Variants',
  'Product Images',
  'Description',
  'Benefits & Highlights',
  'Application',
  'Specifications',
  'Videos',
  'Downloads & Certifications',
  'Related Products',
  'SEO',
];

interface ProductEditorProps {
  product: ProductDetail | null;
  onSave: (product: Omit<ProductDetail, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';
const sectionLabelClass = 'font-sans text-xs font-bold text-primary/50 uppercase tracking-widest mb-4 block';

/** Textarea that stores/reads a string[] as newline-separated lines — same convention as CaseStudyEditor.tsx's ListTextarea (used here for Highlights/Safety/Storage checklists). */
function ListTextarea({ label, value, onChange, placeholder, rows = 4 }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <textarea
        rows={rows}
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
        placeholder={placeholder ?? 'One item per line'}
        className={`${inputClass} resize-none`}
      />
    </div>
  );
}

/**
 * Product Details CMS editor — 11-tab tabbed modal, mirroring CropEditor.tsx/
 * StoryEditor.tsx's shell exactly (inputClass/labelClass/sectionLabelClass,
 * tab strip, validate-before-save with setActiveTab jump-to-error). Every
 * repeatable section (benefits, crops, dosage, composition, specs, steps,
 * FAQ, certifications, downloads, variants, gallery, videos) follows the
 * add/update/remove-by-id pattern established in CropEditor.tsx's Problems/
 * Practices tabs, using generateId() for client-side sub-item ids.
 */
export function ProductEditor({ product, onSave, onClose }: ProductEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('General');
  const [form, setForm] = useState<Omit<ProductDetail, 'id'> & { id?: string }>(product ?? emptyProductDetail);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof ProductDetail>(key: K, value: ProductDetail[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateSeo = <K extends keyof ProductDetail['seo']>(key: K, value: ProductDetail['seo'][K]) => {
    setForm((prev) => ({ ...prev, seo: { ...prev.seo, [key]: value } }));
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({ ...prev, name, slug: prev.slug || slugify(name) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Product name is required.'); setActiveTab('General'); return; }
    if (!form.slug.trim()) { setError('Slug is required.'); setActiveTab('General'); return; }
    const purchaseUrl = form.purchaseUrl?.trim() ?? '';
    if (purchaseUrl && !isValidHttpsUrl(purchaseUrl)) {
      setError('Purchase Link must be a valid https:// URL.');
      setActiveTab('General');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave({ ...form, purchaseUrl });
      onClose();
    } catch {
      setError('Could not save product. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Variants ---
  const addVariant = () => {
    const variant: ProductVariant = { id: generateId(), label: '', price: 0, mrp: 0, stock: 0, sku: '', barcode: '' };
    update('variants', [...form.variants, variant]);
  };
  const updateVariant = (id: string, patch: Partial<ProductVariant>) => update('variants', form.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVariant = (id: string) => update('variants', form.variants.filter((v) => v.id !== id));

  // --- Benefits ---
  const addBenefit = () => {
    const benefit: ProductBenefit = { id: generateId(), icon: '', title: '', description: '', order: form.benefits.length };
    update('benefits', [...form.benefits, benefit]);
  };
  const updateBenefit = (id: string, patch: Partial<ProductBenefit>) => update('benefits', form.benefits.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBenefit = (id: string) => update('benefits', form.benefits.filter((b) => b.id !== id));
  const moveBenefit = (id: string, direction: -1 | 1) => {
    const sorted = [...form.benefits].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((b) => b.id === id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[swapIndex];
    update('benefits', form.benefits.map((item) => {
      if (item.id === a.id) return { ...item, order: b.order };
      if (item.id === b.id) return { ...item, order: a.order };
      return item;
    }));
  };

  // --- Recommended Crops ---
  const addCrop = () => {
    const crop: RecommendedCrop = { id: generateId(), name: '', image: '', order: form.recommendedCrops.length };
    update('recommendedCrops', [...form.recommendedCrops, crop]);
  };
  const updateCrop = (id: string, patch: Partial<RecommendedCrop>) => update('recommendedCrops', form.recommendedCrops.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCrop = (id: string) => update('recommendedCrops', form.recommendedCrops.filter((c) => c.id !== id));

  // --- Dosage ---
  const addDosageRow = () => {
    const row: DosageRow = { id: generateId(), crop: '', dosage: '', method: '', growthStage: '', sprayInterval: '', remarks: '' };
    update('dosage', [...form.dosage, row]);
  };
  const updateDosageRow = (id: string, patch: Partial<DosageRow>) => update('dosage', form.dosage.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeDosageRow = (id: string) => update('dosage', form.dosage.filter((r) => r.id !== id));

  // --- Composition ---
  const addCompositionRow = () => {
    const row: CompositionRow = { id: generateId(), ingredient: '', percentage: '' };
    update('composition', [...form.composition, row]);
  };
  const updateCompositionRow = (id: string, patch: Partial<CompositionRow>) => update('composition', form.composition.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeCompositionRow = (id: string) => update('composition', form.composition.filter((r) => r.id !== id));

  // --- Specifications ---
  const addSpecRow = () => {
    const row: SpecRow = { id: generateId(), property: '', value: '' };
    update('specifications', [...form.specifications, row]);
  };
  const updateSpecRow = (id: string, patch: Partial<SpecRow>) => update('specifications', form.specifications.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeSpecRow = (id: string) => update('specifications', form.specifications.filter((r) => r.id !== id));

  // --- How To Use ---
  const addStep = () => {
    const step: HowToUseStep = { id: generateId(), stepNumber: form.howToUse.length + 1, title: '', description: '', image: '' };
    update('howToUse', [...form.howToUse, step]);
  };
  const updateStep = (id: string, patch: Partial<HowToUseStep>) => update('howToUse', form.howToUse.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStep = (id: string) => update('howToUse', form.howToUse.filter((s) => s.id !== id));

  // --- Expected Results ---
  const addExpectedResult = () => {
    const result: ExpectedResult = { id: generateId(), day: '', result: '' };
    update('expectedResults', [...form.expectedResults, result]);
  };
  const updateExpectedResult = (id: string, patch: Partial<ExpectedResult>) => update('expectedResults', form.expectedResults.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeExpectedResult = (id: string) => update('expectedResults', form.expectedResults.filter((r) => r.id !== id));

  // --- FAQ ---
  const addFaq = () => {
    const faq: ProductFaq = { id: generateId(), question: '', answer: '', order: form.faqs.length };
    update('faqs', [...form.faqs, faq]);
  };
  const updateFaq = (id: string, patch: Partial<ProductFaq>) => update('faqs', form.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeFaq = (id: string) => update('faqs', form.faqs.filter((f) => f.id !== id));

  // --- Certifications ---
  const addCertification = () => {
    const cert: ProductCertification = { id: generateId(), title: '', image: '', description: '', certificateNumber: '', expiryDate: '' };
    update('certifications', [...form.certifications, cert]);
  };
  const updateCertification = (id: string, patch: Partial<ProductCertification>) => update('certifications', form.certifications.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCertification = (id: string) => update('certifications', form.certifications.filter((c) => c.id !== id));

  // --- Downloads ---
  const addDownload = () => {
    const download: ProductDownload = { id: generateId(), title: '', type: 'pdf', url: '', size: '' };
    update('downloads', [...form.downloads, download]);
  };
  const updateDownload = (id: string, patch: Partial<ProductDownload>) => update('downloads', form.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const removeDownload = (id: string) => update('downloads', form.downloads.filter((d) => d.id !== id));

  // --- Videos ---
  const addVideo = () => {
    const video: ProductVideo = { id: generateId(), title: '', provider: 'youtube', url: '', thumbnail: '', featured: false };
    update('videos', [...form.videos, video]);
  };
  const updateVideo = (id: string, patch: Partial<ProductVideo>) => update('videos', form.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVideo = (id: string) => update('videos', form.videos.filter((v) => v.id !== id));

  // --- Product Images (single source of truth for all product media) ---
  const addImage = () => {
    const image: ProductImage = { id: generateId(), url: '', alt: '', caption: '', order: form.images.length };
    update('images', [...form.images, image]);
  };
  const updateImage = (id: string, patch: Partial<ProductImage>) => update('images', form.images.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  const removeImage = (id: string) => update('images', form.images.filter((img) => img.id !== id));
  const moveImage = (id: string, direction: -1 | 1) => {
    const sorted = [...form.images].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((img) => img.id === id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[swapIndex];
    update('images', form.images.map((item) => {
      if (item.id === a.id) return { ...item, order: b.order };
      if (item.id === b.id) return { ...item, order: a.order };
      return item;
    }));
  };
  const setPrimaryImage = (id: string) => {
    const sorted = [...form.images].sort((a, b) => a.order - b.order);
    const target = sorted.find((img) => img.id === id);
    if (!target || sorted[0]?.id === id) return;
    const others = sorted.filter((img) => img.id !== id);
    update('images', [target, ...others].map((img, idx) => ({ ...img, order: idx })));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex gap-1 px-8 pt-4 border-b border-slate-100 overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 font-sans text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-primary/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            {activeTab === 'General' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Product Name *</label>
                    <input type="text" required value={form.name} onChange={(e) => handleNameChange(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Slug *</label>
                    <input type="text" required value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} className={inputClass} placeholder="power-plus" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Tagline</label>
                  <input type="text" value={form.tagline} onChange={(e) => update('tagline', e.target.value)} className={inputClass} placeholder="Short one-line hook shown under the product name" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Category</label>
                    <select value={form.category} onChange={(e) => update('category', e.target.value)} className={inputClass}>
                      <option value="">Select a category</option>
                      {form.category && !PRODUCT_CATEGORIES.includes(form.category) && (
                        <option value={form.category}>{form.category}</option>
                      )}
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Brand</label>
                    <input type="text" value={form.brand} onChange={(e) => update('brand', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>SKU</label>
                    <input type="text" value={form.sku} onChange={(e) => update('sku', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <ListTextarea label="Badges" value={form.badges} onChange={(v) => update('badges', v)} placeholder="e.g. Best Value&#10;Popular&#10;Low Stock" rows={3} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={form.status} onChange={(e) => update('status', e.target.value as ProductDetail['status'])} className={inputClass}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold self-end pb-3">
                    <input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Featured Product
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className={sectionLabelClass}>Commerce</span>
                  <label className={labelClass}>Purchase Link (KrishiDukan Product URL)</label>
                  <input
                    type="url"
                    value={form.purchaseUrl ?? ''}
                    onChange={(e) => update('purchaseUrl', e.target.value)}
                    className={inputClass}
                    placeholder="https://krishidukan.com/product/..."
                  />
                  <p className="text-xs text-slate-400 font-sans mt-2">This URL is opened when customers click Buy Now. Leave blank to disable Buy Now for this product.</p>
                </div>
              </div>
            )}

            {activeTab === 'Pricing & Variants' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Variants ({form.variants.length})</span>
                  <button type="button" onClick={addVariant} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Variant
                  </button>
                </div>
                {form.variants.map((variant, idx) => (
                  <div key={variant.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">Variant {idx + 1}</span>
                      <button type="button" onClick={() => removeVariant(variant.id)} className="text-red-500 hover:text-red-700">
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <input type="text" value={variant.label} onChange={(e) => updateVariant(variant.id, { label: e.target.value })} placeholder="Size (e.g. 1 L)" className={inputClass} />
                      <input type="number" value={variant.price || ''} onChange={(e) => updateVariant(variant.id, { price: Number(e.target.value) })} placeholder="Price" className={inputClass} />
                      <input type="number" value={variant.mrp || ''} onChange={(e) => updateVariant(variant.id, { mrp: Number(e.target.value) })} placeholder="MRP" className={inputClass} />
                      <input type="number" value={variant.stock || ''} onChange={(e) => updateVariant(variant.id, { stock: Number(e.target.value) })} placeholder="Stock" className={inputClass} />
                      <input type="text" value={variant.sku} onChange={(e) => updateVariant(variant.id, { sku: e.target.value })} placeholder="SKU" className={inputClass} />
                      <input type="text" value={variant.barcode} onChange={(e) => updateVariant(variant.id, { barcode: e.target.value })} placeholder="Barcode" className={inputClass} />
                    </div>
                  </div>
                ))}
                {form.variants.length === 0 && <p className="text-sm text-slate-400 font-sans">No variants added yet — add at least one size/pack to make this product purchasable.</p>}

                <div className="pt-2 border-t border-slate-100">
                  <span className={`${sectionLabelClass} mb-2`}>Flat Price (used only if this product has no variants)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={form.price || ''} onChange={(e) => update('price', Number(e.target.value))} placeholder="Price" className={inputClass} />
                    <input type="number" value={form.mrp || ''} onChange={(e) => update('mrp', Number(e.target.value))} placeholder="MRP (optional)" className={inputClass} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Product Images' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Product Images ({form.images.length})</span>
                  <button type="button" onClick={addImage} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Image
                  </button>
                </div>
                {[...form.images].sort((a, b) => a.order - b.order).map((image, idx, sorted) => (
                  <div key={image.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">Image {idx + 1}</span>
                        {idx === 0 && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-secondary-container/20 text-secondary">Primary</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {idx !== 0 && (
                          <button type="button" onClick={() => setPrimaryImage(image.id)} className="text-xs font-sans font-bold text-primary hover:underline mr-2">Set as Primary</button>
                        )}
                        <button type="button" onClick={() => moveImage(image.id, -1)} disabled={idx === 0} className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                          <Icons.ArrowUp className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => moveImage(image.id, 1)} disabled={idx === sorted.length - 1} className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                          <Icons.ArrowDown className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => removeImage(image.id)} className="text-red-500 hover:text-red-700 ml-2">
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <ImageUploadField label="Image" value={image.url} onChange={(url) => updateImage(image.id, { url })} folder="products/images" previewClassName="w-full h-40 object-cover rounded-xl border border-slate-200" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={image.alt} onChange={(e) => updateImage(image.id, { alt: e.target.value })} placeholder="Alt text" className={inputClass} />
                      <input type="text" value={image.caption} onChange={(e) => updateImage(image.id, { caption: e.target.value })} placeholder="Caption (optional)" className={inputClass} />
                    </div>
                  </div>
                ))}
                {form.images.length === 0 && <p className="text-sm text-slate-400 font-sans">No images added yet — the first image becomes the primary image shown on the Shop page.</p>}
              </div>
            )}

            {activeTab === 'Description' && (
              <div className="space-y-6">
                <ListTextarea label="Key Highlights" value={form.highlights} onChange={(v) => update('highlights', v)} placeholder="One highlight per line, e.g.&#10;Improves flowering&#10;Higher yield" rows={5} />
                <div>
                  <label className={labelClass}>Full Description</label>
                  <textarea rows={10} value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} resize-none`} placeholder="Supports plain paragraphs — separate paragraphs with a blank line." />
                  <p className="text-xs text-slate-400 font-sans mt-2">Plain-text paragraphs, matching this project's existing blog/guide content convention — no rich-text editor dependency added.</p>
                </div>
              </div>
            )}

            {activeTab === 'Benefits & Highlights' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Benefits ({form.benefits.length})</span>
                  <button type="button" onClick={addBenefit} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Benefit
                  </button>
                </div>
                {[...form.benefits].sort((a, b) => a.order - b.order).map((benefit, idx, sorted) => (
                  <div key={benefit.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">Benefit {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => moveBenefit(benefit.id, -1)} disabled={idx === 0} className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                          <Icons.ArrowUp className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => moveBenefit(benefit.id, 1)} disabled={idx === sorted.length - 1} className="p-1.5 text-slate-400 hover:text-primary disabled:opacity-30 transition-colors">
                          <Icons.ArrowDown className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => removeBenefit(benefit.id)} className="text-red-500 hover:text-red-700 ml-2">
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <input type="text" value={benefit.title} onChange={(e) => updateBenefit(benefit.id, { title: e.target.value })} placeholder="Title" className={inputClass} />
                    <textarea rows={2} value={benefit.description} onChange={(e) => updateBenefit(benefit.id, { description: e.target.value })} placeholder="Description" className={`${inputClass} resize-none`} />
                    <ImageUploadField label="Icon (upload or paste an icon/image URL)" value={benefit.icon} onChange={(url) => updateBenefit(benefit.id, { icon: url })} folder="products/benefits" previewClassName="w-12 h-12 object-contain rounded border border-slate-200" />
                  </div>
                ))}
                {form.benefits.length === 0 && <p className="text-sm text-slate-400 font-sans">No benefits added yet.</p>}
              </div>
            )}

            {activeTab === 'Application' && (
              <div className="space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>Recommended Crops ({form.recommendedCrops.length})</span>
                    <button type="button" onClick={addCrop} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Crop
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {form.recommendedCrops.map((crop) => (
                      <div key={crop.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 flex flex-col">
                        <div className="flex items-center justify-between">
                          <input type="text" value={crop.name} onChange={(e) => updateCrop(crop.id, { name: e.target.value })} placeholder="Crop name" className={`${inputClass} flex-1 min-w-0 mr-2`} />
                          <button type="button" onClick={() => removeCrop(crop.id)} className="text-red-500 hover:text-red-700 shrink-0">
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </div>
                        <ImageUploadField label="Crop Image" value={crop.image} onChange={(url) => updateCrop(crop.id, { image: url })} folder="products/crops" previewClassName="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                      </div>
                    ))}
                  </div>
                  {form.recommendedCrops.length === 0 && <p className="text-sm text-slate-400 font-sans">No recommended crops added yet.</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>Dosage & Application ({form.dosage.length})</span>
                    <button type="button" onClick={addDosageRow} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Row
                    </button>
                  </div>
                  {form.dosage.map((row, idx) => (
                    <div key={row.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">Row {idx + 1}</span>
                        <button type="button" onClick={() => removeDosageRow(row.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <input type="text" value={row.crop} onChange={(e) => updateDosageRow(row.id, { crop: e.target.value })} placeholder="Crop" className={inputClass} />
                        <input type="text" value={row.dosage} onChange={(e) => updateDosageRow(row.id, { dosage: e.target.value })} placeholder="Dosage" className={inputClass} />
                        <input type="text" value={row.method} onChange={(e) => updateDosageRow(row.id, { method: e.target.value })} placeholder="Method" className={inputClass} />
                        <input type="text" value={row.growthStage} onChange={(e) => updateDosageRow(row.id, { growthStage: e.target.value })} placeholder="Growth Stage" className={inputClass} />
                        <input type="text" value={row.sprayInterval} onChange={(e) => updateDosageRow(row.id, { sprayInterval: e.target.value })} placeholder="Spray Interval" className={inputClass} />
                        <input type="text" value={row.remarks} onChange={(e) => updateDosageRow(row.id, { remarks: e.target.value })} placeholder="Remarks" className={inputClass} />
                      </div>
                    </div>
                  ))}
                  {form.dosage.length === 0 && <p className="text-sm text-slate-400 font-sans">No dosage rows added yet.</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>How To Use ({form.howToUse.length})</span>
                    <button type="button" onClick={addStep} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Step
                    </button>
                  </div>
                  {form.howToUse.map((step, idx) => (
                    <div key={step.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">Step {idx + 1}</span>
                        <button type="button" onClick={() => removeStep(step.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4" /></button>
                      </div>
                      <input type="text" value={step.title} onChange={(e) => updateStep(step.id, { title: e.target.value })} placeholder="Step title" className={inputClass} />
                      <textarea rows={2} value={step.description} onChange={(e) => updateStep(step.id, { description: e.target.value })} placeholder="Description" className={`${inputClass} resize-none`} />
                      <ImageUploadField label="Illustration" value={step.image} onChange={(url) => updateStep(step.id, { image: url })} folder="products/steps" previewClassName="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    </div>
                  ))}
                  {form.howToUse.length === 0 && <p className="text-sm text-slate-400 font-sans">No steps added yet.</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ListTextarea label="Safety Information" value={form.safetyChecklist} onChange={(v) => update('safetyChecklist', v)} placeholder="One safety item per line" />
                  <ListTextarea label="Storage Instructions" value={form.storageChecklist} onChange={(v) => update('storageChecklist', v)} placeholder="One storage item per line" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>Expected Results ({form.expectedResults.length})</span>
                    <button type="button" onClick={addExpectedResult} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Result
                    </button>
                  </div>
                  {form.expectedResults.map((result) => (
                    <div key={result.id} className="grid gap-2 mb-2" style={{ gridTemplateColumns: '22% 1fr auto' }}>
                      <input type="text" value={result.day} onChange={(e) => updateExpectedResult(result.id, { day: e.target.value })} placeholder="Day (e.g. Day 7)" className={`${inputClass} min-w-0`} />
                      <input type="text" value={result.result} onChange={(e) => updateExpectedResult(result.id, { result: e.target.value })} placeholder="Expected result description" className={`${inputClass} min-w-0`} />
                      <button type="button" onClick={() => removeExpectedResult(result.id)} className="text-red-500 hover:text-red-700 self-center"><Icons.Trash className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {form.expectedResults.length === 0 && <p className="text-sm text-slate-400 font-sans">No expected results added yet.</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>FAQ ({form.faqs.length})</span>
                    <button type="button" onClick={addFaq} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add FAQ
                    </button>
                  </div>
                  {form.faqs.map((faq, idx) => (
                    <div key={faq.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">FAQ {idx + 1}</span>
                        <button type="button" onClick={() => removeFaq(faq.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4" /></button>
                      </div>
                      <input type="text" value={faq.question} onChange={(e) => updateFaq(faq.id, { question: e.target.value })} placeholder="Question" className={inputClass} />
                      <textarea rows={2} value={faq.answer} onChange={(e) => updateFaq(faq.id, { answer: e.target.value })} placeholder="Answer" className={`${inputClass} resize-none`} />
                    </div>
                  ))}
                  {form.faqs.length === 0 && <p className="text-sm text-slate-400 font-sans">No FAQs added yet.</p>}
                </div>
              </div>
            )}

            {activeTab === 'Specifications' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Composition ({form.composition.length})</span>
                  <button type="button" onClick={addCompositionRow} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Row
                  </button>
                </div>
                {form.composition.map((row) => (
                  <div key={row.id} className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                    <input type="text" value={row.ingredient} onChange={(e) => updateCompositionRow(row.id, { ingredient: e.target.value })} placeholder="Ingredient Name" className={`${inputClass} min-w-0`} />
                    <input type="text" value={row.percentage} onChange={(e) => updateCompositionRow(row.id, { percentage: e.target.value })} placeholder="Percentage / Value" className={`${inputClass} min-w-0`} />
                    <button type="button" onClick={() => removeCompositionRow(row.id)} className="text-red-500 hover:text-red-700 self-center"><Icons.Trash className="w-4 h-4" /></button>
                  </div>
                ))}
                {form.composition.length === 0 && <p className="text-sm text-slate-400 font-sans">No composition rows added yet.</p>}

                <div className="flex items-center justify-between pt-4">
                  <span className={sectionLabelClass}>Technical Specifications ({form.specifications.length})</span>
                  <button type="button" onClick={addSpecRow} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Row
                  </button>
                </div>
                {form.specifications.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input type="text" value={row.property} onChange={(e) => updateSpecRow(row.id, { property: e.target.value })} placeholder="Property" className={`${inputClass} flex-1 min-w-0`} />
                    <input type="text" value={row.value} onChange={(e) => updateSpecRow(row.id, { value: e.target.value })} placeholder="Value" className={`${inputClass} flex-1 min-w-0`} />
                    <button type="button" onClick={() => removeSpecRow(row.id)} className="text-red-500 hover:text-red-700 shrink-0"><Icons.Trash className="w-4 h-4" /></button>
                  </div>
                ))}
                {form.specifications.length === 0 && <p className="text-sm text-slate-400 font-sans">No specification rows added yet.</p>}
              </div>
            )}

            {activeTab === 'Videos' && (
              <div className="space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>Videos ({form.videos.length})</span>
                    <button type="button" onClick={addVideo} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Video
                    </button>
                  </div>
                  {form.videos.map((video, idx) => (
                    <div key={video.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">Video {idx + 1}</span>
                        <button type="button" onClick={() => removeVideo(video.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="text" value={video.title} onChange={(e) => updateVideo(video.id, { title: e.target.value })} placeholder="Title" className={inputClass} />
                        <select value={video.provider} onChange={(e) => updateVideo(video.id, { provider: e.target.value as VideoProvider })} className={inputClass}>
                          <option value="youtube">YouTube</option>
                          <option value="youtubeShort">YouTube Short</option>
                          <option value="vimeo">Vimeo</option>
                          <option value="upload">Uploaded Video</option>
                        </select>
                      </div>
                      {video.provider === 'upload' ? (
                        <ImageUploadField label="Video File" value={video.url} onChange={(url) => updateVideo(video.id, { url })} folder="products/videos" accept="video/*" />
                      ) : (
                        <input
                          type="text"
                          value={video.url}
                          onChange={(e) => updateVideo(video.id, { url: e.target.value })}
                          placeholder={video.provider === 'youtubeShort' ? 'https://www.youtube.com/shorts/VIDEO_ID' : 'Video URL'}
                          className={inputClass}
                        />
                      )}
                      <ImageUploadField label="Thumbnail" value={video.thumbnail} onChange={(url) => updateVideo(video.id, { thumbnail: url })} folder="products/videos" previewClassName="w-24 h-16 object-cover rounded-lg border border-slate-200" />
                    </div>
                  ))}
                  {form.videos.length === 0 && <p className="text-sm text-slate-400 font-sans">No videos added yet.</p>}
                </div>
              </div>
            )}

            {activeTab === 'Downloads & Certifications' && (
              <div className="space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>Downloads ({form.downloads.length})</span>
                    <button type="button" onClick={addDownload} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Download
                    </button>
                  </div>
                  {form.downloads.map((download, idx) => (
                    <div key={download.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">Download {idx + 1}</span>
                        <button type="button" onClick={() => removeDownload(download.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input type="text" value={download.title} onChange={(e) => updateDownload(download.id, { title: e.target.value })} placeholder="Title (e.g. Brochure)" className={`${inputClass} md:col-span-2`} />
                        <select value={download.type} onChange={(e) => updateDownload(download.id, { type: e.target.value as DownloadType })} className={inputClass}>
                          <option value="pdf">PDF</option>
                          <option value="doc">Document</option>
                          <option value="image">Image</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <ImageUploadField label="File" value={download.url} onChange={(url) => updateDownload(download.id, { url })} folder="products/downloads" accept="application/pdf" />
                      <input type="text" value={download.size} onChange={(e) => updateDownload(download.id, { size: e.target.value })} placeholder="Display size (e.g. 2.3 MB)" className={inputClass} />
                    </div>
                  ))}
                  {form.downloads.length === 0 && <p className="text-sm text-slate-400 font-sans">No downloads added yet.</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={sectionLabelClass}>Certifications ({form.certifications.length})</span>
                    <button type="button" onClick={addCertification} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                      <Icons.Plus className="w-4 h-4" /> Add Certification
                    </button>
                  </div>
                  {form.certifications.map((cert, idx) => (
                    <div key={cert.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-primary/50 uppercase">Certification {idx + 1}</span>
                        <button type="button" onClick={() => removeCertification(cert.id)} className="text-red-500 hover:text-red-700"><Icons.Trash className="w-4 h-4" /></button>
                      </div>
                      <input type="text" value={cert.title} onChange={(e) => updateCertification(cert.id, { title: e.target.value })} placeholder="e.g. ISO 9001:2015" className={inputClass} />
                      <textarea rows={2} value={cert.description} onChange={(e) => updateCertification(cert.id, { description: e.target.value })} placeholder="Description" className={`${inputClass} resize-none`} />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={cert.certificateNumber} onChange={(e) => updateCertification(cert.id, { certificateNumber: e.target.value })} placeholder="Certificate Number" className={inputClass} />
                        <input type="date" value={cert.expiryDate} onChange={(e) => updateCertification(cert.id, { expiryDate: e.target.value })} placeholder="Expiry (optional)" className={inputClass} />
                      </div>
                      <ImageUploadField label="Certificate Image" value={cert.image} onChange={(url) => updateCertification(cert.id, { image: url })} folder="products/certifications" previewClassName="w-24 h-24 object-cover rounded-lg border border-slate-200" />
                    </div>
                  ))}
                  {form.certifications.length === 0 && <p className="text-sm text-slate-400 font-sans">No certifications added yet.</p>}
                </div>
              </div>
            )}

            {activeTab === 'Related Products' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Related Products Mode</label>
                  <div className="flex gap-6">
                    <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                      <input type="radio" checked={form.relatedProductsMode === 'auto'} onChange={() => update('relatedProductsMode', 'auto')} className="h-4 w-4" />
                      Auto (same category)
                    </label>
                    <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                      <input type="radio" checked={form.relatedProductsMode === 'manual'} onChange={() => update('relatedProductsMode', 'manual')} className="h-4 w-4" />
                      Manual Selection
                    </label>
                  </div>
                  <p className="text-xs text-slate-400 font-sans mt-2">Auto suggests other published products in the same Category. Manual overrides auto with your own picks.</p>
                </div>
                {form.relatedProductsMode === 'manual' && (
                  <ProductPicker selectedIds={form.relatedProductIds} onChange={(ids) => update('relatedProductIds', ids)} />
                )}
              </div>
            )}

            {activeTab === 'SEO' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Meta Title</label>
                  <input type="text" value={form.seo.metaTitle} onChange={(e) => updateSeo('metaTitle', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Meta Description</label>
                  <textarea rows={3} value={form.seo.metaDescription} onChange={(e) => updateSeo('metaDescription', e.target.value)} className={`${inputClass} resize-none`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Keywords (comma-separated)</label>
                    <input type="text" value={form.seo.keywords} onChange={(e) => updateSeo('keywords', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Focus Keyword</label>
                    <input type="text" value={form.seo.focusKeyword} onChange={(e) => updateSeo('focusKeyword', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <ImageUploadField label="OpenGraph Image" value={form.seo.ogImage} onChange={(url) => updateSeo('ogImage', url)} folder="products/og" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Canonical URL</label>
                    <input type="text" value={form.seo.canonicalUrl} onChange={(e) => updateSeo('canonicalUrl', e.target.value)} className={inputClass} placeholder="Auto-generated if left blank" />
                  </div>
                  <div>
                    <label className={labelClass}>Robots</label>
                    <select value={form.seo.robots} onChange={(e) => updateSeo('robots', e.target.value as ProductDetail['seo']['robots'])} className={inputClass}>
                      <option value="index">Index</option>
                      <option value="noindex">No-index</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Schema Override (advanced, optional)</label>
                  <textarea rows={4} value={form.seo.schemaOverride} onChange={(e) => updateSeo('schemaOverride', e.target.value)} className={`${inputClass} resize-none font-mono text-xs`} placeholder="Raw JSON-LD to merge over the auto-generated Product schema" />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
