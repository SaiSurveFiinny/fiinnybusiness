import React, { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { RecaptchaVerifier, type ConfirmationResult } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { motion, useReducedMotion } from 'motion/react';
import { Icons } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { BRAND_NAME } from '../config/navigation';

type AuthMode = 'signin' | 'signup' | 'phone';
type PhoneStep = 'number' | 'otp';

function getSafeAuthMessage(error: unknown, context: 'signin' | 'signup' | 'google' | 'phone' | 'otp' | 'reset') {
  const code = (error as FirebaseError | undefined)?.code ?? '';

  if (
    context === 'signin'
    && ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)
  ) {
    return 'You have entered wrong user/password.';
  }

  if (context === 'signup' && code === 'auth/email-already-in-use') {
    return 'This email is already registered. Please sign in.';
  }

  if (context === 'phone') {
    if (['auth/invalid-phone-number', 'auth/missing-phone-number'].includes(code)) {
      return 'Invalid mobile number. Please enter a valid 10-digit Indian number.';
    }
    if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
      return 'Too many attempts. Please wait a few minutes before trying again.';
    }
    if (code === 'auth/captcha-check-failed' || code === 'auth/internal-error') {
      return 'Verification check failed. Please refresh the page and try again.';
    }
    return 'Could not send OTP. Please check the mobile number and try again.';
  }

  if (context === 'otp') {
    if (['auth/invalid-verification-code', 'auth/code-expired'].includes(code)) {
      return 'Invalid or expired OTP. Please try again.';
    }
    return 'OTP verification failed. Please try again.';
  }

  if (context === 'reset' && code === 'auth/user-not-found') {
    return 'No account found with this email.';
  }

  return 'Authentication failed. Please try again.';
}

export default function Auth() {
  const reduceMotion = useReducedMotion();
  const { user, loading, signIn, signUp, signInWithGoogle, signInWithPhone, resetPassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('number');
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  if (user && !loading) {
    return <Navigate to="/" replace />;
  }

  const clearRecaptcha = () => {
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch { /* ignore if already cleared */ }
      recaptchaRef.current = null;
    }
  };

  const resetForm = () => {
    setError('');
    setInfo('');
    setPhone('');
    setOtp('');
    setPhoneStep('number');
    setConfirmResult(null);
    clearRecaptcha();
  };

  const switchMode = (next: AuthMode) => {
    resetForm();
    setMode(next);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setIsSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, name.trim());
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(getSafeAuthMessage(err, mode === 'signin' ? 'signin' : 'signup'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(getSafeAuthMessage(err, 'google'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      // Only create a new verifier if one doesn't already exist
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      }
      const fullPhone = `+91${phone.trim()}`;
      const result = await signInWithPhone(fullPhone, recaptchaRef.current);
      setConfirmResult(result);
      setPhoneStep('otp');
      setInfo(`OTP sent to ${fullPhone}`);
    } catch (err) {
      // On failure the verifier is consumed — clear it so next attempt creates a fresh one
      clearRecaptcha();
      setError(getSafeAuthMessage(err, 'phone'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmResult) return;
    setError('');
    setIsSubmitting(true);
    try {
      await confirmResult.confirm(otp.trim());
    } catch (err) {
      setError(getSafeAuthMessage(err, 'otp'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Enter your email first, then click Forgot Password.');
      return;
    }
    try {
      await resetPassword(email.trim());
      setInfo('Password reset email sent. Please check your inbox.');
    } catch (err) {
      setError(getSafeAuthMessage(err, 'reset'));
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row pt-20 2xl:pt-[5.5rem]">
      {/* Left panel — brand/visual story, hidden below lg where a compact header replaces it */}
      <div className="hidden lg:flex w-1/2 relative bg-primary overflow-hidden flex-col justify-between p-12 xl:p-16">
        {/*
          Interim asset: verified real Unsplash photo of a farmer transplanting
          rice seedlings in an Indian paddy field — same asset used deliberately
          on the Who We Are page hero to authentically represent Indian farming.
        */}
        <img
          src="https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?auto=format&fit=crop&w=1600&q=80&fp-y=0.3&crop=focalpoint"
          alt="Farmer transplanting rice seedlings in an Indian paddy field"
          className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/95 via-primary/75 to-primary/95" />

        <motion.div
          className="relative z-10"
          initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <img src="/brand/karan-arjun-logo.png" alt={BRAND_NAME} className="h-14 w-auto object-contain" />
        </motion.div>

        <motion.div
          className="relative z-10 text-white max-w-md"
          initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
        >
          <h2 className="font-sans text-3xl xl:text-4xl font-extrabold mb-5 leading-tight">
            Trust with tradition, one step toward modernity.
          </h2>
          <p className="font-serif text-white/80 leading-relaxed text-base xl:text-lg">
            Precision agriculture solutions built for Indian farmers and sustainable yield. Sign in to manage
            orders, tickets, and your account from anywhere.
          </p>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex-1 flex flex-col overflow-y-auto">
        {/* Compact brand header — visible only below lg, replaces the full visual panel */}
        <div className="lg:hidden flex flex-col items-center gap-3 pt-8 pb-4 px-6 bg-primary">
          <img src="/brand/karan-arjun-logo.png" alt={BRAND_NAME} className="h-10 w-auto object-contain" />
          <p className="font-serif text-white/75 text-sm text-center max-w-xs leading-snug">
            Trust with tradition, one step toward modernity.
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 md:p-8 bg-surface">
          <motion.div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 md:p-10 border border-slate-100 my-8"
            initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="font-sans text-3xl font-extrabold text-primary mb-2">
              {mode === 'phone' ? 'Phone Sign-In' : mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="font-serif text-on-surface-variant text-sm">
              {mode === 'phone' ? 'We\'ll send a one-time password to your mobile' : mode === 'signin' ? 'Sign in to access your dashboard' : 'Join the official Karan Arjun Pvt. Ltd. portal'}
            </p>
          </div>

          {/* Email/signup tabs — hide when in phone mode */}
          {mode !== 'phone' && (
            <div className="flex bg-slate-50 p-1.5 rounded-2xl mb-6 border border-slate-200">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`flex-1 py-3 px-4 rounded-xl font-sans font-bold transition-all ${mode === 'signin' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-primary'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-3 px-4 rounded-xl font-sans font-bold transition-all ${mode === 'signup' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-primary'}`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && <p className="mb-4 text-sm font-sans font-semibold text-red-600">{error}</p>}
          {info && <p className="mb-4 text-sm font-sans font-semibold text-emerald-700">{info}</p>}

          {/* Social buttons — hide when in phone mode */}
          {mode !== 'phone' && (
            <>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors mb-3 font-sans font-bold text-primary disabled:opacity-60"
              >
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2G12m3xsHHzz0Zs52jjHypEvXWHOgM1mdK3BDoO_xRmGaDgLoHRYsC_0oXdbaWKD4bv8C3k6dgMl9jME2LIPeu8Inrk_-oC5UQGdGCS5stwFL33m5DO_TEEEvRgqtaa38BEqN-E1F18lp2q4A0MDwQFtv_-Q3jlQZdes4eLG7JQnxZNacr1_lLGn9cNqJDsLy_2CBeZ4Ovx9yjwuryIKnj30lNniBxoH0wURjzpnyzFkXDgCw4uE00aVYSA6lHMI4h6p1701TvRBl"
                  alt="Google"
                  className="w-5 h-5"
                />
                Continue with Google
              </button>

              <button
                type="button"
                onClick={() => switchMode('phone')}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors mb-6 font-sans font-bold text-primary disabled:opacity-60"
              >
                <Icons.Phone className="w-5 h-5" />
                Continue with Phone (OTP)
              </button>

              <div className="relative flex items-center mb-6">
                <div className="flex-grow border-t border-slate-100" />
                <span className="flex-shrink-0 mx-4 text-xs text-slate-400 font-sans font-bold uppercase tracking-widest">
                  or continue with email
                </span>
                <div className="flex-grow border-t border-slate-100" />
              </div>
            </>
          )}

          {/* Email form */}
          {mode !== 'phone' && (
            <form onSubmit={handleEmailAuth} className="space-y-5">
              {mode === 'signup' && (
                <div>
                  <label className="block font-sans font-bold text-primary text-sm mb-2">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rajesh Patil"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-serif"
                  />
                </div>
              )}
              <div>
                <label className="block font-sans font-bold text-primary text-sm mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="farmer@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-serif"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block font-sans font-bold text-primary text-sm">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={handleForgotPassword} className="text-xs font-sans font-bold text-secondary hover:underline">
                      Forgot Password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-serif"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-primary text-white font-sans font-bold rounded-xl hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {mode === 'signin' ? 'Sign In' : 'Create Account'} <Icons.ArrowRight className="w-5 h-5" />
              </button>
            </form>
          )}

          {/* Phone OTP form */}
          {mode === 'phone' && (
            <div className="space-y-5">
              {/* invisible reCAPTCHA anchor */}
              <div id="recaptcha-container" />

              {phoneStep === 'number' ? (
                <form onSubmit={handleSendOTP} className="space-y-5">
                  <div>
                    <label className="block font-sans font-bold text-primary text-sm mb-2">Mobile Number</label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-sans font-bold text-primary text-sm shrink-0">
                        +91
                      </span>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        maxLength={10}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-serif"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 font-sans">Enter 10-digit Indian mobile number</p>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || phone.replace(/\D/g, '').length < 10}
                    className="w-full py-4 bg-primary text-white font-sans font-bold rounded-xl hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting ? 'Sending…' : 'Send OTP'} <Icons.ArrowRight className="w-5 h-5" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-5">
                  <div>
                    <label className="block font-sans font-bold text-primary text-sm mb-2">Enter OTP</label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit OTP"
                      maxLength={6}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all font-serif tracking-[0.5em] text-center text-xl"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || otp.length < 6}
                    className="w-full py-4 bg-primary text-white font-sans font-bold rounded-xl hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting ? 'Verifying…' : 'Verify OTP'} <Icons.ArrowRight className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearRecaptcha(); setPhoneStep('number'); setOtp(''); setConfirmResult(null); setError(''); setInfo(''); }}
                    className="w-full text-sm font-sans font-bold text-primary/60 hover:text-primary transition-colors"
                  >
                    ← Change number
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="w-full text-sm font-sans font-bold text-primary/60 hover:text-primary transition-colors pt-2"
              >
                Use email instead
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link to="/" className="text-xs font-sans font-bold text-primary/60 hover:text-primary transition-colors">
              Back to home
            </Link>
          </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
