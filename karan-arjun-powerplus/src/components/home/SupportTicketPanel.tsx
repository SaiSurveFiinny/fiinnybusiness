import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

/**
 * The site's live support-ticket intake — auth-gated form, Firestore write to
 * `grievances`, and role-aware states (guest / signed-in customer / admin).
 * This is the ONE implementation of this feature. Originally lived inline in
 * Home.tsx, then ConnectSection.tsx; now extracted so the Support page (its
 * permanent home) and anything else that needs it can import and reuse it
 * without copying the logic. Behavior is unchanged from every prior version.
 */
export function SupportTicketPanel() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [ticketInfo, setTicketInfo] = useState('');

  const handleGrievanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setTicketError('');
    setTicketInfo('');
    setSubmitting(true);
    try {
      const grievanceRef = doc(collection(db, 'grievances'));
      const ticketId = `GRV-${grievanceRef.id.slice(0, 8).toUpperCase()}`;
      await setDoc(grievanceRef, {
        ticketId,
        uid: user.uid,
        userName: profile?.name ?? user.displayName ?? 'Guest',
        subject: subject.trim(),
        description: description.trim(),
        status: 'Pending',
        date: new Date().toLocaleDateString('en-IN'),
        messages: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubject('');
      setDescription('');
      setTicketInfo(`Ticket submitted! Your ID: ${ticketId}`);
    } catch {
      setTicketError('Could not submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Icons.MessageCircle className="w-5 h-5 text-primary" />
        <h2 className="font-sans text-xl font-extrabold text-primary">{t.support_title}</h2>
      </div>
      <p className="text-on-surface-variant font-serif text-sm mb-8">{t.support_subtitle}</p>

      {user && profile?.role !== 'admin' ? (
        <>
          {ticketError && <p className="text-sm font-sans font-semibold text-red-600 mb-4">{ticketError}</p>}
          {ticketInfo && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-6">
              <Icons.CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-sans font-semibold text-emerald-700">{ticketInfo}</p>
            </div>
          )}
          <form onSubmit={handleGrievanceSubmit} className="space-y-4">
            <div>
              <label className="block font-sans text-sm font-semibold text-primary mb-2">{t.subject_label}</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t.subject_placeholder}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/30 bg-slate-50 font-sans text-sm"
              />
            </div>
            <div>
              <label className="block font-sans text-sm font-semibold text-primary mb-2">{t.description_label}</label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.description_placeholder}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary/30 bg-slate-50 font-sans text-sm resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? t.submitting : (
                <><Icons.Send className="w-4 h-4" /> {t.submit_ticket}</>
              )}
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 font-sans mt-4">
            {t.track_prefix}{' '}
            <Link to="/profile" className="text-primary font-semibold hover:underline">{t.track_link_text}</Link>
            {t.track_suffix}
          </p>
        </>
      ) : user && profile?.role === 'admin' ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Icons.ShieldCheck className="w-10 h-10 text-primary/40" />
          <p className="font-sans font-semibold text-primary/70">{t.admin_signed_in} <Link to="/admin" className="text-primary underline">{t.admin_panel}</Link>.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <Icons.Lock className="w-10 h-10 text-primary/30" />
          <div>
            <p className="font-sans font-semibold text-primary mb-1">{t.sign_in_title}</p>
            <p className="font-serif text-sm text-on-surface-variant">{t.sign_in_desc}</p>
          </div>
          <Link
            to="/auth"
            className="px-8 py-3 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors inline-flex items-center gap-2"
          >
            <Icons.LogIn className="w-4 h-4" /> {t.sign_in_button}
          </Link>
        </div>
      )}
    </div>
  );
}
