import { useState } from 'react';
import { Icons } from '../../Icons';
import { ProductSelect } from './ProductSelect';
import { emptyCropResult, type CropResult } from '../../../data/farmerSuccess';

interface CropResultEditorProps {
  result: CropResult | null;
  onSave: (result: Omit<CropResult, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

export function CropResultEditor({ result, onSave, onClose }: CropResultEditorProps) {
  const [form, setForm] = useState<Omit<CropResult, 'id'> & { id?: string }>(result ?? emptyCropResult);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [galleryInput, setGalleryInput] = useState('');

  const update = <K extends keyof CropResult>(key: K, value: CropResult[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addGalleryImage = () => {
    if (!galleryInput.trim()) return;
    update('gallery', [...form.gallery, galleryInput.trim()]);
    setGalleryInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.crop.trim()) { setError('Crop is required.'); return; }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Could not save crop result. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{result ? 'Edit Crop Result' : 'Add Crop Result'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            <div>
              <label className={labelClass}>Crop *</label>
              <input type="text" required value={form.crop} onChange={(e) => update('crop', e.target.value)} className={inputClass} />
            </div>
            <ProductSelect value={form.productId} onChange={(id) => update('productId', id)} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Yield Increase</label>
                <input type="text" value={form.yieldIncrease} onChange={(e) => update('yieldIncrease', e.target.value)} className={inputClass} placeholder="e.g. 18%" />
              </div>
              <div>
                <label className={labelClass}>Disease Reduction</label>
                <input type="text" value={form.diseaseReduction} onChange={(e) => update('diseaseReduction', e.target.value)} className={inputClass} placeholder="e.g. 40%" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Field Observations</label>
              <textarea rows={3} value={form.fieldObservations} onChange={(e) => update('fieldObservations', e.target.value)} className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} resize-none`} />
            </div>

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
              {isSaving ? 'Saving...' : 'Save Result'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
