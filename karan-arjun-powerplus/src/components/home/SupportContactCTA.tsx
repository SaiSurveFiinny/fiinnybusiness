import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Icons } from '../Icons';
import { initialAbout, type AboutInfo } from '../../data/mockData';
import { db } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Homepage closing CTA — a premium two-column band presenting Support and
 * Contact as clear paths, each linking to its now-real dedicated page
 * (/support, /contact). This replaces embedding the live ticket form
 * directly on the homepage: the form itself has one home now (Support.tsx,
 * via SupportTicketPanel) and this section only links to it, avoiding a
 * second live instance of the same Firestore-writing feature. Contact facts
 * reuse the same settings/company data as About.tsx and Contact.tsx.
 */
export function SupportContactCTA() {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
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
    <section className="relative z-10 py-20 md:py-28 overflow-hidden">
      {/* Interim asset: verified real Unsplash photo of farmers gathered together in a field near Nagpur, Maharashtra — a distinct photo from the same regional series already used elsewhere on this site. Should be replaced with licensed company photography before production. */}
      <motion.img
        src="https://images.unsplash.com/photo-1709532386360-bf8651a95368?auto=format&fit=crop&w=2000&q=80"
        alt="Farmers gathered together in a field near Nagpur, Maharashtra"
        className="absolute inset-0 w-full h-full object-cover object-center md:object-[center_35%]"
        initial={reduceMotion ? undefined : { opacity: 0, scale: 1.04 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 1 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/80 to-primary/90" />

      <div className="max-w-6xl mx-auto px-8 relative z-10">
        <motion.div
          className="text-center mb-16 max-w-2xl mx-auto"
          initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
            {t.support_contact_cta_title}
          </h2>
          <p className="font-serif text-lg text-white/70">{t.support_contact_cta_subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.div
            className="bg-primary/40 border border-white/15 backdrop-blur-sm rounded-[2.5rem] p-8 md:p-10 flex flex-col"
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: reduceMotion ? 0 : 0.1 }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-secondary-container mb-6">
              <Icons.MessageCircle className="w-7 h-7" />
            </div>
            <h3 className="font-sans text-2xl font-extrabold text-white mb-3">{t.support_cta_title}</h3>
            <p className="text-white/70 font-serif mb-8 flex-grow">{t.support_cta_desc}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/support"
                className="flex-1 inline-flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-6 py-3.5 rounded-xl font-sans font-bold hover:bg-white transition-colors shadow-lg"
              >
                {t.support_cta_raise_ticket} <Icons.ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/profile"
                className="flex-1 inline-flex items-center justify-center gap-2 border border-white/20 text-white px-6 py-3.5 rounded-xl font-sans font-bold hover:bg-white/10 transition-colors"
              >
                {t.support_cta_track_ticket}
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="bg-primary/40 border border-white/15 backdrop-blur-sm rounded-[2.5rem] p-8 md:p-10 flex flex-col"
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: reduceMotion ? 0 : 0.2 }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-secondary-container mb-6">
              <Icons.MapPin className="w-7 h-7" />
            </div>
            <h3 className="font-sans text-2xl font-extrabold text-white mb-3">{t.contact_cta_title}</h3>
            <p className="text-white/70 font-serif mb-6">{t.contact_cta_desc}</p>
            <div className="flex flex-col gap-2 mb-8 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Icons.Phone className="w-4 h-4 text-secondary-container shrink-0" /> {about.phone}
              </div>
              <div className="flex items-center gap-2">
                <Icons.MapPin className="w-4 h-4 text-secondary-container shrink-0" /> {about.location}
              </div>
            </div>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 border border-white/20 text-white px-6 py-3.5 rounded-xl font-sans font-bold hover:bg-white/10 transition-colors w-fit"
            >
              {t.contact_cta_button} <Icons.ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
