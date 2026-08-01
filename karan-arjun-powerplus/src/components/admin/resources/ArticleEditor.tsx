import { useState } from 'react';
import { Icons } from '../../Icons';
import { ImageUploadField } from '../ImageUploadField';
import { emptyArticle, slugify, type Article } from '../../../data/resources';

type EditorTab = 'Basic Info' | 'Content' | 'SEO';
const TABS: EditorTab[] = ['Basic Info', 'Content', 'SEO'];

interface ArticleEditorProps {
  article: Article | null;
  onSave: (article: Omit<Article, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

/** Tabbed editor for Articles — mirrors StoryEditor.tsx's structure (Basic Info / Content / SEO tabs, validate-before-save, title->slug auto-derivation). */
export function ArticleEditor({ article, onSave, onClose }: ArticleEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('Basic Info');
  const [form, setForm] = useState<Omit<Article, 'id'> & { id?: string }>(article ?? emptyArticle);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof Article>(key: K, value: Article[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({ ...prev, title, slug: prev.slug || slugify(title) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); setActiveTab('Basic Info'); return; }
    if (!form.slug.trim()) { setError('Slug is required.'); setActiveTab('Basic Info'); return; }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Could not save article. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{article ? 'Edit Article' : 'Add Article'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex gap-1 px-8 pt-4 border-b border-slate-100 overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 font-sans text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-primary/70'}`}>
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
                    <input type="text" required value={form.title} onChange={(e) => handleTitleChange(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Slug *</label>
                    <input type="text" required value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Category</label>
                    <input type="text" value={form.category} onChange={(e) => update('category', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Author</label>
                    <input type="text" value={form.author} onChange={(e) => update('author', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Excerpt</label>
                  <textarea rows={2} value={form.excerpt} onChange={(e) => update('excerpt', e.target.value)} className={`${inputClass} resize-none`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Publish Date</label>
                    <input type="date" value={form.publishDate} onChange={(e) => update('publishDate', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={form.status} onChange={(e) => update('status', e.target.value as Article['status'])} className={inputClass}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                  <input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Featured
                </label>
              </div>
            )}

            {activeTab === 'Content' && (
              <div className="space-y-6">
                <ImageUploadField label="Cover Image" value={form.coverImage} onChange={(url) => update('coverImage', url)} folder="resources/articles" previewClassName="w-full h-40 object-cover rounded-xl border border-slate-200" />
                <div>
                  <label className={labelClass}>Full Content</label>
                  <textarea rows={10} value={form.content} onChange={(e) => update('content', e.target.value)} className={`${inputClass} resize-none`} />
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
                <ImageUploadField label="OpenGraph Image" value={form.seo.ogImage} onChange={(url) => update('seo', { ...form.seo, ogImage: url })} folder="resources/og" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
