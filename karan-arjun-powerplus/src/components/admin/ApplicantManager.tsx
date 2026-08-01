import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Icons } from '../Icons';
import { db } from '../../lib/firebase';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus, type Job } from '../../data/career';

interface ApplicantManagerProps {
  jobs: Job[];
}

const statusBadgeClass: Record<ApplicationStatus, string> = {
  New: 'bg-blue-100 text-blue-700',
  Reviewing: 'bg-amber-100 text-amber-700',
  Shortlisted: 'bg-violet-100 text-violet-700',
  'Interview Scheduled': 'bg-cyan-100 text-cyan-700',
  Selected: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
  Hired: 'bg-primary/10 text-primary',
};

/**
 * Applicant tracking view — list with search/filter, detail drawer with the
 * full status pipeline, internal notes, and change history (a history[]
 * array appended to on every status change, same embedded-array pattern
 * already used for crop problems/practices in data/cropSolutions.ts).
 */
export function ApplicantManager({ jobs }: ApplicantManagerProps) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all');
  const [selected, setSelected] = useState<Application | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'applications'),
      (snapshot) => {
        setApplications(
          snapshot.docs
            .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<Application, 'id'>) }))
            .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
        );
      },
      (err) => setError(err instanceof Error ? err.message : 'Could not load applications.'),
    );
    return () => unsubscribe();
  }, []);

  const filtered = useMemo(() => {
    return applications.filter((app) => {
      if (jobFilter !== 'all' && app.jobId !== jobFilter) return false;
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        if (!app.fullName.toLowerCase().includes(term) && !app.email.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [applications, jobFilter, statusFilter, searchTerm]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    APPLICATION_STATUSES.forEach((s) => { counts[s] = applications.filter((a) => a.status === s).length; });
    return counts;
  }, [applications]);

  const updateStatus = async (application: Application, status: ApplicationStatus) => {
    try {
      await updateDoc(doc(db, 'applications', application.id), {
        status,
        history: [...(application.history ?? []), { status, note: '', changedAt: Date.now() }],
        updatedAt: Date.now(),
      });
      setSelected((prev) => (prev?.id === application.id ? { ...prev, status } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.');
    }
  };

  const saveNote = async (application: Application) => {
    if (!noteDraft.trim()) return;
    try {
      const entry = { status: application.status, note: noteDraft.trim(), changedAt: Date.now() };
      await updateDoc(doc(db, 'applications', application.id), {
        notes: noteDraft.trim(),
        history: [...(application.history ?? []), entry],
        updatedAt: Date.now(),
      });
      setSelected((prev) => (prev?.id === application.id ? { ...prev, notes: noteDraft.trim(), history: [...(prev.history ?? []), entry] } : prev));
      setNoteDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note.');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-sans font-semibold">
          <Icons.AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto opacity-60 hover:opacity-100"><Icons.X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {APPLICATION_STATUSES.map((s) => (
          <div key={s} className="bg-white rounded-xl p-4 border border-slate-100 text-center">
            <p className="text-2xl font-sans font-black text-primary">{statusCounts[s]}</p>
            <p className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider mt-1">{s}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
        />
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm">
          <option value="all">All Jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ApplicationStatus)} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm">
          <option value="all">All Statuses</option>
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-slate-400 font-sans text-center">No applications match your filters.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((app) => (
              <button key={app.id} onClick={() => setSelected(app)} className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-sans font-bold text-primary text-sm">{app.fullName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${statusBadgeClass[app.status]}`}>{app.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-sans mt-1">{app.jobTitle} · {app.email} · {app.city}</p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-sans text-xl font-bold text-primary">{selected.fullName}</h3>
              <button onClick={() => setSelected(null)} className="p-2 rounded-full hover:bg-slate-100"><Icons.X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-1.5 text-sm font-sans text-primary/80 mb-6">
              <p><span className="font-semibold text-primary">Applying for:</span> {selected.jobTitle}</p>
              <p><span className="font-semibold text-primary">Email:</span> {selected.email}</p>
              <p><span className="font-semibold text-primary">Phone:</span> {selected.phone}</p>
              <p><span className="font-semibold text-primary">City:</span> {selected.city}</p>
              {selected.linkedIn && <p><span className="font-semibold text-primary">LinkedIn:</span> <a href={selected.linkedIn} target="_blank" rel="noreferrer" className="text-primary hover:underline">{selected.linkedIn}</a></p>}
              {selected.portfolio && <p><span className="font-semibold text-primary">Portfolio:</span> <a href={selected.portfolio} target="_blank" rel="noreferrer" className="text-primary hover:underline">{selected.portfolio}</a></p>}
            </div>

            <a
              href={selected.resumeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors mb-6"
            >
              <Icons.Download className="w-4 h-4" /> Download Resume
            </a>

            {selected.coverLetter && (
              <div className="mb-6">
                <p className="text-xs font-sans font-bold text-primary/50 uppercase tracking-widest mb-2">Cover Letter</p>
                <p className="text-sm text-primary/80 font-serif whitespace-pre-line bg-slate-50 rounded-xl p-4">{selected.coverLetter}</p>
              </div>
            )}

            <div className="mb-6">
              <p className="text-xs font-sans font-bold text-primary/50 uppercase tracking-widest mb-3">Status</p>
              <div className="flex flex-wrap gap-2">
                {APPLICATION_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => void updateStatus(selected, s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-sans font-bold transition-colors ${
                      selected.status === s ? statusBadgeClass[s] : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <p className="text-xs font-sans font-bold text-primary/50 uppercase tracking-widest mb-2">Add Internal Note</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Note visible to admin team only..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                />
                <button onClick={() => void saveNote(selected)} className="px-4 py-2.5 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm">Save</button>
              </div>
            </div>

            <div>
              <p className="text-xs font-sans font-bold text-primary/50 uppercase tracking-widest mb-3">History</p>
              <div className="space-y-3">
                {[...(selected.history ?? [])].reverse().map((entry, idx) => (
                  <div key={idx} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary/30 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-sans font-semibold text-primary">{entry.status}</p>
                      {entry.note && <p className="text-primary/70 font-serif text-xs mt-0.5">{entry.note}</p>}
                      <p className="text-slate-400 text-xs mt-0.5">{new Date(entry.changedAt).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
                {(!selected.history || selected.history.length === 0) && <p className="text-sm text-slate-400 font-sans">No history yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
