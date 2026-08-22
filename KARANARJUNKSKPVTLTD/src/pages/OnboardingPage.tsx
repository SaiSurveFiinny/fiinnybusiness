import { useState } from 'react';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { LOCATION_DATA, STATES } from '../utils/locationData';

export default function OnboardingPage() {
    const [formData, setFormData] = useState({
        name: '',
        number: '',
        email: '',
        country: 'India',
        state: 'Maharashtra',
        district: '',
        taluka: '',
        atPost: '',
        fullAddress: '',
        gstin: '',
        licenseNumber: '',
        portfolioSize: 'Small'
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const { t } = useTranslation();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const { tenantId } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;
        setIsSubmitting(true);
        setSubmitStatus('idle');

        try {
            await addDoc(getTenantCollection(db, tenantId, 'retailers'), {
                ...formData,
                location: `${formData.atPost}, ${formData.taluka}, ${formData.district}`, // For backward compatibility
                createdAt: serverTimestamp(),
                totalSales: 0,
                totalPaid: 0,
                outstandingAmount: 0
            });
            setSubmitStatus('success');
            setFormData({
                name: '', number: '', email: '',
                country: 'India', state: 'Maharashtra',
                district: '', taluka: '', atPost: '',
                fullAddress: '', gstin: '', licenseNumber: '',
                portfolioSize: 'Small'
            });
        } catch (err) {
            console.error("Error adding document: ", err);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>{t('onboarding.onboarding_title')}</h1>
                <p style={{ color: 'var(--text-secondary)' }}>{t('onboarding.onboarding_desc')}</p>
            </div>

            <div className="glass-panel" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>

                    <div className="input-group animate-slide-in delay-100" style={{ animationFillMode: 'forwards' }}>
                        <label htmlFor="name">{t('onboarding.business_name_label')}</label>
                        <input
                            required
                            type="text"
                            id="name"
                            name="name"
                            className="input-field"
                            placeholder={t('onboarding.placeholder_business_name')}
                            value={formData.name}
                            onChange={handleChange}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group animate-slide-in delay-200" style={{ animationFillMode: 'forwards' }}>
                            <label htmlFor="number">{t('onboarding.contact_number')}</label>
                            <input
                                required
                                type="tel"
                                id="number"
                                name="number"
                                className="input-field"
                                placeholder="+91..."
                                value={formData.number}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="input-group animate-slide-in delay-200" style={{ animationFillMode: 'forwards' }}>
                            <label htmlFor="email">{t('auth.email')} ({t('common.optional')})</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                className="input-field"
                                placeholder="email@example.com"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="country">{t('onboarding.country')}</label>
                            <input readOnly type="text" id="country" name="country" className="input-field" value={formData.country} style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                        </div>
                        <div className="input-group">
                            <label htmlFor="state">{t('onboarding.state')}</label>
                            <select
                                id="state"
                                name="state"
                                className="input-field"
                                value={formData.state}
                                onChange={e => setFormData(prev => ({ ...prev, state: e.target.value, district: '' }))}
                                style={{ cursor: 'pointer', appearance: 'auto' }}
                            >
                                <option value="">{t('onboarding.select_state')}</option>
                                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="district">{t('onboarding.district')}</label>
                            <select
                                required
                                id="district"
                                name="district"
                                className="input-field"
                                value={formData.district}
                                onChange={handleChange}
                                style={{ cursor: 'pointer', appearance: 'auto' }}
                            >
                                <option value="">{t('onboarding.select_district')}</option>
                                {(LOCATION_DATA[formData.state] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label htmlFor="taluka">{t('onboarding.taluka')}</label>
                            <input type="text" id="taluka" name="taluka" className="input-field" placeholder={t('onboarding.placeholder_taluka')} value={formData.taluka} onChange={handleChange} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="atPost">{t('onboarding.village')}</label>
                            <input type="text" id="atPost" name="atPost" className="input-field" placeholder={t('onboarding.placeholder_village')} value={formData.atPost} onChange={handleChange} />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="fullAddress">{t('onboarding.full_address')}</label>
                        <textarea
                            id="fullAddress"
                            name="fullAddress"
                            className="input-field"
                            placeholder={t('onboarding.placeholder_full_address')}
                            value={formData.fullAddress}
                            onChange={e => setFormData(prev => ({ ...prev, fullAddress: e.target.value }))}
                            rows={2}
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="gstin">{t('onboarding.gstin_optional')}</label>
                            <input type="text" id="gstin" name="gstin" className="input-field" placeholder={t('onboarding.placeholder_gstin')} value={formData.gstin} onChange={handleChange} />
                        </div>
                        <div className="input-group">
                            <label htmlFor="licenseNumber">{t('onboarding.license_number_optional')}</label>
                            <input type="text" id="licenseNumber" name="licenseNumber" className="input-field" placeholder={t('onboarding.placeholder_license')} value={formData.licenseNumber} onChange={handleChange} />
                        </div>
                    </div>

                    <div className="input-group animate-slide-in delay-400" style={{ marginBottom: '2rem', animationFillMode: 'forwards' }}>
                        <label htmlFor="portfolioSize">{t('onboarding.portfolio_size')}</label>
                        <select
                            id="portfolioSize"
                            name="portfolioSize"
                            className="input-field"
                            value={formData.portfolioSize}
                            onChange={handleChange}
                            style={{ cursor: 'pointer', appearance: 'auto' }}
                        >
                            <option value="Small">{t('onboarding.small_retailer')}</option>
                            <option value="Medium">{t('onboarding.medium_retailer')}</option>
                            <option value="Big">{t('onboarding.big_distributor')}</option>
                        </select>
                    </div>

                    {submitStatus === 'success' && (
                        <div style={{ padding: '1rem', background: 'hsla(142, 60%, 40%, 0.1)', color: 'var(--success)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <CheckCircle2 size={18} /> {t('onboarding.register_success')}
                        </div>
                    )}

                    {submitStatus === 'error' && (
                        <div style={{ padding: '1rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <AlertCircle size={18} /> {t('onboarding.register_error')}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary animate-pulse"
                        style={{ width: '100%', marginTop: '1rem' }}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? t('onboarding.saving') : <><Save size={20} /> {t('onboarding.register_retailer')}</>}
                    </button>

                </form>
            </div>
        </div>
    );
}
