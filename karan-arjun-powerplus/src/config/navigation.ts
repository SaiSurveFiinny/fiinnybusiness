import type { Translations } from '../translations';

export const BRAND_NAME = 'Karan Arjun Pvt. Ltd.';

export interface NavChild {
  labelKey: keyof Translations;
  href: string;
}

export interface NavItem {
  labelKey: keyof Translations;
  href?: string;
  /** Renders as a simple dropdown in DesktopNavItem / MobileNavItem. */
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav_home', href: '/' },
  { labelKey: 'nav_who_we_are', href: '/who-we-are' },
  { labelKey: 'nav_what_we_do', href: '/what-we-do' },
  { labelKey: 'nav_products', href: '/products' },
  { labelKey: 'nav_crop_solutions', href: '/crop-solutions' },
  {
    labelKey: 'nav_research_innovation',
    children: [
      { labelKey: 'nav_research_innovation', href: '/research-innovation' },
      { labelKey: 'nav_resources', href: '/resources' },
    ],
  },
  { labelKey: 'nav_farmer_success', href: '/farmer-success' },
  { labelKey: 'nav_career', href: '/career' },
];
