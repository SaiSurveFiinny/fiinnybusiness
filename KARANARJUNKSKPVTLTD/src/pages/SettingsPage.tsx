import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Shield, Globe, Download, Info, Save, Building2, User, Moon, Sun, LayoutTemplate, FileText, Loader2, Plus, ChevronRight } from 'lucide-react';
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import InvoiceSettingsPage from './InvoiceSettingsPage';
import ManageRolesPage from './ManageRolesPage';

export default function SettingsPage() {
    const { t, i18n } = useTranslation();
    const { tenantId } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('profile');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profile, setProfile] = useState({ businessName: '', industry: '' });

    useEffect(() => {
        if (!tenantId) return;
        getDoc(getTenantDoc(db, tenantId, 'settings', 'profile')).then(snap => {
            if (snap.exists()) setProfile(snap.data() as any);
        });
    }, [tenantId]);

    const handleSaveProfile = async () => {
        if (!tenantId) return;
        setIsSavingProfile(true);
        try {
            await setDoc(getTenantDoc(db, tenantId, 'settings', 'profile'), { ...profile, updatedAt: serverTimestamp() });
            showToast('Business profile saved!', 'success');
        } catch {
            showToast('Failed to save profile.', 'error');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const languages = [
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'mr', name: 'Marathi (मराठी)', flag: '🇮🇳' },
        { code: 'hi', name: 'Hindi (हिंदी)', flag: '🇮🇳' }
    ];

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Settings size={32} /> {t('invoice_settings.title')}
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage your SaaS platform preferences and profile</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
                {/* Sidebar */}
                <div className="glass-panel" style={{ padding: '1rem', height: 'fit-content' }}>
                    {[
                        { id: 'profile', icon: User, label: 'Business Profile' },
                        { id: 'invoice', icon: FileText, label: 'Invoice Branding' },
                        { id: 'appearance', icon: Sun, label: 'Appearance' },
                        { id: 'builder', icon: LayoutTemplate, label: 'UI Builder (Admins)', adminOnly: true },
                        { id: 'language', icon: Globe, label: 'Language & Region' },
                        { id: 'security', icon: Shield, label: 'Security & Access' },
                        { id: 'companies', icon: Building2, label: 'Multi-Company' },
                        { id: 'install', icon: Download, label: 'Install App (PWA)' },
                        { id: 'about', icon: Info, label: 'About Platform' }
                    ].filter(item => !item.adminOnly || window.location.pathname.includes('/settings')).map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem',
                                border: 'none',
                                background: activeTab === item.id ? 'var(--surface-raised)' : 'transparent',
                                color: activeTab === item.id ? 'var(--primary-light)' : 'var(--text-secondary)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontWeight: activeTab === item.id ? 600 : 400,
                                textAlign: 'left',
                                marginBottom: '0.5rem'
                            }}
                        >
                            <item.icon size={20} /> {item.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    {activeTab === 'profile' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Building2 size={24} /> Business Profile
                            </h2>
                            <div className="input-group">
                                <label>Business Legal Name</label>
                                <input className="input-field" value={profile.businessName} onChange={e => setProfile({ ...profile, businessName: e.target.value })} placeholder="e.g. KaranArjun Krushi Seva Kendra" />
                            </div>
                            <div className="input-group">
                                <label>Industry / Sector</label>
                                <input className="input-field" value={profile.industry} onChange={e => setProfile({ ...profile, industry: e.target.value })} placeholder="e.g. Agriculture / Retail" />
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={handleSaveProfile} disabled={isSavingProfile}>
                                {isSavingProfile ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Changes
                            </button>
                        </div>
                    )}

                    {activeTab === 'invoice' && (
                        <div className="animate-fade-in">
                            <InvoiceSettingsPage />
                        </div>
                    )}

                    {activeTab === 'builder' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <LayoutTemplate size={24} /> UI Layout Builder
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                                Customize exactly which fields appear in tables, exports, and forms across the whole app.
                            </p>
                            <a href="/admin#schema-builder" className="btn btn-primary" style={{ display: 'inline-flex', padding: '1rem 2rem', textDecoration: 'none' }}>
                                Open UI Builder Workspace
                            </a>
                        </div>
                    )}

                    {activeTab === 'appearance' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Sun size={24} /> Appearance Settings
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                                Customize how the platform looks on your device.
                            </p>

                            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Platform Theme</h3>
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Choose between Light and Dark mode</p>
                                </div>
                                <button
                                    onClick={() => {
                                        // This will be handled by the Layout passing down toggleTheme
                                        // But since we are inside a Route element, we should use context or prop drilling
                                        // For now, I'll update App.tsx to pass it down properly
                                        (window as any).__toggleTheme?.();
                                    }}
                                    className="btn btn-secondary"
                                    style={{ borderRadius: '99px', padding: '0.75rem 1.5rem' }}
                                >
                                    {/* Temporary display, will be synced with state */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Moon size={18} /> Switch Theme
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="animate-fade-in" style={{ margin: '-2rem' }}>
                            <ManageRolesPage />
                        </div>
                    )}

                    {activeTab === 'companies' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Building2 size={22} /> Multi-Company Management
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                                Manage multiple business entities (e.g., different GSTINs, companies) from one login.
                            </p>

                            {/* Current Company */}
                            <div style={{ padding: '1.25rem', background: 'hsla(152,60%,40%,0.07)', border: '2px solid var(--primary)', borderRadius: '14px', marginBottom: '1.5rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-light)', marginBottom: '0.5rem' }}>✓ Active Company</div>
                                <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.25rem' }}>{profile.businessName || 'Your Business'}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{profile.industry || 'Industry not set'}</div>
                            </div>

                            {/* Other companies placeholder */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                {['Company Branch 2', 'Company Branch 3'].map((name, i) => (
                                    <div key={i} style={{ padding: '1rem 1.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.4 }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Not configured</div>
                                        </div>
                                        <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                                    </div>
                                ))}
                            </div>

                            <button
                                className="btn btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}
                                onClick={() => alert('Multi-company onboarding coming in Phase 5! Each company gets its own GSTIN, invoices, inventory, and retailers, all under one login.')}
                            >
                                <Plus size={16} /> Add Another Company
                            </button>

                            <div style={{ padding: '0.75rem 1rem', background: 'hsla(45,93%,47%,0.07)', border: '1px solid hsla(45,93%,47%,0.2)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                💡 <strong>Multi-company isolation</strong> gives each entity its own invoices, GST filings, inventory, retailers, and reports — switchable from this panel in one click.
                            </div>
                        </div>
                    )}

                    {activeTab === 'language' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Globe size={24} /> {t('common.language')}
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                {languages.map(lang => (
                                    <button
                                        key={lang.code}
                                        onClick={() => i18n.changeLanguage(lang.code)}
                                        className="glass-panel"
                                        style={{
                                            padding: '1.5rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            border: i18n.language === lang.code ? '2px solid var(--primary)' : '1px solid var(--surface-border)',
                                            background: i18n.language === lang.code ? 'hsla(152, 60%, 40%, 0.1)' : 'var(--surface-base)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <span style={{ fontSize: '2rem' }}>{lang.flag}</span>
                                        <span style={{ fontWeight: 600 }}>{lang.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'install' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Download size={24} /> Offline Access
                            </h2>
                            <div className="glass-panel" style={{ padding: '1.5rem', background: 'hsla(152, 60%, 40%, 0.05)', border: '1px solid var(--primary)' }}>
                                <p style={{ marginBottom: '1rem', lineHeight: 1.6 }}>
                                    Install **KaranArjun** on your device to access it faster and use features like offline billing.
                                </p>
                                <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                                    <li>Install from Chrome address bar</li>
                                    <li>Add to Home Screen on Safari (iOS)</li>
                                    <li>Instant access from your App Drawer</li>
                                </ul>
                                <button className="btn btn-primary animate-pulse" style={{ width: '100%' }}>
                                    <Download size={20} /> Install Now
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'about' && (
                        <div className="animate-fade-in">
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Platform Information</h2>
                            <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <p><strong>Version:</strong> 2.0.0 (Modernized)</p>
                                <p><strong>Tenant ID:</strong> <code style={{ background: 'var(--surface-raised)', padding: '2px 4px', borderRadius: '4px' }}>{window.location.host}</code></p>
                                <p><strong>Environment:</strong> Production (Ready)</p>
                                <hr style={{ border: 'none', borderTop: '1px solid var(--surface-border)', margin: '1rem 0' }} />
                                <p style={{ fontSize: '0.875rem' }}>
                                    &copy; 2026 KaranArjun Pvt Ltd. All rights reserved. <br />
                                    Modernized for growth by Antigravity AI.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
