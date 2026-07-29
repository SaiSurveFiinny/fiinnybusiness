import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { ImageUploadField } from './ImageUploadField';
import { JobEditor } from './JobEditor';
import { ApplicantManager } from './ApplicantManager';
import { db } from '../../lib/firebase';
import { emptyJob, initialDepartments, slugify, type Department, type Job } from '../../data/career';

type CareerSubTab = 'Dashboard' | 'Jobs' | 'Departments' | 'Applicants';
const SUB_TABS: CareerSubTab[] = ['Dashboard', 'Jobs', 'Departments', 'Applicants'];

interface DepartmentFormState {
  name: string;
  slug: string;
  image: string;
}

const defaultDepartmentForm: DepartmentFormState = { name: '', slug: '', image: '' };
const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

/** Maps Firestore error codes to actionable admin-facing messages — same pattern established in CropSolutionsManager.tsx. */
function describeFirestoreError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return 'Permission denied by Firestore security rules. Your account may not have write access to this collection.';
    case 'unavailable':
      return 'Could not reach Firestore. Check your internet connection and try again.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    default:
      return err instanceof Error ? `Could not save: ${err.message}` : 'Could not save. Please try again.';
  }
}

/**
 * Admin entry point for the Career module — dashboard stats, job CRUD (via
 * JobEditor), department CRUD, and applicant tracking (via ApplicantManager).
 * Follows the exact same structure and error-handling discipline as
 * components/admin/CropSolutionsManager.tsx: onSnapshot + addDoc/updateDoc/
 * deleteDoc, every write wrapped in try/catch, no silent failures.
 */
export function CareerManager() {
  const [subTab, setSubTab] = useState<CareerSubTab>('Dashboard');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [applicationCounts, setApplicationCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatus(message);
    setStatusType(type);
  };

  const [isJobEditorOpen, setIsJobEditorOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [pendingJobDeleteId, setPendingJobDeleteId] = useState<string | null>(null);

  const [departmentForm, setDepartmentForm] = useState<DepartmentFormState>(defaultDepartmentForm);
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [isDepartmentFormOpen, setIsDepartmentFormOpen] = useState(false);
  const [isSavingDepartment, setIsSavingDepartment] = useState(false);
  const [departmentFormError, setDepartmentFormError] = useState('');
  const [pendingDepartmentDeleteId, setPendingDepartmentDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeJobs = onSnapshot(
      collection(db, 'jobs'),
      (snapshot) => setJobs(snapshot.docs.map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<Job, 'id'>) }))),
      (err) => showStatus(`Could not load jobs: ${describeFirestoreError(err)}`, 'error'),
    );
    const unsubscribeDepartments = onSnapshot(
      query(collection(db, 'departments'), orderBy('order', 'asc')),
      (snapshot) => setDepartments(snapshot.docs.map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<Department, 'id'>) }))),
      (err) => showStatus(`Could not load departments: ${describeFirestoreError(err)}`, 'error'),
    );
    const unsubscribeApplications = onSnapshot(
      collection(db, 'applications'),
      (snapshot) => {
        const counts: Record<string, number> = {};
        snapshot.docs.forEach((docItem) => {
          const jobId = String(docItem.data().jobId ?? '');
          counts[jobId] = (counts[jobId] ?? 0) + 1;
        });
        setApplicationCounts(counts);
      },
      (err) => showStatus(`Could not load applications: ${describeFirestoreError(err)}`, 'error'),
    );
    return () => {
      unsubscribeJobs();
      unsubscribeDepartments();
      unsubscribeApplications();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seedDepartments = async () => {
    try {
      const batch = writeBatch(db);
      initialDepartments.forEach((department) => {
        const ref = doc(collection(db, 'departments'));
        batch.set(ref, { ...department, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
      showStatus('Initial departments seeded.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const openNewJob = () => {
    setEditingJob(null);
    setIsJobEditorOpen(true);
  };

  const openEditJob = (job: Job) => {
    setEditingJob(job);
    setIsJobEditorOpen(true);
  };

  const handleSaveJob = async (form: Omit<Job, 'id'> & { id?: string }) => {
    const { id, ...payload } = form;
    try {
      if (id) {
        await updateDoc(doc(db, 'jobs', id), { ...payload, updatedAt: serverTimestamp() });
        showStatus(`Job "${payload.title}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'jobs')), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        showStatus(`Job "${payload.title}" created.`, 'success');
      }
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
      throw err;
    }
  };

  const handleDuplicateJob = async (job: Job) => {
    try {
      const { id: _id, ...rest } = job;
      await setDoc(doc(collection(db, 'jobs')), {
        ...rest,
        title: `${job.title} (Copy)`,
        slug: `${job.slug}-copy-${Date.now().toString(36)}`,
        status: 'draft',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showStatus(`Duplicated "${job.title}".`, 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const confirmDeleteJob = async (job: Job) => {
    try {
      await deleteDoc(doc(db, 'jobs', job.id));
      showStatus('Job deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingJobDeleteId(null);
    }
  };

  const setJobStatus = async (job: Job, status: Job['status']) => {
    try {
      await updateDoc(doc(db, 'jobs', job.id), { status, updatedAt: serverTimestamp() });
      showStatus(`"${job.title}" is now ${status}.`, 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const toggleFeatured = async (job: Job) => {
    try {
      await updateDoc(doc(db, 'jobs', job.id), { featured: !job.featured, updatedAt: serverTimestamp() });
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    }
  };

  const resetDepartmentForm = () => {
    setDepartmentForm(defaultDepartmentForm);
    setEditingDepartmentId(null);
    setIsDepartmentFormOpen(false);
    setDepartmentFormError('');
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepartmentFormError('');
    const name = departmentForm.name.trim();
    if (!name) {
      setDepartmentFormError('Department name is required.');
      return;
    }
    const slug = departmentForm.slug.trim() || slugify(name);
    const duplicate = departments.find((d) => d.slug === slug && d.id !== editingDepartmentId);
    if (duplicate) {
      setDepartmentFormError(`Slug "${slug}" is already used by "${duplicate.name}".`);
      return;
    }

    setIsSavingDepartment(true);
    try {
      if (editingDepartmentId) {
        await updateDoc(doc(db, 'departments', editingDepartmentId), { name, slug, image: departmentForm.image.trim(), updatedAt: serverTimestamp() });
        showStatus(`Department "${name}" updated.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'departments')), {
          name, slug, image: departmentForm.image.trim(), order: departments.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        showStatus(`Department "${name}" created.`, 'success');
      }
      resetDepartmentForm();
    } catch (err) {
      setDepartmentFormError(describeFirestoreError(err));
      showStatus(`Could not save department "${name}".`, 'error');
    } finally {
      setIsSavingDepartment(false);
    }
  };

  const confirmDeleteDepartment = async (department: Department) => {
    try {
      await deleteDoc(doc(db, 'departments', department.id));
      showStatus('Department deleted.', 'success');
    } catch (err) {
      showStatus(describeFirestoreError(err), 'error');
    } finally {
      setPendingDepartmentDeleteId(null);
    }
  };

  const stats = {
    total: jobs.length,
    published: jobs.filter((j) => j.status === 'published').length,
    draft: jobs.filter((j) => j.status === 'draft').length,
    closed: jobs.filter((j) => j.status === 'closed' || j.status === 'archived').length,
  };
  const totalApplications = Object.values(applicationCounts).reduce((sum, n) => sum + n, 0);

  const statusBadgeClass: Record<Job['status'], string> = {
    draft: 'bg-slate-100 text-slate-600',
    published: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-amber-100 text-amber-700',
    archived: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="font-sans text-xl font-bold text-primary">Career</h2>
            <p className="text-sm text-primary/60 font-sans mt-1">Manage job postings, departments, and applicants shown at /career.</p>
          </div>
        </div>
        {status && (
          <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-xl text-sm font-sans font-semibold ${statusType === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {statusType === 'error' ? <Icons.AlertCircle className="w-4 h-4 shrink-0" /> : <Icons.CheckCircle2 className="w-4 h-4 shrink-0" />}
            {status}
            <button onClick={() => setStatus('')} className="ml-auto text-current opacity-60 hover:opacity-100"><Icons.X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex gap-1 mt-6 border-b border-slate-100">
          {SUB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`px-4 py-2.5 font-sans text-sm font-semibold border-b-2 transition-colors ${
                subTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-primary/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'Dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Total Jobs', value: stats.total },
            { label: 'Published', value: stats.published },
            { label: 'Draft', value: stats.draft },
            { label: 'Closed / Archived', value: stats.closed },
            { label: 'Total Applications', value: totalApplications },
            { label: 'New Applications', value: '—' },
            { label: 'Shortlisted', value: '—' },
            { label: 'Hired', value: '—' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
              <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
              <h4 className="text-3xl font-sans font-black text-primary mt-3">{stat.value}</h4>
            </div>
          ))}
          <p className="text-xs text-slate-400 font-sans sm:col-span-2 lg:col-span-4">
            New/Shortlisted/Hired counts are shown per-application in the Applicants tab — open it for a live breakdown by status.
          </p>
        </div>
      )}

      {subTab === 'Jobs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openNewJob} className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Add Job
            </button>
          </div>
          {jobs.length === 0 && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No jobs yet. Click "Add Job" to create your first posting.</p>
            </div>
          )}
          {jobs.map((job) => {
            const department = departments.find((d) => d.id === job.departmentId);
            return (
              <div key={job.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-sans font-bold text-primary">{job.title || 'Untitled job'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${statusBadgeClass[job.status]}`}>{job.status}</span>
                    {job.featured && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-secondary-container/20 text-secondary">Featured</span>}
                    {job.urgentHiring && <span className="px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase bg-red-100 text-red-700">Urgent</span>}
                  </div>
                  <p className="text-xs text-slate-400 font-sans mt-1">
                    {department?.name ?? 'No department'} · {job.location || 'No location'} · {applicationCounts[job.id] ?? 0} applicant(s) · /career/{job.slug}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <select
                    value={job.status}
                    onChange={(e) => void setJobStatus(job, e.target.value as Job['status'])}
                    className="text-xs font-sans font-semibold border border-slate-200 rounded-lg px-2 py-1.5 mr-1"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button onClick={() => void toggleFeatured(job)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Toggle featured">
                    <Icons.Star className={`w-4 h-4 ${job.featured ? 'text-secondary fill-secondary' : ''}`} />
                  </button>
                  <button onClick={() => void handleDuplicateJob(job)} className="p-2 text-slate-400 hover:text-primary transition-colors" title="Duplicate">
                    <Icons.FileText className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEditJob(job)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Icons.Edit className="w-4 h-4" />
                  </button>
                  {pendingJobDeleteId === job.id ? (
                    <>
                      <button onClick={() => void confirmDeleteJob(job)} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
                      <button onClick={() => setPendingJobDeleteId(null)} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setPendingJobDeleteId(job.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Icons.Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subTab === 'Departments' && (
        <div className="space-y-4">
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h3 className="font-sans text-lg font-bold text-primary">Departments</h3>
              <div className="flex gap-2">
                {departments.length === 0 && (
                  <button onClick={() => void seedDepartments()} className="px-4 py-2 rounded-xl border border-primary/20 text-primary font-sans font-bold text-sm hover:bg-primary/5 transition-colors">
                    Seed Departments
                  </button>
                )}
                <button
                  onClick={() => { setEditingDepartmentId(null); setDepartmentForm(defaultDepartmentForm); setIsDepartmentFormOpen(true); }}
                  className="px-4 py-2 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors"
                >
                  Add Department
                </button>
              </div>
            </div>
          </div>

          {isDepartmentFormOpen && (
            <form onSubmit={(e) => void handleSaveDepartment(e)} className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-sans text-lg font-bold text-primary">{editingDepartmentId ? 'Edit Department' : 'Add Department'}</h3>
                <button type="button" onClick={resetDepartmentForm} className="px-3 py-2 text-xs rounded-lg border border-slate-300 font-sans font-semibold hover:bg-slate-50">Close</button>
              </div>
              {departmentFormError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-sans font-semibold">
                  <Icons.AlertCircle className="w-4 h-4 shrink-0" /> {departmentFormError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Department Name *</label>
                  <input type="text" required value={departmentForm.name} onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value, slug: p.slug || slugify(e.target.value) }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Slug</label>
                  <input type="text" value={departmentForm.slug} onChange={(e) => setDepartmentForm((p) => ({ ...p, slug: slugify(e.target.value) }))} className={inputClass} />
                </div>
              </div>
              <ImageUploadField label="Department Image" value={departmentForm.image} onChange={(url) => setDepartmentForm((p) => ({ ...p, image: url }))} folder="career/departments" previewClassName="w-full h-32 object-cover rounded-xl border border-slate-200" />
              <button type="submit" disabled={isSavingDepartment} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
                {isSavingDepartment ? 'Saving...' : editingDepartmentId ? 'Update Department' : 'Create Department'}
              </button>
            </form>
          )}

          {departments.length === 0 && !isDepartmentFormOpen && (
            <div className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center">
              <p className="text-sm text-primary/60 font-sans">No departments yet. Click "Seed Departments" above for a starting set.</p>
            </div>
          )}

          {departments.map((department) => (
            <div key={department.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              {department.image ? (
                <img src={department.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary shrink-0"><Icons.Layers className="w-4 h-4" /></div>
              )}
              <div className="flex-1 min-w-0">
                <span className="font-sans font-semibold text-primary text-sm">{department.name}</span>
                <p className="text-xs text-slate-400 font-sans">{jobs.filter((j) => j.departmentId === department.id).length} job(s)</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditingDepartmentId(department.id); setDepartmentForm({ name: department.name, slug: department.slug, image: department.image }); setIsDepartmentFormOpen(true); }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Icons.Edit className="w-4 h-4" />
                </button>
                {pendingDepartmentDeleteId === department.id ? (
                  <>
                    <button onClick={() => void confirmDeleteDepartment(department)} className="px-2 py-1 text-[10px] rounded-lg bg-red-100 text-red-700 font-bold">Confirm</button>
                    <button onClick={() => setPendingDepartmentDeleteId(null)} className="px-2 py-1 text-[10px] rounded-lg bg-slate-100 text-slate-700 font-bold">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setPendingDepartmentDeleteId(department.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'Applicants' && <ApplicantManager jobs={jobs} />}

      {isJobEditorOpen && (
        <JobEditor job={editingJob} departments={departments} onSave={handleSaveJob} onClose={() => { setIsJobEditorOpen(false); setEditingJob(null); }} />
      )}
    </div>
  );
}
