import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Icons } from '../Icons';
import { ResumeUploadField } from './ResumeUploadField';
import { db } from '../../lib/firebase';
import type { Job } from '../../data/career';

interface ApplyFormProps {
  job: Job;
  onClose: () => void;
}

const inputClass = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-2';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public application form — no sign-in required (matches the Firestore
 * `applications` create rule, which allows any visitor to submit). Writes
 * once to the `applications` collection; the resume itself is uploaded via
 * ResumeUploadField beforehand, so this form only ever stores a URL string,
 * consistent with every other Firestore write in this codebase.
 */
export function ApplyForm({ job, onClose }: ApplyFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [linkedIn, setLinkedIn] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = 'Full name is required.';
    if (!email.trim()) next.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!phone.trim()) next.phone = 'Phone number is required.';
    else if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) next.phone = 'Enter a valid 10-digit phone number.';
    if (!city.trim()) next.city = 'City is required.';
    if (!resumeUrl) next.resume = 'Please upload your resume.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const ref = doc(collection(db, 'applications'));
      await setDoc(ref, {
        jobId: job.id,
        jobTitle: job.title,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.replace(/\D/g, ''),
        city: city.trim(),
        resumeUrl,
        coverLetter: coverLetter.trim(),
        linkedIn: linkedIn.trim(),
        portfolio: portfolio.trim(),
        status: 'New',
        notes: '',
        history: [{ status: 'New', note: '', changedAt: Date.now() }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? `Could not submit your application: ${err.message}` : 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-sans text-xl font-bold text-primary">Apply for {job.title}</h2>
            <p className="text-sm text-slate-400 font-sans mt-0.5">{job.location}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <Icons.X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {isSuccess ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
              <Icons.CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="font-sans text-2xl font-bold text-primary mb-3">Application Submitted</h3>
            <p className="text-on-surface-variant font-serif mb-8">
              Thank you for applying to {job.title}. Our team will review your application and get in touch if there's a match.
            </p>
            <button onClick={onClose} className="px-8 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
              {submitError && <p className="text-sm font-sans font-semibold text-red-600">{submitError}</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                  {errors.fullName && <p className="text-xs text-red-600 font-sans mt-1">{errors.fullName}</p>}
                </div>
                <div>
                  <label className={labelClass}>Email *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                  {errors.email && <p className="text-xs text-red-600 font-sans mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className={labelClass}>Phone *</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={10} className={inputClass} placeholder="9876543210" />
                  {errors.phone && <p className="text-xs text-red-600 font-sans mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label className={labelClass}>City *</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
                  {errors.city && <p className="text-xs text-red-600 font-sans mt-1">{errors.city}</p>}
                </div>
              </div>

              <ResumeUploadField value={resumeUrl} fileName={resumeFileName} onChange={(url, name) => { setResumeUrl(url); setResumeFileName(name); }} error={errors.resume} />

              <div>
                <label className={labelClass}>Cover Letter (optional)</label>
                <textarea rows={4} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} className={`${inputClass} resize-none`} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>LinkedIn (optional)</label>
                  <input type="url" value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)} className={inputClass} placeholder="https://linkedin.com/in/..." />
                </div>
                <div>
                  <label className={labelClass}>Portfolio (optional)</label>
                  <input type="url" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} className={inputClass} placeholder="https://..." />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
              <button type="button" onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="px-6 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60">
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
