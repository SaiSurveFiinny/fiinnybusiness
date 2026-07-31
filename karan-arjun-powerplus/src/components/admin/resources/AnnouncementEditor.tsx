import { useState } from 'react';
import { Icons } from '../../Icons';
import { ImageUploadField } from '../ImageUploadField';
import { emptyAnnouncement, slugify, type Announcement } from '../../../data/resources';

interface AnnouncementEditorProps {
  announcement: Announcement | null;
  onSave: (announcement: Omit<Announcement, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

/** Single-panel editor for Announcements — the only Resources type with an expiry date (isAnnouncementCurrentlyActive in data/resources.ts hides it from public view once expired, independent of its published status). */
export function AnnouncementEditor({ announcement, onSave, onClose }: AnnouncementEditorProps) {
  const [form, setForm] = useState<Omit<Announcement, 'id'> & { id?: string }>(announcement ?? emptyAnnouncement);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof Announcement>(key: K, value: Announcement[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({ ...prev, title, slug: prev.slug || slugify(title) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.message.trim()) { setError('Message is required.'); return; }
    setError('');
    setIsSaving(true);
    try {
      await onSave({ ...form, slug: form.slug.trim() || slugify(form.title) });
      onClose();
    } catch {
      setError('Could not save announcement. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{announcement ? 'Edit Announcement' : 'Add Announcement'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            <div>
              <label className={labelClass}>Title *</label>
              <input type="text" required value={form.title} onChange={(e) => handleTitleChange(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Message *</label>
              <textarea rows={4} required value={form.message} onChange={(e) => update('message', e.target.value)} className={`${inputClass} resize-none`} />
            </div>
            <ImageUploadField label="Cover Image (optional)" value={form.coverImage} onChange={(url) => update('coverImage', url)} folder="resources/announcements" previewClassName="w-full h-32 object-cover rounded-xl border border-slate-200" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Publish Date</label>
                <input type="date" value={form.publishDate} onChange={(e) => update('publishDate', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Expiry Date (optional)</label>
                <input type="date" value={form.expiryDate} onChange={(e) => update('expiryDate', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={form.status} onChange={(e) => update('status', e.target.value as Announcement['status'])} className={inputClass}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
              <input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Featured
            </label>
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
