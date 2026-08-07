import { motion } from 'motion/react';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Animated product showcase hero — "Trust with Tradition, One Step Toward
 * Modernity". Originally the opening section of WhoWeAre.tsx; extracted
 * here verbatim (same floating decorative icons, same bottle composition,
 * same motion timings/values) so it can be reused as the Products page's
 * opening hero without duplicating the implementation. WhoWeAre.tsx no
 * longer renders this — see that file's history — since this hero's
 * product-first, bottle-showcase framing belongs to the product catalogue,
 * not the company profile. The "Shop Now" button and "Trusted by 75,800+
 * Farmers" badge that used to sit beneath the bottles have been removed as
 * redundant promotional UI (the hero already sits on the Products page
 * itself, and the trust-badge stat isn't independently verifiable here).
 */
export function ProductsHero() {
  const { t } = useLanguage();

  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-60"></div>
      </div>

      <section className="relative pt-32 pb-0 overflow-hidden text-center z-10">
        <div className="absolute top-32 left-[15%] z-10 transform -rotate-12 animate-bounce">
          <Icons.Sprout className="w-12 h-12 text-emerald-500 opacity-40" />
        </div>
        <div className="absolute top-48 right-[15%] z-10 transform rotate-12 animate-pulse">
          <Icons.Grape className="w-12 h-12 text-violet-500 opacity-40" />
        </div>
        <div className="absolute top-24 right-[28%] z-10 transform -rotate-6 animate-pulse hidden md:block">
          <Icons.Apple className="w-12 h-12 text-rose-500 opacity-40" />
        </div>
        <div className="absolute top-64 left-[28%] z-10 transform rotate-6 animate-bounce hidden lg:block">
          <Icons.Cherry className="w-12 h-12 text-fuchsia-500 opacity-40" />
        </div>
        <div className="absolute top-40 left-[6%] z-10 transform -rotate-12 animate-pulse hidden xl:block">
          <Icons.Carrot className="w-12 h-12 text-orange-500 opacity-40" />
        </div>
        <div className="absolute top-20 left-[40%] z-10 transform rotate-6 animate-bounce hidden md:block">
          <Icons.Citrus className="w-12 h-12 text-yellow-400 opacity-45" />
        </div>
        <div className="absolute top-52 right-[6%] z-10 transform -rotate-12 animate-pulse hidden lg:block">
          <Icons.Salad className="w-12 h-12 text-green-500 opacity-40" />
        </div>
        <div className="absolute top-72 right-[32%] z-10 transform rotate-12 animate-bounce hidden xl:block">
          <Icons.Wheat className="w-12 h-12 text-amber-500 opacity-40" />
        </div>
        <div className="absolute top-[22rem] left-[12%] z-10 transform -rotate-6 animate-pulse hidden lg:block">
          <Icons.Vegan className="w-12 h-12 text-teal-500 opacity-40" />
        </div>

        <div className="max-w-7xl mx-auto px-8 relative z-20">
          <p className="font-sans text-primary-container mb-4 italic font-bold tracking-widest uppercase text-sm">
            {t.hero_tagline}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-sans text-[28px] md:text-[52px] font-extrabold leading-tight mb-8 md:mb-12 uppercase tracking-tight max-w-4xl mx-auto text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-secondary"
          >
            {t.hero_heading_line1} <br className="hidden md:block"/> {t.hero_heading_line2}
          </motion.h1>

          <div className="relative w-full max-w-5xl mx-auto mt-40 md:mt-48 flex justify-center items-end h-[300px] md:h-[500px]">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140%] md:w-[110%] aspect-[2/1] bg-gradient-to-t from-primary to-primary-container rounded-t-full shadow-[0_-20px_50px_rgba(10,25,19,0.2)] border-t border-white/10 -z-10 overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[60%] bg-white/10 blur-[80px] rounded-full"></div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[80%] bg-secondary-container/20 blur-[100px] rounded-full"></div>
            </div>

            <motion.img
              initial={{ opacity: 0, x: -50, rotate: -20 }}
              animate={{
                opacity: 1,
                x: window.innerWidth < 768 ? -140 : -320,
                rotate: -12,
                scale: window.innerWidth < 768 ? 0.7 : 1.1
              }}
              transition={{ duration: 1, delay: 0.2 }}
              src="/orangeimage.png"
              className="absolute bottom-16 md:bottom-28 left-1/2 -translate-x-1/2 h-[320px] md:h-[480px] -z-20 object-contain drop-shadow-xl origin-bottom"
              alt="Orange Tree"
            />
            <motion.img
              initial={{ opacity: 0, x: 50, rotate: 20 }}
              animate={{
                opacity: 1,
                x: window.innerWidth < 768 ? 140 : 320,
                rotate: 12,
                scale: window.innerWidth < 768 ? 0.7 : 1.1
              }}
              transition={{ duration: 1, delay: 0.3 }}
              src="/cherryimage.png"
              className="absolute bottom-16 md:bottom-28 left-1/2 -translate-x-1/2 h-[320px] md:h-[480px] -z-20 object-contain drop-shadow-xl origin-bottom"
              alt="Cherry Tree"
            />

            <div className="relative flex items-end justify-center w-full h-full pb-8 z-20 -space-x-8 md:-space-x-16 overflow-visible">
              <motion.img
                whileHover={{ scale: 1.05 }}
                src="/bottle-1l-Photoroom.png"
                className="h-[50%] md:h-[70%] object-contain rotate-12 drop-shadow-2xl z-10"
                alt="Power Plus 1L"
              />
              <motion.img
                whileHover={{ scale: 1.05 }}
                src="/bottle-5l-Photoroom.png"
                className="h-[70%] md:h-[90%] object-contain z-20 drop-shadow-2xl"
                alt="Power Plus 5L"
              />
              <motion.img
                whileHover={{ scale: 1.05 }}
                src="/bottle-3l-Photoroom.png"
                className="h-[50%] md:h-[70%] object-contain -rotate-12 drop-shadow-2xl z-10"
                alt="Power Plus 3L"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
