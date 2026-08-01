import { useState } from 'react';
import { Icons } from '../../Icons';
import { ImageUploadField } from '../ImageUploadField';
import { emptyBeforeAfterCase, type BeforeAfterCase } from '../../../data/farmerSuccess';

interface BeforeAfterEditorProps {
  entry: BeforeAfterCase | null;
  onSave: (entry: Omit<BeforeAfterCase, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

export function BeforeAfterEditor({ entry, onSave, onClose }: BeforeAfterEditorProps) {
  const [form, setForm] = useState<Omit<BeforeAfterCase, 'id'> & { id?: string }>(entry ?? emptyBeforeAfterCase);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof BeforeAfterCase>(key: K, value: BeforeAfterCase[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.beforeImage || !form.afterImage) { setError('Both before and after images are required.'); return; }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Could not save entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{entry ? 'Edit Before & After' : 'Add Before & After'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            <div>
              <label className={labelClass}>Title *</label>
              <input type="text" required value={form.title} onChange={(e) => update('title', e.target.value)} className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ImageUploadField label="Before Image" value={form.beforeImage} onChange={(url) => update('beforeImage', url)} folder="farmer-success/before-after" previewClassName="w-full h-28 object-cover rounded-xl border border-slate-200" />
              <ImageUploadField label="After Image" value={form.afterImage} onChange={(url) => update('afterImage', url)} folder="farmer-success/before-after" previewClassName="w-full h-28 object-cover rounded-xl border border-slate-200" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Crop</label>
                <input type="text" value={form.crop} onChange={(e) => update('crop', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Duration</label>
                <input type="text" value={form.duration} onChange={(e) => update('duration', e.target.value)} className={inputClass} placeholder="e.g. 60 days" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className={labelClass}>Result Metrics</label>
              <input type="text" value={form.resultMetrics} onChange={(e) => update('resultMetrics', e.target.value)} className={inputClass} placeholder="e.g. 22% yield increase" />
            </div>
            <div className="flex items-center gap-8">
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

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
