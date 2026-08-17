import type { Metadata } from "next";
import Link from "next/link";
import { getStoreGeography, getAllStores } from "../lib/seo/stores-server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const stores = await getAllStores();
  const title = "Agricultural Shops & Dealers Near You — Store Directory";
  const description =
    `Find verified agricultural shops, Krishi Seva Kendras and agri-input dealers ` +
    `across India. ${stores.length} stores listed with addresses, phone numbers and ` +
    `directions. Browse by state and city on KrishiDukan.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/stores` },
    openGraph: {
      type: "website",
      title: `${title} | KrishiDukan`,
      description,
      url: `${SITE_URL}/stores`,
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

export default async function StoresIndexPage() {
  const [geo, stores] = await Promise.all([getStoreGeography(), getAllStores()]);

  // The cities worth surfacing on the index — most stores first.
  const topCities = geo
    .flatMap((s) => s.cities)
    .sort((a, b) => b.count - a.count)
    .slice(0, 18);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Stores" },
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
          className="mb-6 flex items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <span className="text-primary">Stores</span>
        </nav>

        <header>
          <h1 className="text-2xl font-black leading-tight text-on-surface sm:text-3xl">
            Agricultural shops and dealers near you
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            {stores.length} verified agricultural shops, Krishi Seva Kendras and
            agri-input dealers listed on KrishiDukan — with addresses, phone numbers
            and directions. Browse by state and city to find a seed, fertilizer or
            pesticide dealer near you.
          </p>
        </header>

        {topCities.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-black text-on-surface">
              Cities with the most shops
            </h2>
            <div className="flex flex-wrap gap-2">
              {topCities.map((c) => (
                <Link
                  key={`${c.stateSlug}-${c.citySlug}`}
                  href={`/stores/${c.stateSlug}/${c.citySlug}`}
                  className="rounded-full border border-surface-container bg-white px-4 py-2 text-xs font-bold text-on-surface transition-colors hover:border-primary"
                >
                  {c.city}
                  <span className="ml-1.5 text-on-surface-variant">{c.count}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-black text-on-surface">Browse by state</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {geo.map((s) => (
              <li key={s.stateSlug}>
                <Link
                  href={`/stores/${s.stateSlug}`}
                  className="block rounded-2xl border border-surface-container bg-white p-5 transition-colors hover:border-primary"
                >
                  <p className="text-sm font-black text-on-surface">{s.state}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {s.count} {s.count === 1 ? "shop" : "shops"} · {s.cities.length}{" "}
                    {s.cities.length === 1 ? "city" : "cities"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-2xl border border-surface-container bg-surface-container-low p-6">
          <h2 className="text-base font-black text-on-surface">
            Run an agricultural shop?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            Add your store to this directory so farmers nearby can find you. 0%
            commission on every sale — you pay ₹21 per product listing.
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
