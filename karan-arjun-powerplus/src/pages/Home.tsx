import { CompanySnapshot } from '../components/home/CompanySnapshot';
import { FarmerSuccess } from '../components/home/FarmerSuccess';
import { FeaturedProducts } from '../components/home/FeaturedProducts';
import { HomeHero } from '../components/home/HomeHero';
import { LearnAndGrow } from '../components/home/LearnAndGrow';
import { SupportContactCTA } from '../components/home/SupportContactCTA';
import { WhatWeDo } from '../components/home/WhatWeDo';
import { WhyTrustUs } from '../components/home/WhyTrustUs';
import { KrishiDukanShowcase } from '../components/home/KrishiDukanShowcase';
import { RetailNetworkSection } from '../features/retail-network/components/RetailNetworkSection';
import { useLanguage } from '../context/LanguageContext';

/**
 * Corporate homepage for Karan Arjun Pvt. Ltd. Each section uses a
 * deliberately different visual treatment so the page reads as a designed
 * story rather than a repeated card-grid template. Support and Contact are
 * represented here only as a closing CTA linking to their dedicated pages
 * (/support, /contact) — the live ticket form itself lives once, on the
 * Support page, via SupportTicketPanel. The original single-product
 * homepage content is preserved at /who-we-are (see WhoWeAre.tsx).
 */
export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col relative">
      <HomeHero />
      <CompanySnapshot />
      <WhatWeDo />
      <FeaturedProducts />
      <WhyTrustUs />
      <KrishiDukanShowcase />
      <RetailNetworkSection />
      <FarmerSuccess title={t.farmersuccess_title} description={t.farmersuccess_desc} variant="dark" />
      <LearnAndGrow />
      <SupportContactCTA />
    </div>
  );
}
