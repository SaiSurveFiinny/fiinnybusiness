import { useState } from 'react';
import { Icons } from '../../Icons';
import { ImageUploadField } from '../ImageUploadField';
import { ProductSelect } from './ProductSelect';
import { emptyTestimonial, slugify, type Testimonial } from '../../../data/farmerSuccess';

interface TestimonialEditorProps {
  testimonial: Testimonial | null;
  onSave: (testimonial: Omit<Testimonial, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

export function TestimonialEditor({ testimonial, onSave, onClose }: TestimonialEditorProps) {
  const [form, setForm] = useState<Omit<Testimonial, 'id'> & { id?: string }>(testimonial ?? emptyTestimonial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof Testimonial>(key: K, value: Testimonial[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleNameChange = (farmerName: string) => {
    setForm((prev) => ({ ...prev, farmerName, slug: prev.slug || slugify(farmerName) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.farmerName.trim()) { setError('Farmer name is required.'); return; }
    if (!form.quote.trim()) { setError('Quote is required.'); return; }
    setError('');
    setIsSaving(true);
    try {
      // Testimonials created before the slug field existed have slug: ''.
      // Back-fill it here on next save (from admin, per the "no duplicate
      // data entry" requirement) rather than requiring a manual one-time
      // migration script, matching how slug is derived everywhere else.
      const payload = { ...form, slug: form.slug.trim() || slugify(form.farmerName) };
      await onSave(payload);
      onClose();
    } catch {
      setError('Could not save testimonial. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{testimonial ? 'Edit Testimonial' : 'Add Testimonial'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            <ImageUploadField label="Farmer Photo" value={form.farmerPhoto} onChange={(url) => update('farmerPhoto', url)} folder="farmer-success/testimonials" previewClassName="w-20 h-20 object-cover rounded-full border border-slate-200" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Farmer Name *</label>
                <input type="text" required value={form.farmerName} onChange={(e) => handleNameChange(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Slug</label>
                <input type="text" value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} className={inputClass} placeholder="Auto-generated from name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Crop</label>
                <input type="text" value={form.crop} onChange={(e) => update('crop', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <input type="text" value={form.location} onChange={(e) => update('location', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Quote *</label>
              <textarea rows={4} required value={form.quote} onChange={(e) => update('quote', e.target.value)} className={`${inputClass} resize-none`} />
            </div>
            <ProductSelect value={form.relatedProductId} onChange={(id) => update('relatedProductId', id)} />
            <div>
              <label className={labelClass}>Rating (optional, 0–5)</label>
              <input type="number" min={0} max={5} value={form.rating} onChange={(e) => update('rating', Number(e.target.value))} className={inputClass} />
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
              {isSaving ? 'Saving...' : 'Save Testimonial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
