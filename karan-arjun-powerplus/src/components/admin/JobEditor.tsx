import { useState } from 'react';
import { Icons } from '../Icons';
import { ImageUploadField } from './ImageUploadField';
import { emptyJob, slugify, type Department, type EmploymentType, type Job, type JobStatus } from '../../data/career';

type EditorTab = 'Basic Info' | 'Description' | 'SEO' | 'Media' | 'Settings';
const TABS: EditorTab[] = ['Basic Info', 'Description', 'SEO', 'Media', 'Settings'];

interface JobEditorProps {
  job: Job | null;
  departments: Department[];
  onSave: (job: Omit<Job, 'id'> & { id?: string }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

/** Textarea that stores/reads a string[] as newline-separated lines — same convention as Admin.tsx's blog image/video/link fields. */
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
 * Modern tabbed CMS editor for a single job posting — Basic Info /
 * Description / SEO / Media / Settings, modeled directly on
 * components/admin/CropEditor.tsx's tab pattern and reusing the same
 * inputClass/labelClass/sectionLabelClass conventions.
 */
export function JobEditor({ job, departments, onSave, onClose }: JobEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('Basic Info');
  const [form, setForm] = useState<Omit<Job, 'id'> & { id?: string }>(job ?? { ...emptyJob, departmentId: departments[0]?.id ?? '' });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [attachmentInput, setAttachmentInput] = useState('');

  const update = <K extends keyof Job>(key: K, value: Job[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({ ...prev, title, slug: prev.slug || slugify(title) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Job title is required.');
      setActiveTab('Basic Info');
      return;
    }
    if (!form.slug.trim()) {
      setError('Slug is required.');
      setActiveTab('Basic Info');
      return;
    }
    if (!form.departmentId) {
      setError('Please select a department.');
      setActiveTab('Basic Info');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save job. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <h2 className="font-sans text-2xl font-bold text-primary">{job ? 'Edit Job' : 'Add Job'}</h2>
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
                    <label className={labelClass}>Job Title *</label>
                    <input type="text" required value={form.title} onChange={(e) => handleTitleChange(e.target.value)} className={inputClass} placeholder="e.g. Field Agronomist" />
                  </div>
                  <div>
                    <label className={labelClass}>Slug *</label>
                    <input type="text" required value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} className={inputClass} placeholder="field-agronomist-pune" />
                    <p className="text-xs text-slate-400 font-sans mt-1">/career/{form.slug || 'job-slug'}</p>
                  </div>
                  <div>
                    <label className={labelClass}>Department *</label>
                    <select value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)} className={inputClass}>
                      <option value="">Select department...</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Employment Type</label>
                    <select value={form.employmentType} onChange={(e) => update('employmentType', e.target.value as EmploymentType)} className={inputClass}>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Experience</label>
                    <input type="text" value={form.experience} onChange={(e) => update('experience', e.target.value)} className={inputClass} placeholder="e.g. 2-4 years" />
                  </div>
                  <div>
                    <label className={labelClass}>Location</label>
                    <input type="text" value={form.location} onChange={(e) => update('location', e.target.value)} className={inputClass} placeholder="e.g. Pune, Maharashtra" />
                  </div>
                  <div>
                    <label className={labelClass}>Salary Min (₹/month)</label>
                    <input type="text" value={form.salaryMin} onChange={(e) => update('salaryMin', e.target.value)} className={inputClass} placeholder="25000" />
                  </div>
                  <div>
                    <label className={labelClass}>Salary Max (₹/month)</label>
                    <input type="text" value={form.salaryMax} onChange={(e) => update('salaryMax', e.target.value)} className={inputClass} placeholder="40000" />
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={form.status} onChange={(e) => update('status', e.target.value as JobStatus)} className={inputClass}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="closed">Closed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Description' && (
              <div className="space-y-6">
                <div>
                  <label className={labelClass}>Overview</label>
                  <textarea rows={3} value={form.overview} onChange={(e) => update('overview', e.target.value)} className={`${inputClass} resize-none`} placeholder="A short summary of the role" />
                </div>
                <ListTextarea label="Responsibilities" value={form.responsibilities} onChange={(v) => update('responsibilities', v)} />
                <ListTextarea label="Requirements" value={form.requirements} onChange={(v) => update('requirements', v)} />
                <ListTextarea label="Preferred Skills" value={form.preferredSkills} onChange={(v) => update('preferredSkills', v)} />
                <ListTextarea label="Qualifications" value={form.qualifications} onChange={(v) => update('qualifications', v)} />
                <ListTextarea label="Benefits" value={form.benefits} onChange={(v) => update('benefits', v)} />
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
                <ImageUploadField label="OpenGraph Image" value={form.seo.ogImage} onChange={(url) => update('seo', { ...form.seo, ogImage: url })} folder="career/jobs" />
              </div>
            )}

            {activeTab === 'Media' && (
              <div className="space-y-6">
                <ImageUploadField label="Hero Image" value={form.heroImage} onChange={(url) => update('heroImage', url)} folder="career/jobs" previewClassName="w-full h-40 object-cover rounded-xl border border-slate-200" />
                <ImageUploadField label="Department Image" value={form.departmentImage} onChange={(url) => update('departmentImage', url)} folder="career/departments" previewClassName="w-full h-32 object-cover rounded-xl border border-slate-200" />
                <div>
                  <label className={labelClass}>Attachments</label>
                  <div className="flex gap-2 mb-3">
                    <input type="text" value={attachmentInput} onChange={(e) => setAttachmentInput(e.target.value)} placeholder="Paste a file URL" className={`${inputClass} flex-1`} />
                    <button
                      type="button"
                      onClick={() => { if (attachmentInput.trim()) { update('attachments', [...form.attachments, attachmentInput.trim()]); setAttachmentInput(''); } }}
                      className="px-4 py-3 rounded-xl bg-primary text-secondary-container font-sans font-bold text-sm shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {form.attachments.length > 0 && (
                    <ul className="space-y-1.5">
                      {form.attachments.map((url, idx) => (
                        <li key={`${url}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs font-sans">
                          <a href={url} target="_blank" rel="noreferrer" className="text-primary truncate hover:underline">{url}</a>
                          <button type="button" onClick={() => update('attachments', form.attachments.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 shrink-0">
                            <Icons.X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Settings' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Publish At</label>
                    <input type="datetime-local" value={form.publishAt} onChange={(e) => update('publishAt', e.target.value)} className={inputClass} />
                    <p className="text-xs text-slate-400 font-sans mt-1">Leave blank to publish immediately once status is "Published".</p>
                  </div>
                  <div>
                    <label className={labelClass}>Application Deadline</label>
                    <input type="date" value={form.applicationDeadline} onChange={(e) => update('applicationDeadline', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-col gap-3 pt-2">
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                    <input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Featured
                  </label>
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                    <input type="checkbox" checked={form.urgentHiring} onChange={(e) => update('urgentHiring', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Urgent Hiring
                  </label>
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                    <input type="checkbox" checked={form.showSalary} onChange={(e) => update('showSalary', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Show Salary Publicly
                  </label>
                  <label className="inline-flex items-center gap-2 font-sans text-sm text-primary font-semibold">
                    <input type="checkbox" checked={form.acceptApplications} onChange={(e) => update('acceptApplications', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    Accept Applications
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
