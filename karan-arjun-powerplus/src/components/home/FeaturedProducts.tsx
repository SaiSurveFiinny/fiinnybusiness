import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Large, image-dominant feature banner for the flagship product — replaces
 * the boxed "spotlight card" pattern with a full-bleed-scale asymmetric
 * panel, closer to how a hero-scale product moment reads on corporate
 * agri sites rather than a grid item.
 */
export function FeaturedProducts() {
  const { t } = useLanguage();

  return (
    <section className="relative z-10 bg-surface overflow-hidden">
      <div className="max-w-7xl mx-auto px-8 py-20 md:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-4 items-center">
        <div className="lg:col-span-5 order-2 lg:order-1">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4 block">
            {t.featured_products_title}
          </span>
          <h3 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-5 leading-tight">
            Karan Arjun Power Plus™
          </h3>
          <p className="text-on-surface-variant font-serif text-base md:text-lg mb-6 max-w-md">
            {t.featured_products_subtitle}
          </p>
          <p className="text-on-surface-variant text-sm mb-10 max-w-md leading-relaxed">
            22% Humates & Fulvates liquid biostimulant — one of the products behind our commitment to Indian
            agriculture.
          </p>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 bg-primary text-secondary-container px-8 py-4 rounded-full font-sans font-bold hover:bg-primary-container transition-colors shadow-xl"
          >
            {t.featured_products_cta} <Icons.ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="lg:col-span-7 order-1 lg:order-2 relative">
          <div className="relative rounded-[2.5rem] overflow-hidden aspect-[4/3] md:aspect-[16/10]">
            <img
              src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1600&q=80"
              alt="Grapevine field ready for harvest"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-primary/10 to-transparent" />
            <motion.img
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              src="/bottle-5l-Photoroom.png"
              className="absolute bottom-6 right-6 md:bottom-10 md:right-10 h-[45%] md:h-[55%] object-contain drop-shadow-2xl"
              alt="Power Plus 5L"
            />
            <span className="absolute top-6 left-6 inline-flex items-center gap-2 px-4 py-1.5 bg-white/90 backdrop-blur-md rounded-full text-primary text-xs font-sans font-bold uppercase tracking-widest">
              <Icons.Star className="w-3.5 h-3.5 text-secondary" /> {t.nav_power_plus}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
