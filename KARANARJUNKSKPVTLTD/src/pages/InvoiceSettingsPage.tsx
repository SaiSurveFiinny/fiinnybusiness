import { useState, useEffect, useRef } from 'react';
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import {
    FileText, Save, Loader2, ShieldAlert, Building2, MapPin, Hash, ShieldCheck,
    Image as ImageIcon, CreditCard, PenLine, QrCode, KeyRound, Upload, X,
    ZoomIn, ZoomOut, Maximize2, FileCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { PosInvoicePreview, type PosInvoiceItem, type PosInvoiceCustomer } from '../components/PosInvoicePreview';

// ── Sample data shown in the live preview ───────────────────────────────────
const PREVIEW_CART: PosInvoiceItem[] = [
    { name: 'KaranArjun Power Plus 1L', mfgCompany: 'UNIMAX', batchNo: 'PP01/26', expDate: '2028-01-01', gstPct: 10, unit: 'ltr', cartQuantity: 1, cartTotal: 1500, sellingPrice: 1500, type: 'Insecticide' },
    { name: 'Urea (45 kg)', mfgCompany: 'IFFCO', batchNo: 'URE24', expDate: '2027-06-01', gstPct: 5, unit: 'bag', cartQuantity: 2, cartTotal: 1200, sellingPrice: 600, type: 'Fertilizer' },
    { name: 'Bajra Seeds (5 kg)', mfgCompany: 'MAHYCO', batchNo: 'BJ25A', expDate: '2026-12-01', gstPct: 0, unit: 'kg', cartQuantity: 3, cartTotal: 750, sellingPrice: 250, type: 'Seeds' },
];
const PREVIEW_CUSTOMER: PosInvoiceCustomer = {
    name: 'Ramesh Patil',
    phone: '9876543210',
    address: 'At Nandgaon, Tal - Karjat',
    pin: '410201',
};
const PREVIEW_GRAND_TOTAL = PREVIEW_CART.reduce((s, i) => s + i.cartTotal, 0);

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div style={{ background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1.1rem', borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                <span style={{ color: 'var(--primary)' }}>{icon}</span>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{title}</span>
            </div>
            <div style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {children}
            </div>
        </div>
    );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{label}</label>
            {children}
            {hint && <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>{hint}</p>}
        </div>
    );
}

export default function InvoiceSettingsPage() {
    const { userRole, tenantId, tenantData } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        businessName: tenantData?.businessName || '',
        address: tenantData?.location || '',
        gstin: '',
        contact: '',
        fertilizerLicense: '',
        pesticideLicense: '',
        seedsLicense: '',
        logoUrl: tenantData?.logoUrl || '',
        bankDetails: '',
        signatureName: '',
        signatureUrl: '',
        upiId: '',
        razorpayKeyId: '',
        terms: '1. Goods once sold will not be taken back.\n2. Payment should be made within 30 days.',
        // Default preserves today's exact display — existing tenants who never
        // touch this setting keep the original mixed-case invoice presentation.
        invoiceTextCase: 'normal' as 'normal' | 'uppercase',
    });
    const [uploadingSig, setUploadingSig] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const sigInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // Preview controls
    const [previewFormat, setPreviewFormat] = useState<'A5' | 'A4'>('A5');
    const [zoom, setZoom] = useState(1);

    const set = (patch: Partial<typeof settings>) => setSettings(s => ({ ...s, ...patch }));

    const handleUpload = async (file: File, field: 'signatureUrl' | 'logoUrl', setter: (v: boolean) => void) => {
        if (!tenantId || !file) return;
        setter(true);
        try {
            const path = field === 'signatureUrl'
                ? `tenants/${tenantId}/branding/signature_${Date.now()}_${file.name}`
                : `tenants/${tenantId}/branding/logo_${Date.now()}_${file.name}`;
            const snap = await uploadBytes(storageRef(storage, path), file);
            const url = await getDownloadURL(snap.ref);
            set({ [field]: url });
            showToast(`${field === 'signatureUrl' ? 'Signature' : 'Logo'} uploaded. Remember to Save.`, 'success');
        } catch (err) {
            console.error('Upload failed', err);
            showToast('Upload failed. Please try again.', 'error');
        } finally {
            setter(false);
        }
    };

    useEffect(() => {
        if (!tenantId || userRole !== 'admin') { setLoading(false); return; }
        getDoc(getTenantDoc(db, tenantId, 'settings', 'invoice'))
            .then(snap => {
                if (!snap.exists()) return;
                const data = snap.data() as any;
                // Backward-compat: migrate old single licenseNumbers into fertilizerLicense
                setSettings(s => ({
                    ...s,
                    ...data,
                    fertilizerLicense: data.fertilizerLicense ?? (data.licenseNumbers || ''),
                    pesticideLicense: data.pesticideLicense ?? '',
                    seedsLicense: data.seedsLicense ?? '',
                }));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [tenantId, userRole]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;
        setSaving(true);
        try {
            await setDoc(getTenantDoc(db, tenantId, 'settings', 'invoice'), {
                ...settings,
                updatedAt: serverTimestamp(),
            });
            showToast('Invoice settings saved successfully!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to save. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (userRole !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>Access Denied</h2>
                <p>Only admins can configure invoice settings.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto' }} /> Loading…
            </div>
        );
    }

    // Live branding object fed into the preview — updates as user types
    const previewBranding = {
        businessName: settings.businessName || 'Your Business Name',
        address: settings.address,
        gstin: settings.gstin,
        contact: settings.contact,
        logoUrl: settings.logoUrl,
        signatureUrl: settings.signatureUrl,
        signatureName: settings.signatureName,
        upiId: settings.upiId,
        fertilizerLicense: settings.fertilizerLicense,
        pesticideLicense: settings.pesticideLicense,
        seedsLicense: settings.seedsLicense,
        invoiceTextCase: settings.invoiceTextCase,
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.5rem 0.7rem',
        borderRadius: '8px',
        border: '1px solid var(--surface-border)',
        fontSize: '0.88rem',
        background: 'var(--surface-raised)',
        color: 'var(--text-primary)',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    };
    const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: '72px', resize: 'vertical', paddingTop: '0.5rem' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)' }}>
            {/* Page header */}
            <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-base)', marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '0.5rem', borderRadius: '10px' }}>
                        <FileText size={20} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Invoice Settings</h1>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Configure branding, licenses, and preview the live invoice</p>
                    </div>
                </div>
            </div>

            {/* Two-column body */}
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', flex: 1, overflow: 'hidden' }}>

                {/* ── LEFT: Settings form ──────────────────────────────────── */}
                <form onSubmit={handleSave} style={{ overflowY: 'auto', padding: '1.25rem', borderRight: '1px solid var(--surface-border)' }}>

                    {/* Business Information */}
                    <Card title="Business Information" icon={<Building2 size={15} />}>
                        <Field label="Business Name *">
                            <input required style={inputStyle} value={settings.businessName}
                                onChange={e => set({ businessName: e.target.value })} placeholder="e.g. KaranArjun Krushi Seva Kendra" />
                        </Field>
                        <Field label="Address">
                            <textarea style={textareaStyle} value={settings.address}
                                onChange={e => set({ address: e.target.value })} placeholder="Full address with village, taluka, district, PIN" />
                        </Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <Field label="GSTIN">
                                <input style={inputStyle} value={settings.gstin} placeholder="27XXXXX…"
                                    onChange={e => set({ gstin: e.target.value })} />
                            </Field>
                            <Field label="Contact Number">
                                <input style={inputStyle} value={settings.contact} placeholder="Phone / WhatsApp"
                                    onChange={e => set({ contact: e.target.value })} />
                            </Field>
                        </div>
                    </Card>

                    {/* License Numbers */}
                    <Card title="License Numbers" icon={<ShieldCheck size={15} />}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: 0 }}>
                            Licenses appear on every printed invoice below the business address. Each appears only when filled.
                        </p>
                        <Field label="Fertilizer License Number">
                            <input style={inputStyle} value={settings.fertilizerLicense} placeholder="e.g. MH/FRT/2021/001234"
                                onChange={e => set({ fertilizerLicense: e.target.value })} />
                        </Field>
                        <Field label="Pesticide License Number">
                            <input style={inputStyle} value={settings.pesticideLicense} placeholder="e.g. MH/PST/2021/005678"
                                onChange={e => set({ pesticideLicense: e.target.value })} />
                        </Field>
                        <Field label="Seeds License Number">
                            <input style={inputStyle} value={settings.seedsLicense} placeholder="e.g. MH/SDS/2021/009012"
                                onChange={e => set({ seedsLicense: e.target.value })} />
                        </Field>
                    </Card>

                    {/* Logo */}
                    <Card title="Logo" icon={<ImageIcon size={15} />}>
                        <Field label="Logo URL" hint="Paste a public image URL, or upload below.">
                            <input style={inputStyle} value={settings.logoUrl} placeholder="https://example.com/logo.png"
                                onChange={e => set({ logoUrl: e.target.value })} />
                        </Field>
                        <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logoUrl', setUploadingLogo); e.target.value = ''; }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {settings.logoUrl && (
                                <img src={settings.logoUrl} alt="Logo preview"
                                    style={{ height: '48px', maxWidth: '140px', objectFit: 'contain', background: '#fff', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '4px' }} />
                            )}
                            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                                {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                {settings.logoUrl ? 'Replace' : 'Upload Logo'}
                            </button>
                            {settings.logoUrl && (
                                <button type="button" onClick={() => set({ logoUrl: '' })}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.75rem', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>
                                    <X size={14} /> Remove
                                </button>
                            )}
                        </div>
                    </Card>

                    {/* Banking Details */}
                    <Card title="Banking Details" icon={<CreditCard size={15} />}>
                        <Field label="Bank Details" hint="Appears in the invoice footer for NEFT/RTGS payments.">
                            <textarea style={textareaStyle} value={settings.bankDetails}
                                onChange={e => set({ bankDetails: e.target.value })}
                                placeholder={'Bank Name: SBI\nA/C No: 1234567890\nIFSC: SBIN0001234\nBranch: Karjat'} />
                        </Field>
                    </Card>

                    {/* Payment Settings */}
                    <Card title="Payment Settings" icon={<QrCode size={15} />}>
                        <Field label="UPI ID" hint="Shown as a QR code on printed bills so customers can scan and pay.">
                            <input style={inputStyle} value={settings.upiId}
                                onChange={e => set({ upiId: e.target.value })} placeholder="e.g. yourname@upi or 9307199040@paytm" />
                        </Field>
                        <Field label="Razorpay Public Key" hint="Only your public key (starts with rzp_live_…). Never enter your secret key here.">
                            <input style={inputStyle} value={settings.razorpayKeyId}
                                onChange={e => set({ razorpayKeyId: e.target.value })} placeholder="rzp_live_xxxxxxxxxxxxxxxx" />
                        </Field>
                    </Card>

                    {/* Signature */}
                    <Card title="Signature" icon={<PenLine size={15} />}>
                        <Field label="Authorised Signatory Name">
                            <input style={inputStyle} value={settings.signatureName}
                                onChange={e => set({ signatureName: e.target.value })} placeholder="e.g. Karan Patil" />
                        </Field>
                        <Field label="Signature Image" hint="Printed above the signatory name. Leave empty to print name only.">
                            <input ref={sigInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'signatureUrl', setUploadingSig); e.target.value = ''; }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {settings.signatureUrl && (
                                    <img src={settings.signatureUrl} alt="Signature"
                                        style={{ height: '48px', maxWidth: '160px', objectFit: 'contain', background: '#fff', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '4px' }} />
                                )}
                                <button type="button" onClick={() => sigInputRef.current?.click()} disabled={uploadingSig}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                                    {uploadingSig ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    {settings.signatureUrl ? 'Replace' : 'Upload Signature'}
                                </button>
                                {settings.signatureUrl && (
                                    <button type="button" onClick={() => set({ signatureUrl: '' })}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.75rem', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>
                                        <X size={14} /> Remove
                                    </button>
                                )}
                            </div>
                        </Field>
                    </Card>

                    {/* Invoice Terms */}
                    <Card title="Invoice Terms" icon={<FileCheck size={15} />}>
                        <Field label="Terms & Conditions">
                            <textarea style={{ ...textareaStyle, minHeight: '90px' }} value={settings.terms}
                                onChange={e => set({ terms: e.target.value })} />
                        </Field>
                    </Card>

                    {/* Invoice Text Format */}
                    <Card title="Invoice Text Format" icon={<FileText size={15} />}>
                        <Field label="Text Display Format" hint="Controls how customer, product, company, batch and unit text appears on the printed invoice. Numbers, dates, GST %, rates and amounts are never affected.">
                            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                                {([
                                    ['normal', 'Normal / Existing'],
                                    ['uppercase', 'UPPERCASE / Capital Letters'],
                                ] as const).map(([value, label]) => (
                                    <button key={value} type="button" onClick={() => set({ invoiceTextCase: value })}
                                        style={{
                                            flex: 1, padding: '0.5rem 0.75rem', border: 'none', fontWeight: 700, fontSize: '0.8rem',
                                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                            background: settings.invoiceTextCase === value ? 'var(--primary)' : 'var(--surface-raised)',
                                            color: settings.invoiceTextCase === value ? 'white' : 'var(--text-secondary)',
                                        }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </Card>

                    {/* Removed — was KeyRound unused import warning */}
                    <div style={{ display: 'none' }}><KeyRound size={0} /><Hash size={0} /><MapPin size={0} /></div>

                    <button type="submit" disabled={saving}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '10px', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit', marginTop: '0.25rem' }}>
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        {saving ? 'Saving…' : 'Save Invoice Settings'}
                    </button>
                </form>

                {/* ── RIGHT: Live preview ─────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-color)', overflow: 'hidden' }}>

                    {/* Preview toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1.25rem', borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-base)', flexShrink: 0, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Live Preview</span>

                        {/* Format toggle */}
                        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                            {(['A5', 'A4'] as const).map(f => (
                                <button key={f} type="button" onClick={() => setPreviewFormat(f)}
                                    style={{ padding: '0.3rem 0.75rem', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', background: previewFormat === f ? 'var(--primary)' : 'var(--surface-raised)', color: previewFormat === f ? 'white' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                                    {f}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: '1px', height: '20px', background: 'var(--surface-border)' }} />

                        {/* Zoom controls */}
                        <button type="button" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}
                            style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                            <ZoomOut size={15} />
                        </button>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'center' }}>
                            {Math.round(zoom * 100)}%
                        </span>
                        <button type="button" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}
                            style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                            <ZoomIn size={15} />
                        </button>
                        <button type="button" onClick={() => setZoom(previewFormat === 'A5' ? 0.9 : 0.7)}
                            style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                            <Maximize2 size={15} />
                        </button>
                    </div>

                    {/* Scrollable preview area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', background: '#e8e8e8' }}>
                        <div style={{
                            transform: `scale(${zoom})`,
                            transformOrigin: 'top center',
                            // Reserve space so the container doesn't collapse when zoomed out
                            marginBottom: `${(zoom - 1) * -50}%`,
                            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            // A5 landscape ≈ 210×148mm; A4 portrait ≈ 210×297mm
                            width: previewFormat === 'A5' ? '794px' : '595px',
                        }}>
                            <PosInvoicePreview
                                cart={PREVIEW_CART}
                                customer={PREVIEW_CUSTOMER}
                                branding={previewBranding}
                                billNumber="KA-0001"
                                grandTotal={PREVIEW_GRAND_TOTAL}
                                billFormat={previewFormat}
                                invoiceDate={new Date().toISOString().split('T')[0]}
                                modeOfPayment="Cash"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
