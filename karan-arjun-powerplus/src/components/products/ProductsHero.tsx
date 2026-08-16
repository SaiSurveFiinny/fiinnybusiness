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
 *
 * Design intent (confirmed against the originally approved desktop
 * composition): the trees sit BEHIND the green arch — only their upper
 * canopy rises above the arch's curved rim, while their base/trunk is
 * hidden behind it, giving the "emerging from behind" layered look. The
 * arch is a half-ellipse (`aspect-[2/1]`, `rounded-t-full`), so its rim
 * height at a given horizontal offset from center follows
 * `archHeight * sqrt(1 - (offset / archHalfWidth)^2)` — it's tall near the
 * center and drops off toward the edges. On desktop (offset ±320px against
 * a ~1024px-wide arch) that rim sits low enough at the tree's position
 * that roughly the top ~27% of the 480px-tall tree clears it. This was the
 * actual, correct behavior; a previous pass mistakenly diagnosed the bug as
 * the trees being hidden by the arch (true only at a much smaller,
 * incorrectly-scaled mobile offset — see below) and "fixed" it by moving
 * the trees to a higher z-index than the arch, which put them completely
 * in front at every breakpoint and broke the intended layered depth.
 *
 * Two real, still-relevant bugs from that same investigation:
 * 1. A dead Tailwind `-translate-x-1/2` class alongside a Motion
 *    `animate={{ x: ... }}` on the same `motion.img` — Motion writes
 *    `transform` as an inline style, which always wins over that element's
 *    Tailwind transform *class* wholesale (not additively), so the class
 *    never actually applied once Motion mounted, leaving the tree centered
 *    incorrectly. Fixed by splitting positioning (a plain wrapper `div`
 *    that owns `left: 50%` + one complete `translate-x-[calc(-50% ± Npx)]`
 *    transform per breakpoint) from animation (an inner `motion.img` that
 *    only animates opacity/rotate, never touching the wrapper's transform).
 * 2. The mobile offset/height/vertical-position were arbitrary guesses, not
 *    derived from the arch's actual geometry — at a small offset the arch's
 *    rim is still tall (the dome is wide relative to a small x), so a short
 *    mobile-scaled tree sat entirely below the rim and read as "hidden."
 *    Fixed by computing offset/bottom/height per breakpoint from the same
 *    ellipse formula above so ~27% of the tree clears the rim at every
 *    breakpoint, matching desktop's actual (not assumed) proportions — see
 *    the values below, which reduce to the exact original desktop numbers
 *    (offset 320px, bottom 112px/`bottom-28`, height 480px) at `md:`.
 *
 * Stacking order (lowest to highest): tree wrapper `-z-10` → arch `z-0` →
 * bottles `z-20`. The arch paints ON TOP of the trees, which is what makes
 * the trees' base disappear behind it while their taller canopy — rising
 * above the arch's own box — still shows past its edge; the arch's own
 * `overflow-hidden` only clips its own internal glow children, never the
 * sibling tree elements outside it.
 */
export function ProductsHero() {
  const { t } = useLanguage();

  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-60"></div>
      </div>

      <section className="relative pt-28 md:pt-32 pb-0 overflow-hidden text-center z-10">
        <div className="absolute top-24 md:top-32 left-[4%] sm:left-[15%] z-10 transform -rotate-12 animate-bounce">
          <Icons.Sprout className="w-8 h-8 md:w-12 md:h-12 text-emerald-500 opacity-40" />
        </div>
        <div className="absolute top-40 md:top-48 right-[4%] sm:right-[15%] z-10 transform rotate-12 animate-pulse">
          <Icons.Grape className="w-8 h-8 md:w-12 md:h-12 text-violet-500 opacity-40" />
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

        <div className="max-w-7xl mx-auto px-6 sm:px-8 relative z-20">
          <p className="font-sans text-primary-container mb-4 italic font-bold tracking-widest uppercase text-xs sm:text-sm">
            {t.hero_tagline}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-sans text-[24px] sm:text-[28px] md:text-[52px] font-extrabold leading-tight mb-8 md:mb-12 uppercase tracking-tight max-w-4xl mx-auto text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-secondary"
          >
            {t.hero_heading_line1} <br className="hidden md:block"/> {t.hero_heading_line2}
          </motion.h1>

          <div className="relative w-full max-w-5xl mx-auto mt-24 sm:mt-32 md:mt-48 flex justify-center items-end h-[240px] sm:h-[340px] md:h-[500px]">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[130%] sm:w-[140%] md:w-[110%] aspect-[2/1] bg-gradient-to-t from-primary to-primary-container rounded-t-full shadow-[0_-20px_50px_rgba(10,25,19,0.2)] border-t border-white/10 z-0 overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[60%] bg-white/10 blur-[80px] rounded-full"></div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[80%] bg-secondary-container/20 blur-[100px] rounded-full"></div>
            </div>

            {/*
              Trees are BEHIND the arch (-z-10, vs the arch's z-0) — only
              their canopy, which rises above the arch's curved rim at this
              horizontal offset, should show; the base is meant to be
              covered. Offset/bottom/height at each breakpoint are derived
              from the arch's ellipse geometry (see the component doc
              comment) to keep ~27% of the tree visible above the rim at
              every screen size, matching the original desktop proportions
              exactly at md: (offset 320px, bottom 112px, height 480px).
            */}
            <div className="absolute bottom-[54px] sm:bottom-[76px] md:bottom-28 left-1/2 translate-x-[calc(-50%-100px)] sm:translate-x-[calc(-50%-185px)] md:translate-x-[calc(-50%-320px)] h-[180px] sm:h-[400px] md:h-[480px] -z-10">
              <motion.img
                initial={{ opacity: 0, rotate: -20 }}
                animate={{ opacity: 1, rotate: -12 }}
                transition={{ duration: 1, delay: 0.2 }}
                src="/orangeimage.png"
                className="h-full w-auto object-contain drop-shadow-xl origin-bottom"
                alt="Orange Tree"
              />
            </div>
            <div className="absolute bottom-[54px] sm:bottom-[76px] md:bottom-28 left-1/2 translate-x-[calc(-50%+100px)] sm:translate-x-[calc(-50%+185px)] md:translate-x-[calc(-50%+320px)] h-[180px] sm:h-[400px] md:h-[480px] -z-10">
              <motion.img
                initial={{ opacity: 0, rotate: 20 }}
                animate={{ opacity: 1, rotate: 12 }}
                transition={{ duration: 1, delay: 0.3 }}
                src="/cherryimage.png"
                className="h-full w-auto object-contain drop-shadow-xl origin-bottom"
                alt="Cherry Tree"
              />
            </div>

            <div className="relative flex items-end justify-center w-full h-full pb-4 sm:pb-6 md:pb-8 z-20 -space-x-4 sm:-space-x-6 md:-space-x-16 overflow-visible">
              <motion.img
                whileHover={{ scale: 1.05 }}
                src="/bottle-1l-Photoroom.png"
                className="h-[45%] md:h-[70%] object-contain rotate-12 drop-shadow-2xl z-10"
                alt="Power Plus 1L"
              />
              <motion.img
                whileHover={{ scale: 1.05 }}
                src="/bottle-5l-Photoroom.png"
                className="h-[65%] md:h-[90%] object-contain z-20 drop-shadow-2xl"
                alt="Power Plus 5L"
              />
              <motion.img
                whileHover={{ scale: 1.05 }}
                src="/bottle-3l-Photoroom.png"
                className="h-[45%] md:h-[70%] object-contain -rotate-12 drop-shadow-2xl z-10"
                alt="Power Plus 3L"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
