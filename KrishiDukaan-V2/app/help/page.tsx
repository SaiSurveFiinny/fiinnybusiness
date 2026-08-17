import type { Metadata } from "next";
import Link from "next/link";
import { HELP_SECTIONS } from "../views/helpContent";
import { HELP_FRAMING } from "./_lib/framing";
import { t } from "./_lib/blocks";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 86400;

const TITLE = "How to Use KrishiDukan — Help & Seller Guides";
const DESCRIPTION =
  "Complete guides to KrishiDukan: how to register, add products, set up your store, " +
  "invite retailers, manage orders and get discovered by nearby farmers. Free to read, " +
  "no account needed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/help` },
  openGraph: {
    type: "website",
    title: `${TITLE} | KrishiDukan`,
    description: DESCRIPTION,
    url: `${SITE_URL}/help`,
    images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | KrishiDukan`,
    description: DESCRIPTION,
    images: ["/images/og-default.png"],
  },
};

/** Grouped so the index reads as a journey rather than 21 undifferentiated links. */
const GROUPS: { title: string; blurb: string; ids: string[] }[] = [
  {
    title: "Getting started",
    blurb: "What KrishiDukan is, and how to create your account.",
    ids: ["overview", "entry", "public", "auth", "account"],
  },
  {
    title: "For retailers and manufacturers",
    blurb: "Setting up your store, adding products and getting found by farmers.",
    ids: [
      "subscription",
      "dashboard",
      "modules",
      "product-creation",
      "listing",
      "profile-settings",
    ],
  },
  {
    title: "Building a retailer network",
    blurb: "For manufacturers growing distribution across a region.",
    ids: [
      "retailer-network",
      "retailer-onboarding",
      "invite",
      "assignment",
      "retailer-details",
      "subscription-mgmt",
    ],
  },
  {
    title: "Running your shop",
    blurb: "Orders, reviews and day-to-day settings.",
    ids: ["orders", "reviews", "settings", "architecture"],
  },
];

export default function HelpIndexPage() {
  const byId = new Map(HELP_SECTIONS.map((s) => [s.id, s]));

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "KrishiDukan help topics",
    numberOfItems: HELP_SECTIONS.length,
    itemListElement: HELP_SECTIONS.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: HELP_FRAMING[s.id]?.heading ?? t(s.titleKey),
      url: `${SITE_URL}/help/${s.id}`,
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Help" },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <span className="text-primary">Help</span>
        </nav>

        <header>
          <h1 className="text-2xl font-black leading-tight text-on-surface sm:text-3xl">
            How to use KrishiDukan
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Everything you need to register, set up your shop, add products and start
            receiving enquiries from farmers nearby — {HELP_SECTIONS.length} guides,
            free to read, no account needed.
          </p>
        </header>

        {GROUPS.map((group) => {
          const sections = group.ids
            .map((id) => byId.get(id))
            .filter((s): s is NonNullable<typeof s> => Boolean(s));
          if (!sections.length) return null;

          return (
            <section key={group.title} className="mt-10">
              <h2 className="text-lg font-black text-on-surface">{group.title}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">{group.blurb}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {sections.map((s) => {
                  const f = HELP_FRAMING[s.id];
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/help/${s.id}`}
                        className="flex h-full flex-col rounded-2xl border border-surface-container bg-white p-5 transition-colors hover:border-primary"
                      >
                        <p className="text-sm font-black text-on-surface">
                          {f?.heading ?? t(s.titleKey)}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant">
                          {f?.blurb ?? t(s.summaryKey)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <section className="mt-12 rounded-2xl border border-surface-container bg-surface-container-low p-6">
          <h2 className="text-base font-black text-on-surface">
            Ready to start selling?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            List your products on KrishiDukan with 0% commission — you pay ₹21 per
            product listing, and nothing on what you sell.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/sell"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              See seller pricing →
            </Link>
            <Link
              href="/stores"
              className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-6 py-3 text-sm font-bold text-on-surface transition-colors hover:border-primary"
            >
              Browse the store directory
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
