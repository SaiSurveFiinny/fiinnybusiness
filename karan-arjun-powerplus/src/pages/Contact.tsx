import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { initialAbout, type AboutInfo } from '../data/mockData';
import { db } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

/**
 * Standalone contact page. Reuses the same settings/company Firestore doc
 * and initialAbout fallback already used by About.tsx (see that file for the
 * identical read pattern) — no new data source or admin-editable field is
 * introduced. Phone/address facts and footer copy are the same ones already
 * shown in the site footer (Layout.tsx), not duplicated content.
 */
export default function Contact() {
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

  const whatsappNumber = about.phone.replace(/[^0-9]/g, '');

  const cards = [
    { icon: Icons.Phone, label: t.contact_phone_label, value: about.phone, href: `tel:${whatsappNumber}` },
    { icon: Icons.MessageCircle, label: t.contact_whatsapp_label, value: about.phone, href: `https://wa.me/${whatsappNumber}` },
    { icon: Icons.Mail, label: t.contact_email_label, value: 'support@karanarjun.co.in', href: 'mailto:support@karanarjun.co.in' },
  ];

  return (
    <div className="flex flex-col py-24 px-8 max-w-5xl mx-auto gap-12 min-h-screen">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-primary mb-4 leading-tight">
          {t.contact_page_title}
        </h1>
        <p className="text-base md:text-lg text-on-surface-variant font-serif">{t.contact_page_subtitle}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {cards.map((card) => (
          <a
            key={card.label}
            href={card.href}
            target={card.href.startsWith('http') ? '_blank' : undefined}
            rel={card.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-shadow flex flex-col items-center text-center gap-3"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
              <card.icon className="w-6 h-6" />
            </div>
            <span className="text-xs uppercase tracking-widest font-bold text-on-surface-variant">{card.label}</span>
            <span className="font-sans font-bold text-primary">{card.value}</span>
          </a>
        ))}
      </div>

      <section className="bg-white rounded-[2rem] p-8 md:p-10 border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Icons.MapPin className="w-5 h-5" />
            <h2 className="font-sans font-bold text-lg">{t.contact_address_label}</h2>
          </div>
          <p className="font-serif text-on-surface-variant leading-relaxed">{about.location}</p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Icons.Calendar className="w-5 h-5" />
            <h2 className="font-sans font-bold text-lg">{t.contact_hours_label}</h2>
          </div>
          <p className="font-serif text-on-surface-variant leading-relaxed">{t.contact_hours_value}</p>
        </div>
      </section>

      <div className="flex justify-center">
        <a
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-primary text-secondary-container px-8 py-4 rounded-xl font-sans font-bold hover:bg-primary-container transition-colors shadow-lg"
        >
          <Icons.MessageCircle className="w-5 h-5" />
          {t.contact_whatsapp_button}
        </a>
      </div>
    </div>
  );
}
