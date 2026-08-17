import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getStoresInCity,
  getStoreGeography,
  buildStoreSlug,
  slugifyGeo,
  type SeoStore,
} from "../../../lib/seo/stores-server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ state: string; city: string }>;
}

export async function generateStaticParams() {
  const geo = await getStoreGeography();
  return geo.flatMap((st) =>
    st.cities.map((c) => ({ state: st.stateSlug, city: c.citySlug })),
  );
}

const storeUrl = (s: SeoStore) =>
  `/stores/${slugifyGeo(s.state)}/${slugifyGeo(s.city)}/${buildStoreSlug(s.name, s.id)}`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state, city } = await params;
  const stores = await getStoresInCity(state, city);
  if (!stores.length) return { title: "City Not Found" };

  const { city: cityName, state: stateName } = stores[0]!;
  const n = stores.length;
  const title = `Agricultural Shops & Dealers in ${cityName}, ${stateName}`;
  const description =
    `${n} verified agricultural ${n === 1 ? "shop" : "shops"} in ${cityName}, ${stateName}. ` +
    `Find pesticide, fertilizer and seed dealers near you — addresses, phone numbers ` +
    `and directions on KrishiDukan.`;
  const canonical = `${SITE_URL}/stores/${state}/${city}`;

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

export default async function CityStoresPage({ params }: PageProps) {
  const { state, city } = await params;
  const stores = await getStoresInCity(state, city);
  if (!stores.length) notFound();

  const { city: cityName, state: stateName } = stores[0]!;

  // Nearby cities in the same state — real internal links that give a
  // single-store city page somewhere useful to send a visitor.
  const geo = await getStoreGeography();
  const thisState = geo.find((s) => s.stateSlug === state);
  const nearby = (thisState?.cities ?? [])
    .filter((c) => c.citySlug !== city)
    .slice(0, 12);

  const canonical = `${SITE_URL}/stores/${state}/${city}`;

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Agricultural shops in ${cityName}, ${stateName}`,
    numberOfItems: stores.length,
    itemListElement: stores.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Store",
        name: s.name,
        url: `${SITE_URL}${storeUrl(s)}`,
        address: {
          "@type": "PostalAddress",
          ...(s.line1 ? { streetAddress: s.line1 } : {}),
          addressLocality: s.city,
          addressRegion: s.state,
          ...(s.pincode ? { postalCode: s.pincode } : {}),
          addressCountry: "IN",
        },
        ...(s.lat && s.lng
          ? { geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng } }
          : {}),
        ...(s.phone ? { telephone: s.phone } : {}),
      },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Stores", item: `${SITE_URL}/stores` },
      {
        "@type": "ListItem",
        position: 3,
        name: stateName,
        item: `${SITE_URL}/stores/${state}`,
      },
      { "@type": "ListItem", position: 4, name: cityName },
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
          className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <Link href="/stores" className="hover:text-primary">Stores</Link>
          <span>›</span>
          <Link href={`/stores/${state}`} className="hover:text-primary">{stateName}</Link>
          <span>›</span>
          <span className="text-primary">{cityName}</span>
        </nav>

        <header>
          <h1 className="text-2xl font-black leading-tight text-on-surface sm:text-3xl">
            Agricultural shops and dealers in {cityName}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            {stores.length} verified agricultural {stores.length === 1 ? "shop" : "shops"} in{" "}
            {cityName}, {stateName} selling seeds, fertilizers, pesticides, herbicides
            and farming tools. Tap any shop for its address, phone number and
            directions.
          </p>
        </header>

        <section className="mt-8">
          <ul className="grid gap-3 sm:grid-cols-2">
            {stores.map((s) => (
              <li key={s.id}>
                <Link
                  href={storeUrl(s)}
                  className="flex h-full flex-col rounded-2xl border border-surface-container bg-white p-5 transition-colors hover:border-primary"
                >
                  <span className="inline-block w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                    {s.role === "manufacturer" ? "Manufacturer" : "Retailer"}
                  </span>
                  <p className="mt-2 text-sm font-black text-on-surface">{s.name}</p>
                  {s.line1 ? (
                    <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                      {s.line1}
                    </p>
                  ) : null}
                  {s.ownerName ? (
                    <p className="mt-auto pt-2 text-xs text-on-surface-variant">
                      {s.ownerName}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {nearby.length > 0 ? (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-black text-on-surface">
              Agricultural shops in nearby cities
            </h2>
            <div className="flex flex-wrap gap-2">
              {nearby.map((c) => (
                <Link
                  key={c.citySlug}
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

        <section className="mt-12 rounded-2xl border border-surface-container bg-surface-container-low p-6">
          <h2 className="text-base font-black text-on-surface">
            Run an agricultural shop in {cityName}?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            Add your store so farmers searching in {cityName} can find you. 0%
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
