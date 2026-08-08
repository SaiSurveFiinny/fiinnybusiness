import { AgriculturalInnovation } from '../components/whatwedo/AgriculturalInnovation';
import { AreasOfExpertise } from '../components/whatwedo/AreasOfExpertise';
import { ExpertiseOverview } from '../components/whatwedo/ExpertiseOverview';
import { FarmerFieldSupport } from '../components/whatwedo/FarmerFieldSupport';
import { HowWeWork } from '../components/whatwedo/HowWeWork';
import { SustainableFarming } from '../components/whatwedo/SustainableFarming';
import { TechnologyDigitalAgriculture } from '../components/whatwedo/TechnologyDigitalAgriculture';
import { WhatWeDoCTA } from '../components/whatwedo/WhatWeDoCTA';
import { WhatWeDoHero } from '../components/whatwedo/WhatWeDoHero';

/**
 * "What We Do" — communicates the company's capabilities, expertise, and
 * working approach (not a product catalog; products live at /products). Each
 * section uses a distinct layout (split image/content, alternating rows,
 * horizontal process, full-bleed banner) with alternating light/dark
 * backgrounds so the page reads as an editorial capability profile rather
 * than a repeated card-grid template, consistent with the direction set on
 * Home.tsx and WhoWeAre.tsx.
 */
export default function WhatWeDo() {
  return (
    <div className="flex flex-col relative">
      <WhatWeDoHero />
      <ExpertiseOverview />
      <AreasOfExpertise />
      <HowWeWork />
      <AgriculturalInnovation />
      <FarmerFieldSupport />
      <SustainableFarming />
      <TechnologyDigitalAgriculture />
      <WhatWeDoCTA />
    </div>
  );
}
