import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreGeography } from "../../lib/seo/stores-server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ state: string }>;
}

export async function generateStaticParams() {
  const geo = await getStoreGeography();
  return geo.map((s) => ({ state: s.stateSlug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state } = await params;
  const geo = await getStoreGeography();
  const entry = geo.find((s) => s.stateSlug === state);
  if (!entry) return { title: "State Not Found" };

  const title = `Agricultural Shops & Dealers in ${entry.state}`;
  const description =
    `${entry.count} verified agricultural shops across ${entry.cities.length} cities in ` +
    `${entry.state}. Find seed, fertilizer and pesticide dealers near you — addresses, ` +
    `phone numbers and directions on KrishiDukan.`;
  const canonical = `${SITE_URL}/stores/${state}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
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

export default async function StateStoresPage({ params }: PageProps) {
  const { state } = await params;
  const geo = await getStoreGeography();
  const entry = geo.find((s) => s.stateSlug === state);
  if (!entry) notFound();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Stores", item: `${SITE_URL}/stores` },
      { "@type": "ListItem", position: 3, name: entry.state },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <Link href="/stores" className="hover:text-primary">Stores</Link>
          <span>›</span>
          <span className="text-primary">{entry.state}</span>
        </nav>

        <header>
          <h1 className="text-2xl font-black leading-tight text-on-surface sm:text-3xl">
            Agricultural shops and dealers in {entry.state}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            {entry.count} verified agricultural shops across {entry.cities.length}{" "}
            {entry.cities.length === 1 ? "city" : "cities"} in {entry.state}. Pick a
            city to see shop addresses, phone numbers and directions.
          </p>
        </header>

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-black text-on-surface">
            Cities in {entry.state}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {entry.cities.map((c) => (
              <li key={c.citySlug}>
                <Link
                  href={`/stores/${c.stateSlug}/${c.citySlug}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-surface-container bg-white px-4 py-3 transition-colors hover:border-primary"
                >
                  <span className="text-sm font-bold text-on-surface">{c.city}</span>
                  <span className="text-xs font-black text-on-surface-variant">
                    {c.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-2xl border border-surface-container bg-surface-container-low p-6">
          <h2 className="text-base font-black text-on-surface">
            Run an agricultural shop in {entry.state}?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            List your store so farmers nearby can find you. 0% commission on every
            sale — you pay ₹21 per product listing.
          </p>
          <Link
            href="/sell"
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            List your store →
          </Link>
        </section>
      </div>
    </main>
  );
}
