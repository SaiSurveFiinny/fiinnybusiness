/**
 * Search-intent framing for the documentation sections.
 *
 * WHY THIS EXISTS
 * ---------------
 * The docs in app/views/helpContent.ts are written as an internal functional
 * reference — the hero reads "KrishiDukan Portal — Complete Functional Flow" and
 * sections are named things like "Product Creation" and "Assignment". That is
 * correct, deliberate technical writing and it is NOT changed here.
 *
 * But nobody searches for "complete functional flow". They search "how to add
 * products on an agri marketplace" or "how to register as a retailer online".
 *
 * So this map supplies the <title>, meta description and H1 for each section —
 * the parts Google reads and shows in a result — while the body renders the
 * original copy verbatim. Search framing on the outside, the team's
 * documentation on the inside. Nothing is rewritten or deleted.
 *
 * Sections not listed here still get a page; they just fall back to the
 * section's own titleKey/summaryKey.
 */

export interface Framing {
  /** Search-intent H1 and <title>. */
  heading: string;
  /** Meta description. Falls back to the section's own prose when omitted. */
  description?: string;
  /** Shown on the /help index card. */
  blurb?: string;
}

export const HELP_FRAMING: Record<string, Framing> = {
  overview: {
    heading: "What is KrishiDukan and how does it work?",
    description:
      "KrishiDukan connects Indian farmers with verified agri-input retailers and manufacturers. Here is how the marketplace works for each of them.",
    blurb: "How the marketplace works, end to end",
  },
  entry: {
    heading: "Getting started on KrishiDukan",
    description:
      "Where to begin on KrishiDukan — the home, market, crop hubs and store locator, and what each one is for.",
    blurb: "Where to begin",
  },
  public: {
    heading: "How farmers browse products, crop hubs and nearby stores",
    description:
      "How a farmer finds agricultural products, compares nearby sellers and locates an agri shop on KrishiDukan — no account needed.",
    blurb: "Browsing without an account",
  },
  auth: {
    heading: "How to register on KrishiDukan",
    description:
      "Step-by-step registration on KrishiDukan for farmers, retailers and manufacturers — phone number sign-up, choosing your role, and what happens next.",
    blurb: "Creating your account",
  },
  subscription: {
    heading: "KrishiDukan subscription plans and what they include",
    description:
      "What a KrishiDukan listing subscription covers for retailers and manufacturers, how listings are counted, and how billing works.",
    blurb: "Plans and listings",
  },
  account: {
    heading: "Managing your KrishiDukan account",
    description:
      "How to manage your KrishiDukan account details, role and access after signing up.",
    blurb: "Account basics",
  },
  dashboard: {
    heading: "Using the KrishiDukan seller dashboard",
    description:
      "A tour of the KrishiDukan seller dashboard — where to find inventory, orders, reels, analytics and payouts.",
    blurb: "Your seller dashboard",
  },
  modules: {
    heading: "Every feature in the KrishiDukan dashboard",
    description:
      "The full set of KrishiDukan dashboard modules available to retailers and manufacturers, and what each one does.",
    blurb: "All dashboard modules",
  },
  "product-creation": {
    heading: "How to add products on KrishiDukan",
    description:
      "How to create a product listing on KrishiDukan — product details, pack sizes, pricing and images — so farmers can find and buy it.",
    blurb: "Adding your products",
  },
  "retailer-network": {
    heading: "How manufacturers build a retailer network",
    description:
      "How an agri-input manufacturer connects with retailers on KrishiDukan and grows distribution without depending on traditional distributors.",
    blurb: "Building distribution",
  },
  "retailer-onboarding": {
    heading: "How to onboard retailers to your network",
    description:
      "The retailer onboarding flow on KrishiDukan — adding a retailer, what they receive, and how their store goes live.",
    blurb: "Onboarding retailers",
  },
  invite: {
    heading: "How to invite a retailer to KrishiDukan",
    description:
      "How manufacturers send retailer invites on KrishiDukan, what the retailer sees, and how an invite becomes an active store.",
    blurb: "Sending invites",
  },
  assignment: {
    heading: "How to assign products to your retailers",
    description:
      "How manufacturers assign products to retailers on KrishiDukan so a retailer's shop carries the right catalogue.",
    blurb: "Assigning products",
  },
  "retailer-details": {
    heading: "Managing retailer details and status",
    description:
      "How to view and manage a retailer's details, status and catalogue inside your KrishiDukan manufacturer network.",
    blurb: "Managing retailers",
  },
  "subscription-mgmt": {
    heading: "Managing retailer subscriptions and listings",
    description:
      "How listing seats and subscriptions are managed across a manufacturer's retailer network on KrishiDukan.",
    blurb: "Seats and renewals",
  },
  listing: {
    heading: "How to list products so farmers actually find them",
    description:
      "What makes a good product listing on KrishiDukan — details, images and pricing that help nearby farmers discover and trust your products.",
    blurb: "Better listings",
  },
  orders: {
    heading: "How to manage orders on KrishiDukan",
    description:
      "How orders reach a seller on KrishiDukan, how to accept and fulfil them, and how invoices and payouts work.",
    blurb: "Handling orders",
  },
  reviews: {
    heading: "How product and store reviews work",
    description:
      "How farmers leave product and store reviews on KrishiDukan, and how sellers see and respond to them.",
    blurb: "Reviews and ratings",
  },
  "profile-settings": {
    heading: "How to set up your store profile",
    description:
      "How to complete your KrishiDukan store profile — shop name, address, delivery settings and contact details — so farmers nearby can find you.",
    blurb: "Your store profile",
  },
  settings: {
    heading: "KrishiDukan account settings",
    description:
      "Language, notifications and other account settings available on KrishiDukan.",
    blurb: "Settings",
  },
  architecture: {
    heading: "How the KrishiDukan platform is put together",
    description:
      "A layer-by-layer view of the KrishiDukan agriculture commerce platform, from public browsing through to seller dashboards.",
    blurb: "Platform architecture",
  },
};
