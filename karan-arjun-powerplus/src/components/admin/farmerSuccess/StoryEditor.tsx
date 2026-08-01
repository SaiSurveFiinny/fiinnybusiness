import { useState } from 'react';
import { Icons } from '../../Icons';
import { ImageUploadField } from '../ImageUploadField';
import { ProductPicker } from '../ProductPicker';
import { emptyFarmerStory, slugify, type FarmerStory } from '../../../data/farmerSuccess';

type EditorTab = 'Basic Info' | 'Story' | 'Farmer' | 'Media' | 'SEO';
const TABS: EditorTab[] = ['Basic Info', 'Story', 'Farmer', 'Media', 'SEO'];

interface StoryEditorProps {
  story: FarmerStory | null;
  onSave: (story: Omit<FarmerStory, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';
const sectionLabelClass = 'font-sans text-xs font-bold text-primary/50 uppercase tracking-widest mb-4 block';

/**
 * Tabbed CMS editor for a single Farmer Story — mirrors CropEditor.tsx's
 * structure (tabs, inputClass/labelClass/sectionLabelClass, validate-before-
 * save flow). The gallery field reuses the same paste-URL-plus-Add-button
 * pattern CropEditor uses for crop.gallery.
 */
export function StoryEditor({ story, onSave, onClose }: StoryEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('Basic Info');
  const [form, setForm] = useState<Omit<FarmerStory, 'id'> & { id?: string }>(story ?? emptyFarmerStory);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [galleryInput, setGalleryInput] = useState('');

  const update = <K extends keyof FarmerStory>(key: K, value: FarmerStory[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({ ...prev, title, slug: prev.slug || slugify(title) }));
  };

  const addGalleryImage = () => {
    if (!galleryInput.trim()) return;
    update('gallery', [...form.gallery, galleryInput.trim()]);
    setGalleryInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required.');
      setActiveTab('Basic Info');
      return;
    }
    if (!form.slug.trim()) {
      setError('Slug is required.');
      setActiveTab('Basic Info');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Could not save story. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{story ? 'Edit Story' : 'Add Story'}</h2>
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

            {activeTab === 'Basic Info' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Title *</label>
                    <input type="text" required value={form.title} onChange={(e) => handleTitleChange(e.target.value)} className={inputClass} placeholder="e.g. From Failing Yields to a Record Harvest" />
                  </div>
                  <div>
                    <label className={labelClass}>Slug *</label>
                    <input type="text" required value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Subtitle</label>
                  <input type="text" value={form.subtitle} onChange={(e) => update('subtitle', e.target.value)} className={inputClass} placeholder="One-line summary shown on story cards" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Crop</label>
                    <input type="text" value={form.crop} onChange={(e) => update('crop', e.target.value)} className={inputClass} placeholder="e.g. Onion" />
                  </div>
                  <div>
                    <label className={labelClass}>Location</label>
                    <input type="text" value={form.location} onChange={(e) => update('location', e.target.value)} className={inputClass} placeholder="e.g. Nashik, Maharashtra" />
                  </div>
                  <div>
                    <label className={labelClass}>Author</label>
                    <input type="text" value={form.author} onChange={(e) => update('author', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Publish Date</label>
                    <input type="date" value={form.publishDate} onChange={(e) => update('publishDate', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={form.status} onChange={(e) => update('status', e.target.value as FarmerStory['status'])} className={inputClass}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                  <input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Featured Story
                </label>
              </div>
            )}

            {activeTab === 'Story' && (
              <div className="space-y-6">
                <div>
                  <label className={labelClass}>Story Body</label>
                  <textarea rows={8} value={form.storyBody} onChange={(e) => update('storyBody', e.target.value)} className={`${inputClass} resize-none`} placeholder="The full narrative shown on the story detail page" />
                </div>
                <div>
                  <span className={sectionLabelClass}>Challenge / Solution / Result</span>
                  <div className="space-y-3">
                    <textarea rows={3} value={form.challenge} onChange={(e) => update('challenge', e.target.value)} className={`${inputClass} resize-none`} placeholder="Challenge" />
                    <textarea rows={3} value={form.solution} onChange={(e) => update('solution', e.target.value)} className={`${inputClass} resize-none`} placeholder="Solution" />
                    <textarea rows={3} value={form.result} onChange={(e) => update('result', e.target.value)} className={`${inputClass} resize-none`} placeholder="Result" />
                  </div>
                </div>
                <ProductPicker selectedIds={form.relatedProductIds} onChange={(ids) => update('relatedProductIds', ids)} />
              </div>
            )}

            {activeTab === 'Farmer' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Farmer Name</label>
                  <input type="text" value={form.farmerName} onChange={(e) => update('farmerName', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Village</label>
                  <input type="text" value={form.farmerVillage} onChange={(e) => update('farmerVillage', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>District</label>
                  <input type="text" value={form.farmerDistrict} onChange={(e) => update('farmerDistrict', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>State</label>
                  <input type="text" value={form.farmerState} onChange={(e) => update('farmerState', e.target.value)} className={inputClass} />
                </div>
              </div>
            )}

            {activeTab === 'Media' && (
              <div className="space-y-6">
                <ImageUploadField label="Hero Image" value={form.heroImage} onChange={(url) => update('heroImage', url)} folder="farmer-success/stories" previewClassName="w-full h-40 object-cover rounded-xl border border-slate-200" />
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
                <div>
                  <label className={labelClass}>Related Video URL (optional)</label>
                  <input type="text" value={form.videoUrl} onChange={(e) => update('videoUrl', e.target.value)} className={inputClass} placeholder="YouTube URL" />
                </div>
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
                <ImageUploadField label="OpenGraph Image" value={form.seo.ogImage} onChange={(url) => update('seo', { ...form.seo, ogImage: url })} folder="farmer-success/og" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Story'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
