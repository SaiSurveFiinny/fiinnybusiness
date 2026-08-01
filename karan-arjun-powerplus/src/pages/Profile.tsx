import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { Icons } from '../components/Icons';
import { PaymentDetailModal, type PaymentDetailOrder } from '../components/PaymentDetailModal';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import type { ProfileUpdates } from '../context/AuthContext';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

interface OrderRecord {
  id: string;
  createdAt?: { seconds?: number };
  status?: string;
  totalAmount?: number;
  items?: Array<{ id?: string; name: string; quantity: number; price?: number }>;
  paymentStatus?: 'paid' | 'pending' | 'failed';
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  address?: string;
  state?: string;
  district?: string;
  pinCode?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  failureReason?: string;
  shipmentStatus?: 'processing' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled';
  trackingId?: string;
  shiprocketOrderId?: string;
}

interface TicketRecord {
  id: string;
  ticketId: string;
  subject: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  date?: string;
  createdAt?: { seconds?: number };
  messages: Array<{
    id: string;
    sender: 'admin' | 'customer';
    text: string;
    createdAt: number;
  }>;
}

interface EditForm {
  name: string;
  email: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
}

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 bg-slate-50 font-sans text-sm transition-all';
const labelClass = 'block font-sans text-sm font-semibold text-primary mb-1.5';

export default function Profile() {
  const { user, profile, loading, updateUserProfile } = useAuth();

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PaymentDetailOrder | null>(null);
  const [grievances, setGrievances] = useState<TicketRecord[]>([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);

  // Edit profile state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '', email: '', phone: '', village: '', district: '', state: '', pincode: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  useEffect(() => {
    if (!user || profile?.role === 'admin') return;

    const ordersQuery = query(collection(db, 'orders'), where('uid', '==', user.uid));
    const grievancesQuery = query(collection(db, 'grievances'), where('uid', '==', user.uid));

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const list = snapshot.docs
        .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Omit<OrderRecord, 'id'>) }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setOrders(list);
    });

    const unsubscribeGrievances = onSnapshot(grievancesQuery, (snapshot) => {
      const list = snapshot.docs
        .map((docItem) => {
          const data = docItem.data();
          const messages = Array.isArray(data.messages)
            ? data.messages
                .map((item) => ({
                  id: String(item?.id ?? ''),
                  sender: (item?.sender === 'customer' ? 'customer' : 'admin') as 'admin' | 'customer',
                  text: String(item?.text ?? ''),
                  createdAt: Number(item?.createdAt ?? 0),
                }))
                .filter((item) => item.id && item.text)
                .sort((a, b) => a.createdAt - b.createdAt)
            : [];
          return {
            id: docItem.id,
            ticketId: String(data.ticketId ?? `GRV-${docItem.id.slice(0, 8).toUpperCase()}`),
            subject: String(data.subject ?? ''),
            description: String(data.description ?? ''),
            status: (data.status as TicketRecord['status']) ?? 'Pending',
            date: String(data.date ?? '-'),
            createdAt: data.createdAt as TicketRecord['createdAt'],
            messages,
          };
        })
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setGrievances(list);
    });

    return () => { unsubscribeOrders(); unsubscribeGrievances(); };
  }, [user, profile?.role]);

  const initials = useMemo(() => {
    const value = profile?.name ?? user?.displayName ?? 'User';
    return value.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }, [profile?.name, user?.displayName]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-primary font-sans font-semibold">
        Loading account...
      </div>
    );
  }

  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;

  const openEdit = () => {
    setEditForm({
      name: profile?.name ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
      village: profile?.village ?? '',
      district: profile?.district ?? '',
      state: profile?.state ?? '',
      pincode: profile?.pincode ?? '',
    });
    setSaveError('');
    setSaveSuccess('');
    setIsEditOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const updates: ProfileUpdates = {
        name: editForm.name.trim() || 'Guest',
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        village: editForm.village.trim(),
        district: editForm.district.trim(),
        state: editForm.state,
        pincode: editForm.pincode.trim(),
      };
      await updateUserProfile(updates);
      setSaveSuccess('Profile updated successfully!');
      setIsEditOpen(false);
    } catch {
      setSaveError('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof EditForm) => ({
    value: editForm[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const handleGrievanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!user) { setError('Please sign in again.'); return; }
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
      setInfo(`Ticket submitted! ID: ${ticketId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomerReply = async (ticket: TicketRecord) => {
    const replyText = (replyDrafts[ticket.id] ?? '').trim();
    if (!user || !replyText) return;
    setSendingReplyId(ticket.id);
    try {
      await updateDoc(doc(db, 'grievances', ticket.id), {
        messages: arrayUnion({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sender: 'customer',
          text: replyText,
          createdAt: Date.now(),
        }),
        updatedAt: serverTimestamp(),
      });
      setReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reply.');
    } finally {
      setSendingReplyId(null);
    }
  };

  const hasAddress = profile?.village || profile?.district || profile?.state;
  const addressLine = [profile?.village, profile?.district, profile?.state, profile?.pincode]
    .filter(Boolean).join(', ');

  return (
    <div className="flex flex-col py-24 px-8 max-w-5xl mx-auto gap-8 min-h-screen relative">
      <header className="mb-2 relative z-10 text-center">
        <h1 className="font-sans text-4xl font-extrabold text-primary mb-2 tracking-tight">Your Profile</h1>
        <p className="text-on-surface-variant font-serif">Manage your account, orders, and support tickets.</p>
      </header>

      {saveSuccess && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
          <Icons.CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-sans font-semibold text-emerald-700">{saveSuccess}</p>
        </div>
      )}

      <div className="flex flex-col gap-8 relative z-10">

        {/* Avatar / Info Card */}
        <div className="glass-panel-dark rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center gap-10 relative overflow-hidden">
          <div className="w-28 h-28 shrink-0 rounded-full overflow-hidden border-4 border-white/20 shadow-[0_0_20px_rgba(250,204,21,0.15)] flex items-center justify-center bg-gradient-to-br from-primary-container to-primary">
            <span className="text-4xl font-sans font-bold text-secondary-container">{initials || 'U'}</span>
          </div>

          <div className="flex flex-col flex-1 items-center md:items-start w-full gap-4">
            <div className="flex items-center gap-3 w-full justify-center md:justify-start">
              <div>
                <h2 className="font-sans text-3xl font-bold text-white leading-tight">
                  {profile?.name ?? user?.displayName ?? 'Guest'}
                </h2>
                <p className="text-white/50 text-sm font-medium tracking-wide capitalize mt-0.5">
                  {profile?.role ?? 'customer'} account
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/80 font-sans justify-center md:justify-start">
              {(profile?.email) && (
                <div className="flex items-center gap-2">
                  <Icons.Mail className="w-4 h-4 text-secondary-container shrink-0" />
                  <span>{profile.email}</span>
                </div>
              )}
              {(profile?.phone) && (
                <div className="flex items-center gap-2">
                  <Icons.Phone className="w-4 h-4 text-secondary-container shrink-0" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {hasAddress && (
                <div className="flex items-center gap-2">
                  <Icons.MapPin className="w-4 h-4 text-secondary-container shrink-0" />
                  <span>{addressLine}</span>
                </div>
              )}
              {!profile?.email && !profile?.phone && !hasAddress && (
                <p className="text-white/40 text-sm italic">No contact details added yet.</p>
              )}
            </div>
          </div>

          <button
            onClick={openEdit}
            className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-sans font-bold transition-colors border border-white/10"
          >
            <Icons.Edit className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        </div>

        {/* Edit Profile Form */}
        {isEditOpen && (
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-sm">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="font-sans text-2xl font-bold text-primary tracking-tight">Edit Profile</h2>
                <p className="text-on-surface-variant font-serif text-sm mt-1">
                  Update your personal info and farm address.
                </p>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors mt-1"
              >
                <Icons.X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-8">

              {/* Personal Info */}
              <div>
                <p className="font-sans text-xs font-bold text-primary/50 uppercase tracking-widest mb-4">
                  Personal Info
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Rajesh Patil"
                      className={inputClass}
                      {...field('name')}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Email Address
                      {!profile?.email && (
                        <span className="ml-2 text-[10px] font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Not added
                        </span>
                      )}
                    </label>
                    <input
                      type="email"
                      placeholder="farmer@example.com"
                      className={inputClass}
                      {...field('email')}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Mobile Number
                      {!profile?.phone && (
                        <span className="ml-2 text-[10px] font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Not added
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 py-3 rounded-xl border border-slate-200 bg-slate-100 font-sans font-bold text-primary text-sm shrink-0">
                        +91
                      </span>
                      <input
                        type="tel"
                        placeholder="9876543210"
                        maxLength={10}
                        className={`${inputClass} flex-1`}
                        value={editForm.phone.replace(/^\+91/, '')}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setEditForm((prev) => ({ ...prev, phone: digits ? `+91${digits}` : '' }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="font-sans text-xs font-bold text-primary/50 uppercase tracking-widest mb-4">
                  Farm / Delivery Address
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Village / Area</label>
                    <input
                      type="text"
                      placeholder="e.g. Karjat"
                      className={inputClass}
                      {...field('village')}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>District</label>
                    <input
                      type="text"
                      placeholder="e.g. Ahmednagar"
                      className={inputClass}
                      {...field('district')}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>State</label>
                    <select className={`${inputClass} cursor-pointer`} {...field('state')}>
                      <option value="">Select state...</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Pincode</label>
                    <input
                      type="text"
                      placeholder="414402"
                      maxLength={6}
                      className={inputClass}
                      value={editForm.pincode}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))
                      }
                    />
                  </div>
                </div>
              </div>

              {saveError && (
                <p className="text-sm font-sans font-semibold text-red-600">{saveError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 sm:flex-none py-3 px-8 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    'Saving...'
                  ) : (
                    <><Icons.CheckCircle className="w-4 h-4" /> Save Changes</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="flex-1 sm:flex-none py-3 px-8 border border-slate-200 text-slate-600 rounded-xl font-sans font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Order History */}
        <div className="bg-surface-container rounded-[2.5rem] p-10 border border-black/5 shadow-sm">
          <h2 className="font-sans text-2xl font-bold text-primary tracking-tight mb-8">Order History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-sm">
              <thead>
                <tr className="border-b border-primary/10">
                  <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Order ID</th>
                  <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Date</th>
                  <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Items</th>
                  <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Payment</th>
                  <th className="py-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">Status</th>
                  <th className="py-4 text-right text-primary/60 font-semibold uppercase tracking-wider text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const date = order.createdAt?.seconds
                    ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('en-IN')
                    : '-';
                  const productLabel = order.items?.map((item) => `${item.name} x${item.quantity}`).join(', ') ?? '-';
                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="border-b border-primary/5 hover:bg-white/60 transition-colors cursor-pointer"
                    >
                      <td className="py-5 font-semibold text-primary">#{order.id.slice(0, 8).toUpperCase()}</td>
                      <td className="py-5 text-on-surface-variant font-medium">{date}</td>
                      <td className="py-5 font-semibold text-primary max-w-[260px] truncate">{productLabel}</td>
                      <td className="py-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          order.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : order.paymentStatus === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}>
                          {order.paymentStatus ?? 'pending'}
                        </span>
                      </td>
                      <td className="py-5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                          <Icons.Truck className="w-3.5 h-3.5" />
                          {order.status ?? 'Placed'}
                        </span>
                      </td>
                      <td className="py-5 text-right font-bold text-primary">
                        ₹{Number(order.totalAmount ?? 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td className="py-6 text-on-surface-variant" colSpan={6}>No orders yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <PaymentDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />

        {/* Support Tickets */}
        <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm">
          <div className="flex flex-col md:flex-row gap-10">
            <div className="flex-1">
              <h2 className="font-sans text-2xl font-bold text-primary tracking-tight mb-2">Support & Grievances</h2>
              <p className="text-on-surface-variant font-serif text-sm mb-8">
                Submit a ticket and our support team will get back to you.
              </p>
              {error && <p className="text-sm font-sans font-semibold text-red-600 mb-3">{error}</p>}
              {info && <p className="text-sm font-sans font-semibold text-emerald-700 mb-3">{info}</p>}
              <form onSubmit={handleGrievanceSubmit} className="space-y-4">
                <div>
                  <label className={labelClass}>Subject</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="E.g., Order delay, Product damage..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your issue in detail..."
                    className={`${inputClass} resize-none`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-secondary-container px-6 py-3 rounded-xl font-sans font-bold text-sm w-full hover:bg-primary-container transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </form>
            </div>

            <div className="flex-1">
              <h3 className="font-sans text-xl font-bold text-primary tracking-tight mb-6">Your Tickets</h3>
              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                {grievances.map((ticket) => (
                  <div key={ticket.id} className="p-5 rounded-2xl border border-slate-100 bg-slate-50 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-sans font-bold text-primary text-sm">{ticket.subject}</h4>
                        <p className="font-sans text-[10px] uppercase tracking-wider text-primary/60 mt-1">{ticket.ticketId}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider ${
                        ticket.status === 'Resolved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : ticket.status === 'In Progress'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-700'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <p className="font-serif text-xs text-on-surface-variant line-clamp-2">{ticket.description}</p>
                    {ticket.messages.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {ticket.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-lg px-3 py-2 border ${
                              message.sender === 'admin'
                                ? 'bg-primary/5 border-primary/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <p className="font-sans text-[10px] uppercase tracking-wider text-primary/60 mb-1">
                              {message.sender === 'admin' ? 'Admin Reply' : 'Your Message'}
                            </p>
                            <p className="font-sans text-xs text-primary/90">{message.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {ticket.status === 'Resolved' ? (
                      <p className="font-sans text-[11px] text-emerald-600 font-semibold mt-1">
                        Ticket closed — this issue has been resolved.
                      </p>
                    ) : (
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={replyDrafts[ticket.id] ?? ''}
                          onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleCustomerReply(ticket); }}
                          placeholder="Reply to this ticket..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-sans bg-white focus:outline-none focus:border-primary/30"
                        />
                        <button
                          onClick={() => void handleCustomerReply(ticket)}
                          disabled={sendingReplyId === ticket.id || !(replyDrafts[ticket.id] ?? '').trim()}
                          className="px-4 py-2 rounded-xl bg-primary text-secondary-container text-xs font-sans font-bold hover:bg-primary-container transition-colors disabled:opacity-50"
                        >
                          {sendingReplyId === ticket.id ? 'Sending...' : 'Reply'}
                        </button>
                      </div>
                    )}
                    <span className="font-sans text-[10px] text-slate-400">{ticket.date ?? '-'}</span>
                  </div>
                ))}
                {grievances.length === 0 && (
                  <p className="text-sm font-serif text-slate-400">You have no past tickets.</p>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
