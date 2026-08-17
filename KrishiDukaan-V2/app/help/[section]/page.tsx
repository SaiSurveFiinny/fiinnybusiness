import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP_SECTIONS } from "../../views/helpContent";
import { HELP_FRAMING } from "../_lib/framing";
import { HelpBlocks, t, sectionText, sectionSteps } from "../_lib/blocks";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 86400;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ section: string }>;
}

export function generateStaticParams() {
  return HELP_SECTIONS.map((s) => ({ section: s.id }));
}

const find = (id: string) => HELP_SECTIONS.find((s) => s.id === id);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section: id } = await params;
  const section = find(id);
  if (!section) return { title: "Help Topic Not Found" };

  const framing = HELP_FRAMING[id];
  const title = framing?.heading ?? t(section.titleKey);
  const description =
    framing?.description ?? sectionText(section, 300) ?? t(section.summaryKey);
  const canonical = `${SITE_URL}/help/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: `${title} | KrishiDukan`,
      description,
      url: canonical,
      images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | KrishiDukan`,
      description,
      images: ["/images/og-default.png"],
    },
  };
}

export default async function HelpSectionPage({ params }: PageProps) {
  const { section: id } = await params;
  const section = find(id);
  if (!section) notFound();

  const framing = HELP_FRAMING[id];
  const heading = framing?.heading ?? t(section.titleKey);
  const canonical = `${SITE_URL}/help/${id}`;
  const steps = sectionSteps(section);

  const idx = HELP_SECTIONS.findIndex((s) => s.id === id);
  const prev = idx > 0 ? HELP_SECTIONS[idx - 1] : null;
  const next = idx < HELP_SECTIONS.length - 1 ? HELP_SECTIONS[idx + 1] : null;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: heading,
    description: framing?.description ?? sectionText(section, 300),
    url: canonical,
    inLanguage: "en-IN",
    isPartOf: {
      "@type": "WebSite",
      name: "KrishiDukan",
      url: SITE_URL,
    },
    publisher: { "@type": "Organization", name: "KrishiDukan", url: SITE_URL },
  };

  // HowTo only where the section genuinely contains an ordered procedure —
  // marking up a prose section as HowTo would be misleading structured data.
  const howToLd =
    steps.length >= 2
      ? {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: heading,
          description: framing?.description ?? sectionText(section, 300),
          step: steps.map((text, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            text,
          })),
        }
      : null;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Help", item: `${SITE_URL}/help` },
      { "@type": "ListItem", position: 3, name: heading },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      {howToLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <Link href="/help" className="hover:text-primary">Help</Link>
          <span>›</span>
          <span className="text-primary">{t(section.titleKey)}</span>
        </nav>

        <header className="border-b border-surface-container pb-6">
          <h1 className="text-2xl font-black leading-tight text-on-surface sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            {t(section.summaryKey)}
          </p>
        </header>

        <article className="mt-8">
          <HelpBlocks section={section} />
        </article>

        {/* Prev / next keeps all 21 pages linked to each other. */}
        <nav className="mt-12 grid gap-3 border-t border-surface-container pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/help/${prev.id}`}
              className="rounded-2xl border border-surface-container bg-white p-4 transition-colors hover:border-primary"
            >
              <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Previous
              </span>
              <p className="mt-1 text-sm font-bold text-on-surface">
                {HELP_FRAMING[prev.id]?.heading ?? t(prev.titleKey)}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/help/${next.id}`}
              className="rounded-2xl border border-surface-container bg-white p-4 text-right transition-colors hover:border-primary sm:text-right"
            >
              <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                Next
              </span>
              <p className="mt-1 text-sm font-bold text-on-surface">
                {HELP_FRAMING[next.id]?.heading ?? t(next.titleKey)}
              </p>
            </Link>
          ) : null}
        </nav>

        <section className="mt-10 rounded-2xl border border-surface-container bg-surface-container-low p-6">
          <h2 className="text-base font-black text-on-surface">
            Ready to list your products?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            0% commission on every sale — you pay ₹21 per product listing.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/sell"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Start selling →
            </Link>
            <Link
              href="/help"
              className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-6 py-3 text-sm font-bold text-on-surface transition-colors hover:border-primary"
            >
              All help topics
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
