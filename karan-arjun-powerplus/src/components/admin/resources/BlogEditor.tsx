import { useState } from 'react';
import { Icons } from '../../Icons';
import type { Blog } from '../../../data/resources';

interface BlogFormState {
  title: string;
  excerpt: string;
  category: string;
  date: string;
  content: string;
  imageUrlsText: string;
  videoUrlsText: string;
  linksText: string;
}

interface BlogEditorProps {
  blog: Blog | null;
  onSave: (blog: Omit<Blog, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

function parseLineList(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function toMultiline(value: string[] | undefined) {
  return (value ?? []).join('\n');
}

function parseLinksText(value: string): Array<{ label: string; url: string }> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split('|');
      const url = (rest.length > 0 ? rest.join('|') : label).trim();
      return { label: label.trim(), url };
    })
    .filter((link) => link.url.length > 0);
}

function linksToMultiline(links: Blog['links']) {
  return (links ?? []).map((link) => `${link.label || link.url}|${link.url}`).join('\n');
}

const defaultForm: BlogFormState = {
  title: '',
  excerpt: '',
  category: 'General',
  date: new Date().toLocaleDateString('en-IN'),
  content: '',
  imageUrlsText: '',
  videoUrlsText: '',
  linksText: '',
};

/**
 * Modal editor for a single Blog post — extracted from the inline form
 * that previously lived directly in Admin.tsx's "Blogs" tab JSX, with
 * identical field set and parsing behavior (parseLineList/parseLinksText/
 * excerpt-fallback-to-content-slice), now wrapped in the same modal chrome
 * and validate-before-save flow as every other Resources/Farmer Success/
 * Career editor. Image/video fields remain plain URL textareas — blogs
 * have never used Firebase Storage uploads (see data/resources.ts's Blog
 * type comment) and this migration does not change that.
 */
export function BlogEditor({ blog, onSave, onClose }: BlogEditorProps) {
  const [form, setForm] = useState<BlogFormState>(
    blog
      ? {
          title: blog.title,
          excerpt: blog.excerpt,
          category: blog.category,
          date: blog.date || new Date().toLocaleDateString('en-IN'),
          content: blog.content ?? '',
          imageUrlsText: toMultiline(blog.imageUrls),
          videoUrlsText: toMultiline(blog.videoUrls),
          linksText: linksToMultiline(blog.links),
        }
      : defaultForm,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof BlogFormState>(key: K, value: BlogFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Blog title is required.');
      return;
    }
    setError('');

    const imageUrls = parseLineList(form.imageUrlsText);
    const videoUrls = parseLineList(form.videoUrlsText);
    const links = parseLinksText(form.linksText);
    const excerpt = form.excerpt.trim() || form.content.trim().slice(0, 180) || 'Read this article to learn more.';

    setIsSaving(true);
    try {
      await onSave({
        id: blog?.id,
        title: form.title.trim(),
        excerpt,
        category: form.category.trim() || 'General',
        date: form.date.trim() || new Date().toLocaleDateString('en-IN'),
        content: form.content.trim(),
        imageUrls,
        videoUrls,
        links,
      });
      onClose();
    } catch {
      setError('Could not save blog post. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{blog ? 'Edit Blog Post' : 'Add Blog Post'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Title *</label>
                <input type="text" required value={form.title} onChange={(e) => update('title', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <input type="text" value={form.category} onChange={(e) => update('category', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Display Date</label>
                <input type="text" value={form.date} onChange={(e) => update('date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Excerpt</label>
                <input type="text" value={form.excerpt} onChange={(e) => update('excerpt', e.target.value)} className={inputClass} placeholder="Short preview line (optional)" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Full Content</label>
              <textarea rows={6} value={form.content} onChange={(e) => update('content', e.target.value)} className={`${inputClass} resize-none`} placeholder="Write the full blog content..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Image URLs (one per line)</label>
                <textarea rows={4} value={form.imageUrlsText} onChange={(e) => update('imageUrlsText', e.target.value)} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Video URLs (one per line)</label>
                <textarea rows={4} value={form.videoUrlsText} onChange={(e) => update('videoUrlsText', e.target.value)} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Links (Label|URL, one per line)</label>
                <textarea rows={4} value={form.linksText} onChange={(e) => update('linksText', e.target.value)} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : blog ? 'Update Blog' : 'Create Blog'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
