import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { initialAbout, type AboutInfo } from '../../data/mockData';
import { db } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Reads the same live settings/company Firestore doc already used by
 * About.tsx and Contact.tsx (identical onSnapshot pattern) — the
 * certification shown here stays in sync if it's ever updated via
 * Admin.tsx's Company Info tab. No certification is invented; only the
 * existing `certification` field (ISO 9001:2015 today) is displayed. Laid
 * out as a two-column trust panel so a single badge doesn't read as
 * isolated in empty space; the badge grid on the right accommodates
 * additional certifications later without restructuring.
 */
export function Certifications() {
  const { t } = useLanguage();
  const [about, setAbout] = useState<AboutInfo>(initialAbout);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'company'), (snapshot) => {
      if (!snapshot.exists()) {
        setAbout(initialAbout);
        return;
      }
      const data = snapshot.data();
      setAbout({
        tagline: String(data.tagline ?? initialAbout.tagline),
        manufacturer: String(data.manufacturer ?? initialAbout.manufacturer),
        location: String(data.location ?? initialAbout.location),
        phone: String(data.phone ?? initialAbout.phone),
        certification: String(data.certification ?? initialAbout.certification),
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <section className="relative z-10 bg-surface py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center bg-white border border-primary/10 rounded-[2rem] p-8 md:p-12">
          <div>
            <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4 block">
              {t.certifications_title}
            </span>
            <p className="font-serif text-xl text-primary leading-relaxed">{t.certifications_subtitle}</p>
          </div>

          <div className="flex items-center gap-5 p-6 rounded-2xl bg-primary/5 border border-primary/10">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-secondary-container shrink-0">
              <Icons.ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <span className="font-sans font-extrabold text-primary text-lg block">{about.certification}</span>
              <span className="text-xs uppercase tracking-widest font-bold text-on-surface-variant">Certified</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
