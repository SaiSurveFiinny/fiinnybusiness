import { useState } from 'react';
import { Icons } from '../Icons';
import { ImageUploadField } from './ImageUploadField';
import { ProductPicker } from './ProductPicker';
import {
  emptyCropSolution,
  generateId,
  slugify,
  type CropCategory,
  type CropFaq,
  type CropGuide,
  type CropPractice,
  type CropProblem,
  type CropSolution,
  type CropVideo,
} from '../../data/cropSolutions';

type EditorTab = 'Basic' | 'Problems' | 'Practices' | 'Guides' | 'Videos' | 'FAQ' | 'SEO';
const TABS: EditorTab[] = ['Basic', 'Problems', 'Practices', 'Guides', 'Videos', 'FAQ', 'SEO'];

interface CropEditorProps {
  crop: CropSolution | null;
  categories: CropCategory[];
  defaultCategoryId?: string;
  onSave: (crop: Omit<CropSolution, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';
const sectionLabelClass = 'font-sans text-xs font-bold text-primary/50 uppercase tracking-widest mb-4 block';

/**
 * Modern tabbed CMS editor for a single crop — Basic / Problems / Practices /
 * Guides / Videos / FAQ / SEO, each an independent tab rather than one long
 * scrolling modal. All list fields (problems, practices, guides, videos,
 * faqs) support unlimited entries via add/remove, matching the repeatable-
 * entry pattern already used for products/blogs in Admin.tsx, generalized
 * to nested arrays within a single crop document.
 */
export function CropEditor({ crop, categories, defaultCategoryId, onSave, onClose }: CropEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('Basic');
  const [form, setForm] = useState<Omit<CropSolution, 'id'> & { id?: string }>(
    crop ?? { ...emptyCropSolution, categoryId: defaultCategoryId ?? categories[0]?.id ?? '' },
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [galleryInput, setGalleryInput] = useState('');

  const update = <K extends keyof CropSolution>(key: K, value: CropSolution[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({ ...prev, name, slug: prev.slug || slugify(name) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Crop name is required.');
      setActiveTab('Basic');
      return;
    }
    if (!form.slug.trim()) {
      setError('Slug is required.');
      setActiveTab('Basic');
      return;
    }
    if (!form.categoryId) {
      setError('Please select a category.');
      setActiveTab('Basic');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Could not save crop. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Problems ---
  const addProblem = () => {
    const newProblem: CropProblem = {
      id: generateId(), title: '', severity: 'Medium', symptoms: '', causes: '', solution: '', productIds: [], image: '', order: form.problems.length,
    };
    update('problems', [...form.problems, newProblem]);
  };
  const updateProblem = (id: string, patch: Partial<CropProblem>) => {
    update('problems', form.problems.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removeProblem = (id: string) => update('problems', form.problems.filter((p) => p.id !== id));

  // --- Practices ---
  const addPractice = () => {
    const newPractice: CropPractice = {
      id: generateId(), title: '', description: '', stage: '', season: '', image: '', productIds: [], guideId: '', order: form.practices.length,
    };
    update('practices', [...form.practices, newPractice]);
  };
  const updatePractice = (id: string, patch: Partial<CropPractice>) => {
    update('practices', form.practices.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePractice = (id: string) => update('practices', form.practices.filter((p) => p.id !== id));

  // --- Guides ---
  const addGuide = () => {
    const newGuide: CropGuide = { id: generateId(), title: '', description: '', type: 'article', pdfUrl: '', articleContent: '', thumbnail: '' };
    update('guides', [...form.guides, newGuide]);
  };
  const updateGuide = (id: string, patch: Partial<CropGuide>) => {
    update('guides', form.guides.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };
  const removeGuide = (id: string) => update('guides', form.guides.filter((g) => g.id !== id));

  // --- Videos ---
  const addVideo = () => {
    const newVideo: CropVideo = { id: generateId(), title: '', provider: 'youtube', url: '', thumbnail: '', duration: '' };
    update('videos', [...form.videos, newVideo]);
  };
  const updateVideo = (id: string, patch: Partial<CropVideo>) => {
    update('videos', form.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };
  const removeVideo = (id: string) => update('videos', form.videos.filter((v) => v.id !== id));

  // --- FAQs ---
  const addFaq = () => {
    const newFaq: CropFaq = { id: generateId(), question: '', answer: '', order: form.faqs.length };
    update('faqs', [...form.faqs, newFaq]);
  };
  const updateFaq = (id: string, patch: Partial<CropFaq>) => {
    update('faqs', form.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const removeFaq = (id: string) => update('faqs', form.faqs.filter((f) => f.id !== id));

  const addGalleryImage = () => {
    if (!galleryInput.trim()) return;
    update('gallery', [...form.gallery, galleryInput.trim()]);
    setGalleryInput('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{crop ? 'Edit Crop' : 'Add Crop'}</h2>
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            {activeTab === 'Basic' && (
              <div className="space-y-6">
                <div>
                  <span className={sectionLabelClass}>Basic Info</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Crop Name *</label>
                      <input type="text" required value={form.name} onChange={(e) => handleNameChange(e.target.value)} className={inputClass} placeholder="e.g. Banana" />
                    </div>
                    <div>
                      <label className={labelClass}>Slug *</label>
                      <input type="text" required value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} className={inputClass} placeholder="banana" />
                    </div>
                    <div>
                      <label className={labelClass}>Category *</label>
                      <select value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)} className={inputClass}>
                        <option value="">Select category...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Scientific Name</label>
                      <input type="text" value={form.scientificName} onChange={(e) => update('scientificName', e.target.value)} className={inputClass} placeholder="e.g. Musa acuminata" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Short Description</label>
                  <input type="text" value={form.shortDescription} onChange={(e) => update('shortDescription', e.target.value)} className={inputClass} placeholder="One-line summary shown on crop cards" />
                </div>

                <div>
                  <label className={labelClass}>Long Overview</label>
                  <textarea rows={4} value={form.longOverview} onChange={(e) => update('longOverview', e.target.value)} className={`${inputClass} resize-none`} placeholder="Full overview shown on the crop detail page" />
                </div>

                <ImageUploadField label="Hero Image" value={form.heroImage} onChange={(url) => update('heroImage', url)} folder="crop-solutions/hero" previewClassName="w-full h-40 object-cover rounded-xl border border-slate-200" />

                <div>
                  <label className={labelClass}>Gallery</label>
                  <div className="flex gap-2 mb-3">
                    <input type="text" value={galleryInput} onChange={(e) => setGalleryInput(e.target.value)} placeholder="Paste an image URL" className={`${inputClass} flex-1`} />
                    <button type="button" onClick={addGalleryImage} className="px-4 py-3 rounded-xl bg-primary text-secondary-container font-sans font-bold text-sm shrink-0">Add</button>
                  </div>
                  {form.gallery.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {form.gallery.map((url, idx) => (
                        <div key={`${url}-${idx}`} className="relative group">
                          <img src={url} alt="" className="w-full h-20 object-cover rounded-lg border border-slate-200" />
                          <button
                            type="button"
                            onClick={() => update('gallery', form.gallery.filter((_, i) => i !== idx))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Icons.X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Climate</label>
                    <input type="text" value={form.climate} onChange={(e) => update('climate', e.target.value)} className={inputClass} placeholder="e.g. Tropical" />
                  </div>
                  <div>
                    <label className={labelClass}>Soil</label>
                    <input type="text" value={form.soil} onChange={(e) => update('soil', e.target.value)} className={inputClass} placeholder="e.g. Well-drained" />
                  </div>
                  <div>
                    <label className={labelClass}>Season</label>
                    <input type="text" value={form.season} onChange={(e) => update('season', e.target.value)} className={inputClass} placeholder="e.g. Year-round" />
                  </div>
                  <div>
                    <label className={labelClass}>Regions</label>
                    <input type="text" value={form.regions} onChange={(e) => update('regions', e.target.value)} className={inputClass} placeholder="e.g. Maharashtra" />
                  </div>
                </div>

                <div className="flex items-center gap-8 pt-2">
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                    <input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Featured
                  </label>
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                    <input type="checkbox" checked={form.published} onChange={(e) => update('published', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Published
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'Problems' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Common Problems ({form.problems.length})</span>
                  <button type="button" onClick={addProblem} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Problem
                  </button>
                </div>
                {form.problems.map((problem, idx) => (
                  <div key={problem.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">Problem {idx + 1}</span>
                      <button type="button" onClick={() => removeProblem(problem.id)} className="text-red-500 hover:text-red-700">
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input type="text" value={problem.title} onChange={(e) => updateProblem(problem.id, { title: e.target.value })} placeholder="Title" className={`${inputClass} md:col-span-2`} />
                      <select value={problem.severity} onChange={(e) => updateProblem(problem.id, { severity: e.target.value as CropProblem['severity'] })} className={inputClass}>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <textarea rows={2} value={problem.symptoms} onChange={(e) => updateProblem(problem.id, { symptoms: e.target.value })} placeholder="Symptoms" className={`${inputClass} resize-none`} />
                    <textarea rows={2} value={problem.causes} onChange={(e) => updateProblem(problem.id, { causes: e.target.value })} placeholder="Causes" className={`${inputClass} resize-none`} />
                    <textarea rows={2} value={problem.solution} onChange={(e) => updateProblem(problem.id, { solution: e.target.value })} placeholder="Recommended solution" className={`${inputClass} resize-none`} />
                    <ImageUploadField label="Image" value={problem.image} onChange={(url) => updateProblem(problem.id, { image: url })} folder="crop-solutions/problems" />
                    <ProductPicker selectedIds={problem.productIds} onChange={(ids) => updateProblem(problem.id, { productIds: ids })} />
                  </div>
                ))}
                {form.problems.length === 0 && <p className="text-sm text-slate-400 font-sans">No problems added yet.</p>}
              </div>
            )}

            {activeTab === 'Practices' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Recommended Practices ({form.practices.length})</span>
                  <button type="button" onClick={addPractice} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Practice
                  </button>
                </div>
                {form.practices.map((practice, idx) => (
                  <div key={practice.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">Practice {idx + 1}</span>
                      <button type="button" onClick={() => removePractice(practice.id)} className="text-red-500 hover:text-red-700">
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <input type="text" value={practice.title} onChange={(e) => updatePractice(practice.id, { title: e.target.value })} placeholder="Title" className={inputClass} />
                    <textarea rows={2} value={practice.description} onChange={(e) => updatePractice(practice.id, { description: e.target.value })} placeholder="Description" className={`${inputClass} resize-none`} />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={practice.stage} onChange={(e) => updatePractice(practice.id, { stage: e.target.value })} placeholder="Growth stage" className={inputClass} />
                      <input type="text" value={practice.season} onChange={(e) => updatePractice(practice.id, { season: e.target.value })} placeholder="Season" className={inputClass} />
                    </div>
                    <ImageUploadField label="Image" value={practice.image} onChange={(url) => updatePractice(practice.id, { image: url })} folder="crop-solutions/practices" />
                    <ProductPicker selectedIds={practice.productIds} onChange={(ids) => updatePractice(practice.id, { productIds: ids })} />
                    <div>
                      <label className={labelClass}>Related Guide</label>
                      <select value={practice.guideId} onChange={(e) => updatePractice(practice.id, { guideId: e.target.value })} className={inputClass}>
                        <option value="">None</option>
                        {form.guides.map((g) => (
                          <option key={g.id} value={g.id}>{g.title || 'Untitled guide'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
                {form.practices.length === 0 && <p className="text-sm text-slate-400 font-sans">No practices added yet.</p>}
              </div>
            )}

            {activeTab === 'Guides' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Downloadable Guides ({form.guides.length})</span>
                  <button type="button" onClick={addGuide} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Guide
                  </button>
                </div>
                {form.guides.map((guide, idx) => (
                  <div key={guide.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">Guide {idx + 1}</span>
                      <button type="button" onClick={() => removeGuide(guide.id)} className="text-red-500 hover:text-red-700">
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={guide.title} onChange={(e) => updateGuide(guide.id, { title: e.target.value })} placeholder="Title" className={inputClass} />
                      <select value={guide.type} onChange={(e) => updateGuide(guide.id, { type: e.target.value as CropGuide['type'] })} className={inputClass}>
                        <option value="article">Rich Article</option>
                        <option value="pdf">PDF Upload</option>
                      </select>
                    </div>
                    <textarea rows={2} value={guide.description} onChange={(e) => updateGuide(guide.id, { description: e.target.value })} placeholder="Description" className={`${inputClass} resize-none`} />
                    {guide.type === 'pdf' ? (
                      <ImageUploadField label="PDF File" value={guide.pdfUrl} onChange={(url) => updateGuide(guide.id, { pdfUrl: url })} folder="crop-solutions/guides" accept="application/pdf" />
                    ) : (
                      <textarea rows={5} value={guide.articleContent} onChange={(e) => updateGuide(guide.id, { articleContent: e.target.value })} placeholder="Article content" className={`${inputClass} resize-none`} />
                    )}
                    <ImageUploadField label="Thumbnail" value={guide.thumbnail} onChange={(url) => updateGuide(guide.id, { thumbnail: url })} folder="crop-solutions/guide-thumbnails" />
                  </div>
                ))}
                {form.guides.length === 0 && <p className="text-sm text-slate-400 font-sans">No guides added yet.</p>}
              </div>
            )}

            {activeTab === 'Videos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>Videos ({form.videos.length})</span>
                  <button type="button" onClick={addVideo} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add Video
                  </button>
                </div>
                {form.videos.map((video, idx) => (
                  <div key={video.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">Video {idx + 1}</span>
                      <button type="button" onClick={() => removeVideo(video.id)} className="text-red-500 hover:text-red-700">
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={video.title} onChange={(e) => updateVideo(video.id, { title: e.target.value })} placeholder="Title" className={inputClass} />
                      <select value={video.provider} onChange={(e) => updateVideo(video.id, { provider: e.target.value as CropVideo['provider'] })} className={inputClass}>
                        <option value="youtube">YouTube</option>
                        <option value="vimeo">Vimeo</option>
                        <option value="upload">Uploaded Video</option>
                      </select>
                    </div>
                    {video.provider === 'upload' ? (
                      <ImageUploadField label="Video File" value={video.url} onChange={(url) => updateVideo(video.id, { url })} folder="crop-solutions/videos" accept="video/*" />
                    ) : (
                      <input type="text" value={video.url} onChange={(e) => updateVideo(video.id, { url: e.target.value })} placeholder="Video URL" className={inputClass} />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ImageUploadField label="Thumbnail" value={video.thumbnail} onChange={(url) => updateVideo(video.id, { thumbnail: url })} folder="crop-solutions/video-thumbnails" />
                      <div>
                        <label className={labelClass}>Duration</label>
                        <input type="text" value={video.duration} onChange={(e) => updateVideo(video.id, { duration: e.target.value })} placeholder="e.g. 4:32" className={inputClass} />
                      </div>
                    </div>
                  </div>
                ))}
                {form.videos.length === 0 && <p className="text-sm text-slate-400 font-sans">No videos added yet.</p>}
              </div>
            )}

            {activeTab === 'FAQ' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={sectionLabelClass}>FAQ ({form.faqs.length})</span>
                  <button type="button" onClick={addFaq} className="text-sm font-sans font-bold text-primary hover:underline flex items-center gap-1">
                    <Icons.Plus className="w-4 h-4" /> Add FAQ
                  </button>
                </div>
                {form.faqs.map((faq, idx) => (
                  <div key={faq.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-bold text-primary/50 uppercase">FAQ {idx + 1}</span>
                      <button type="button" onClick={() => removeFaq(faq.id)} className="text-red-500 hover:text-red-700">
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    <input type="text" value={faq.question} onChange={(e) => updateFaq(faq.id, { question: e.target.value })} placeholder="Question" className={inputClass} />
                    <textarea rows={2} value={faq.answer} onChange={(e) => updateFaq(faq.id, { answer: e.target.value })} placeholder="Answer" className={`${inputClass} resize-none`} />
                  </div>
                ))}
                {form.faqs.length === 0 && <p className="text-sm text-slate-400 font-sans">No FAQs added yet.</p>}
              </div>
            )}

            {activeTab === 'SEO' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Meta Title</label>
                  <input type="text" value={form.seo.metaTitle} onChange={(e) => update('seo', { ...form.seo, metaTitle: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Meta Description</label>
                  <textarea rows={3} value={form.seo.metaDescription} onChange={(e) => update('seo', { ...form.seo, metaDescription: e.target.value })} className={`${inputClass} resize-none`} />
                </div>
                <div>
                  <label className={labelClass}>Keywords (comma-separated)</label>
                  <input type="text" value={form.seo.keywords} onChange={(e) => update('seo', { ...form.seo, keywords: e.target.value })} className={inputClass} />
                </div>
                <ImageUploadField label="OpenGraph Image" value={form.seo.ogImage} onChange={(url) => update('seo', { ...form.seo, ogImage: url })} folder="crop-solutions/og" />
                <div>
                  <label className={labelClass}>Canonical URL</label>
                  <input type="text" value={form.seo.canonicalUrl} onChange={(e) => update('seo', { ...form.seo, canonicalUrl: e.target.value })} className={inputClass} placeholder="Auto-generated if left blank" />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Crop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
