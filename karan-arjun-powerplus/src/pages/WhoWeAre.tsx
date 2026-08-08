import { WhyChooseUs } from '../components/home/WhyChooseUs';
import { CompanyHero } from '../components/company/CompanyHero';
import { OurJourney } from '../components/company/OurJourney';
import { MissionVision } from '../components/company/MissionVision';
import { CoreValues } from '../components/company/CoreValues';
import { Leadership } from '../components/company/Leadership';
import { Infrastructure } from '../components/company/Infrastructure';
import { Manufacturing } from '../components/company/Manufacturing';
import { QualityStandards } from '../components/company/QualityStandards';
import { Certifications } from '../components/company/Certifications';
import { useLanguage } from '../context/LanguageContext';

/**
 * The corporate company-profile section (hero, journey, mission/vision,
 * values, leadership, infrastructure, manufacturing, quality, certifications)
 * introduces the page. Everything below it is the original single-product
 * homepage content, preserved verbatim as historical/company showcase
 * content — see the comment further down for what that section still is.
 */
function CompanyProfile() {
  return (
    <>
      <CompanyHero />
      <OurJourney />
      <MissionVision />
      <CoreValues />
      <Leadership />
      <Infrastructure />
      <Manufacturing />
      <QualityStandards />
      <Certifications />
    </>
  );
}

/**
 * Preserves the original single-product homepage content verbatim, at its own
 * route, as the site transitions to a corporate homepage (see Home.tsx). The
 * live grievance/support form now lives on its own dedicated page (see
 * pages/Support.tsx, via components/home/SupportTicketPanel.tsx) rather than
 * being duplicated here — everything else on this page is unchanged.
 *
 * A corporate company-profile (CompanyProfile, above) now introduces the
 * page. The animated "Trust with Tradition" product hero that used to open
 * this section has moved to the Products page (see components/products/
 * ProductsHero.tsx and pages/Shop.tsx) — its bottle-showcase framing belongs
 * to the product catalogue, not the company profile. The "Power Plus
 * Videos" section (FarmerSuccess) and the "Ready to Transform Your Yield"
 * promotional CTA (previously inside WhyChooseUs) have both been removed
 * from this page as promotional content that doesn't fit an About/company
 * page — FarmerSuccess remains in use on Home.tsx, and WhyChooseUs's
 * feature-card grid remains here, just without its CTA banner.
 */
export default function WhoWeAre() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col relative">
      <CompanyProfile />

      <WhyChooseUs titleLine1={t.benefits_title_line1} titleLine2={t.benefits_title_line2} subtitle={t.benefits_subtitle} />
    </div>
  );
}
