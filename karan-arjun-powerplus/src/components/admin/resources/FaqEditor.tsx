import { useState } from 'react';
import { Icons } from '../../Icons';
import { emptyFaq, type Faq } from '../../../data/resources';

interface FaqEditorProps {
  faq: Faq | null;
  onSave: (faq: Omit<Faq, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

export function FaqEditor({ faq, onSave, onClose }: FaqEditorProps) {
  const [form, setForm] = useState<Omit<Faq, 'id'> & { id?: string }>(faq ?? emptyFaq);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof Faq>(key: K, value: Faq[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.question.trim()) { setError('Question is required.'); return; }
    if (!form.answer.trim()) { setError('Answer is required.'); return; }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Could not save FAQ. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{faq ? 'Edit FAQ' : 'Add FAQ'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {error && <p className="text-sm font-sans font-semibold text-red-600">{error}</p>}

            <div>
              <label className={labelClass}>Question *</label>
              <input type="text" required value={form.question} onChange={(e) => update('question', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Answer *</label>
              <textarea rows={4} required value={form.answer} onChange={(e) => update('answer', e.target.value)} className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <input type="text" value={form.category} onChange={(e) => update('category', e.target.value)} className={inputClass} />
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
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save FAQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
