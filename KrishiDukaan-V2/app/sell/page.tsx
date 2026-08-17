import type { Metadata } from "next";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore/lite";
import { PLAY_STORE_URL } from "../lib/store-links";
import { getClientDb } from "../lib/firebase-client-server";
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  parseDurations,
  perMonthLabel,
} from "../lib/pricing";

/**
 * Public, indexable seller-acquisition page.
 *
 * Every other seller surface (/dashboard/upgrade, /dashboard/subscription) is
 * auth-gated AND Disallow'd in robots.ts, so nothing on the site answered the
 * seller-intent query "where can I sell agri products online and what does it
 * cost". This page is the crawlable answer, and it states the real numbers in
 * plain text so search engines and AI answer engines can quote them.
 *
 * EVERY price on this page is derived from settings/pricing (app/lib/pricing.ts)
 * — the same document api/payment/create-order uses to price the charge. Nothing
 * here is hardcoded, so the advertised price cannot drift from the billed one.
 *
 * The 0% commission claim is enforced in app/api/payment/fee/route.ts, which
 * returns platformFee: 0 unconditionally. If that changes, change this page.
 */
export const revalidate = 86400;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export async function generateMetadata(): Promise<Metadata> {
  const plans = await loadPlans();
  const { entry, best } = headline(plans);

  // `absolute` bypasses the "%s | KrishiDukan" template in app/layout.tsx — the
  // brand is already in the title, and the template pushed it past 100 chars.
  const TITLE = `Sell on KrishiDukan — 0% Commission, ₹${entry.price} per Product Listing`;
  const DESCRIPTION =
    `Sell seeds, fertilizers, pesticides and farming tools online on KrishiDukan. ` +
    `Zero commission on every sale — you keep 100% of your price. Listings start at ` +
    `₹${entry.price} per product per ${entry.months === 1 ? "month" : `${entry.months} months`}, ` +
    `or ₹${best.price} per product for ${best.label.toLowerCase()}. Open to retailers, ` +
    `manufacturers and agri-input dealers across India.`;

  return {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "sell agri products online",
    "sell pesticides online India",
    "sell fertilizers online",
    "sell seeds online India",
    "agri marketplace seller",
    "zero commission marketplace",
    "agri seller platform India",
    "list products KrishiDukan",
    "agri dealer online selling",
    "farm input seller account",
  ],
  alternates: { canonical: "/sell" },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}/sell`,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Sell on KrishiDukan — 0% Commission, ₹${entry.price} per Listing`,
    description: DESCRIPTION,
    images: ["/images/og-default.png"],
  },
  };
}

// ─── Pricing ────────────────────────────────────────────────────────────────
// Read from settings/pricing, the SAME document api/payment/create-order prices
// the charge from. This page used to carry its own hardcoded copy, which meant
// the public marketing price could silently drift from the amount actually
// billed. Falls back to DEFAULT_DURATIONS when the doc is missing.

type Plan = {
  label: string;
  months: number;
  price: number;
  perMonth: string;
  badge?: string;
};

function planLabel(months: number): string {
  if (months === 12) return "1 Year";
  if (months % 12 === 0) return `${months / 12} Years`;
  return months === 1 ? "1 Month" : `${months} Months`;
}

async function loadPlans(): Promise<Plan[]> {
  let durations = DEFAULT_DURATIONS;
  try {
    const snap = await getDoc(
      doc(getClientDb(), PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc),
    );
    if (snap.exists()) durations = parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch (err) {
    console.warn("[/sell] pricing read failed, using defaults:", err);
  }
  return durations.map((d) => ({
    label: planLabel(d.months),
    months: d.months,
    price: d.pricePerSeat,
    perMonth: perMonthLabel(d),
    ...(d.badge ? { badge: d.badge } : {}),
  }));
}

/**
 * The two plans the prose talks about: the cheapest way in, and the best
 * per-month rate. Derived rather than named so the copy still makes sense if an
 * admin adds, removes or reorders a duration.
 */
function headline(plans: Plan[]) {
  const entry = plans[0]!;
  const best = plans.reduce((a, b) =>
    b.price / b.months < a.price / a.months ? b : a,
  );
  return { entry, best, bestPerMonth: Math.round(best.price / best.months) };
}

const INCLUDED: { title: string; body: string }[] = [
  {
    title: "0% commission, always",
    body: "KrishiDukan takes no cut of your sale price. A ₹1,000 order is ₹1,000 to you — we do not deduct a marketplace commission, ever.",
  },
  {
    title: "Farmers nearby find you",
    body: "Your products surface to farmers searching in your area, on both the website and the mobile app, with directions to your store.",
  },
  {
    title: "Direct WhatsApp enquiries",
    body: "Farmers and retailers contact you directly. No middleman sits between you and your buyer, and no lead fee is charged.",
  },
  {
    title: "AgriReels product videos",
    body: "Post short videos showing your products in use. Reels get their own indexed pages, bringing search traffic to your listings.",
  },
  {
    title: "Full seller dashboard",
    body: "Manage inventory, prices, discounts, delivery charges and orders. Generate GST invoices and track payouts in one place.",
  },
  {
    title: "Bulk enquiries for manufacturers",
    body: "Manufacturers get discovered by retailers across the region and can build distribution without depending on traditional distributors.",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Create your seller account",
    body: "Sign up with your phone number and pick your role — retailer, manufacturer or agri-input dealer.",
  },
  {
    title: "Add your business details",
    body: "Add your store name, address and the licences you trade under, so buyers can see you are a verified seller.",
  },
  {
    title: "List your products",
    body: "Add each product with pack sizes, prices and photos. You pay only for the number of products you choose to list.",
  },
  {
    title: "Start receiving orders",
    body: "Farmers nearby discover your listings, order or send a direct enquiry, and you fulfil from your existing stock.",
  },
];

/**
 * FAQ copy is generated from the live ladder. These answers state exact rupee
 * figures and are the text AI answer engines are most likely to quote, so they
 * must never outlive a price change.
 */
function buildFaqs(plans: Plan[]): { q: string; a: string }[] {
  const { entry, best, bestPerMonth } = headline(plans);
  const ladder = plans
    .map((p) => `₹${p.price} per listing for ${p.label.toLowerCase()}`)
    .join(", ");

  return [
  {
    q: "How much does it cost to sell on KrishiDukan?",
    a:
      `${ladder}. The ${best.label.toLowerCase()} plan works out to about ₹${bestPerMonth} per month. ` +
      `You pay only for the number of products you list, so a seller listing 10 products on the ` +
      `${best.label.toLowerCase()} plan pays ₹${best.price * 10} in total.`,
  },
  {
    q: "Does KrishiDukan charge a commission on sales?",
    a: "No. KrishiDukan charges 0% commission. Unlike agri marketplaces that take 5% to 25% of every transaction, we take nothing from your sale price — you keep 100% of what the buyer pays you. The listing fee is the only charge KrishiDukan bills you.",
  },
  {
    q: "Are there any other deductions on an online payment?",
    a: "KrishiDukan deducts nothing. When a buyer pays online, the payment gateway (Razorpay) charges its own standard processing fee on the transaction, which is shown to you transparently on each order in your dashboard. That fee goes to the gateway, not to KrishiDukan. Orders paid by cash on delivery have no deduction at all.",
  },
  {
    q: "Who can sell on KrishiDukan?",
    a: "Agri-input retailers, manufacturers and dealers in India. You must hold the licences required for what you sell — a CIB & RC registration for pesticides and insecticides, and a fertilizer licence for fertilizers, as required under Indian law. Seeds, tools, sprayers and equipment have their own applicable requirements.",
  },
  {
    q: "Do I need a licence to sell pesticides or fertilizers online?",
    a: "Yes. Selling agrochemicals in India requires valid distribution licences regardless of whether you sell in a shop or online. KrishiDukan is a marketplace for licensed sellers — you continue to trade under your existing licence, and you remain the seller of record on every order.",
  },
  {
    q: "How do I get paid?",
    a: "Online payments settle to your registered account through the payment gateway, and cash-on-delivery orders are collected by you directly. Your payouts and the gateway fee on each order are visible in the payouts section of your seller dashboard.",
  },
  {
    q: "Can I try it with just one product?",
    a: `Yes. There is no minimum. You can list a single product for ₹${entry.price} for ${entry.label.toLowerCase()}, see the enquiries it brings, and add more listings whenever you want.`,
  },
  ];
}

export default async function SellPage() {
  const PLANS = await loadPlans();
  const FAQS = buildFaqs(PLANS);
  const { entry, best, bestPerMonth } = headline(PLANS);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "KrishiDukan Seller Platform",
    serviceType: "Online agri-input marketplace for sellers",
    url: `${SITE_URL}/sell`,
    areaServed: { "@type": "Country", name: "India" },
    provider: {
      "@type": "Organization",
      name: "KrishiDukan",
      url: SITE_URL,
    },
    description:
      `List seeds, fertilizers, pesticides and farming tools on KrishiDukan with zero sales commission. Sellers pay a per-product listing fee starting at ₹${entry.price} per ${entry.months === 1 ? "month" : `${entry.months} months`}.`,
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: `${p.label} product listing`,
      price: String(p.price),
      priceCurrency: "INR",
      description: `₹${p.price} per product listing for ${p.months} month${p.months === 1 ? "" : "s"} (${p.perMonth}). 0% sales commission.`,
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Sell on KrishiDukan" },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant mb-10"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          <span className="text-primary">Sell on KrishiDukan</span>
        </nav>

        {/* Hero */}
        <section className="text-center max-w-3xl mx-auto">
          <p className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-primary">
            For retailers, manufacturers &amp; dealers
          </p>
          <h1 className="mt-6 text-3xl sm:text-4xl font-black text-on-surface leading-tight">
            Sell your agri products online — with 0% commission
          </h1>
          <p className="mt-5 text-base text-on-surface-variant leading-relaxed">
            List seeds, fertilizers, pesticides, herbicides, sprayers and farming
            tools on KrishiDukan and reach farmers across your region. We do not
            take a cut of your sales. You pay{" "}
            <strong className="text-on-surface">
              ₹{entry.price} per product listing
            </strong>{" "}
            per {entry.months === 1 ? "month" : `${entry.months} months`} — and
            nothing else.
          </p>

          {/* Headline numbers */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-surface-container bg-white p-5">
              <p className="text-3xl font-black text-primary">0%</p>
              <p className="mt-1 text-sm font-bold text-on-surface">
                Commission on sales
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                You keep 100% of your price
              </p>
            </div>
            <div className="rounded-2xl border border-surface-container bg-white p-5">
              <p className="text-3xl font-black text-primary">₹{entry.price}</p>
              <p className="mt-1 text-sm font-bold text-on-surface">
                Per product, per{" "}
                {entry.months === 1 ? "month" : `${entry.months} months`}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                As low as ₹{bestPerMonth} on the {best.label.toLowerCase()} plan
              </p>
            </div>
            <div className="rounded-2xl border border-surface-container bg-white p-5">
              <p className="text-3xl font-black text-primary">₹0</p>
              <p className="mt-1 text-sm font-bold text-on-surface">
                Setup &amp; joining fee
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                No monthly platform subscription
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/?view=signup"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-7 py-3.5 font-bold text-white hover:opacity-90 transition-opacity text-sm"
            >
              Start selling on KrishiDukan →
            </Link>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-7 py-3.5 font-bold text-on-surface hover:border-primary transition-colors text-sm"
            >
              Get the seller app
            </a>
          </div>
        </section>

        {/* Pricing */}
        <section className="mt-20" id="pricing">
          <h2 className="text-2xl font-black text-on-surface text-center">
            Seller pricing
          </h2>
          <p className="mt-3 text-sm text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            You pay per product you list, for as long as you want it listed.
            Longer plans cost less per month. There is no minimum — list one
            product or a thousand.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((p) => (
              <div
                key={p.label}
                className={`rounded-2xl border bg-white p-5 flex flex-col ${
                  p.badge === "Best Value"
                    ? "border-primary ring-1 ring-primary"
                    : "border-surface-container"
                }`}
              >
                <div className="flex items-center justify-between gap-2 min-h-[24px]">
                  <p className="text-sm font-black text-on-surface">{p.label}</p>
                  {p.badge ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                      {p.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-3xl font-black text-on-surface">
                  ₹{p.price}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  per product listing
                </p>
                <p className="mt-3 text-sm font-bold text-primary">
                  {p.perMonth}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Example: listing{" "}
            <strong className="text-on-surface">
              10 products on the {best.label.toLowerCase()} plan
            </strong>{" "}
            costs ₹{(best.price * 10).toLocaleString("en-IN")} in total — and every
            sale you make on top of that is commission-free.
          </p>
        </section>

        {/* Comparison */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center">
            Why sellers choose KrishiDukan
          </h2>
          <p className="mt-3 text-sm text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            Most agri marketplaces earn from a percentage of every sale, so the
            more you sell, the more you pay. KrishiDukan charges a flat listing
            fee instead — your cost stays the same whether you sell ₹10,000 or
            ₹10 lakh.
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-container">
                  <th className="py-3 px-4 text-left font-black text-on-surface">
                    On a ₹1,00,000 month of sales
                  </th>
                  <th className="py-3 px-4 text-left font-black text-on-surface">
                    Typical commission marketplace
                  </th>
                  <th className="py-3 px-4 text-left font-black text-primary">
                    KrishiDukan
                  </th>
                </tr>
              </thead>
              <tbody className="text-on-surface-variant">
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Commission taken
                  </td>
                  <td className="py-3 px-4">5% – 25% of every sale</td>
                  <td className="py-3 px-4 font-bold text-primary">₹0 (0%)</td>
                </tr>
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Platform subscription
                  </td>
                  <td className="py-3 px-4">Often ₹2,000 – ₹3,500 per month</td>
                  <td className="py-3 px-4 font-bold text-primary">₹0</td>
                </tr>
                <tr className="border-b border-surface-container">
                  <td className="py-3 px-4 font-bold text-on-surface">
                    Cost to list 10 products
                  </td>
                  <td className="py-3 px-4">Usually bundled into the above</td>
                  <td className="py-3 px-4 font-bold text-primary">
                    ₹{entry.price * 10} per{" "}
                    {entry.months === 1 ? "month" : `${entry.months} months`}, or ₹
                    {bestPerMonth * 10} per month on the {best.label.toLowerCase()}{" "}
                    plan
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-bold text-on-surface">
                    You keep
                  </td>
                  <td className="py-3 px-4">₹75,000 – ₹95,000</td>
                  <td className="py-3 px-4 font-bold text-primary">
                    ₹1,00,000 minus your listing fee
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-on-surface-variant text-center max-w-2xl mx-auto leading-relaxed">
            Commission and subscription ranges shown for comparison are typical
            published rates across Indian agri marketplaces and vary by platform
            and product category. Check each platform&apos;s current terms.
            KrishiDukan&apos;s own rates are exactly as listed above.
          </p>
        </section>

        {/* What's included */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center mb-8">
            What your listing includes
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INCLUDED.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-surface-container bg-white p-5"
              >
                <h3 className="text-sm font-black text-on-surface mb-1.5">
                  {f.title}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How to start */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center mb-8">
            How to start selling
          </h2>
          <ol className="grid sm:grid-cols-2 gap-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="rounded-2xl border border-surface-container bg-surface-container-low p-5 flex gap-4"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white font-black text-sm flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-black text-on-surface mb-1">
                    {s.title}
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Eligibility / licences */}
        <section className="mt-20 rounded-2xl border border-surface-container bg-surface-container-low p-6 sm:p-8">
          <h2 className="text-xl font-black text-on-surface mb-3">
            Who can sell, and what licences you need
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            KrishiDukan is open to agri-input retailers, manufacturers and
            dealers across India. Agrochemicals are regulated: selling
            pesticides and insecticides requires a valid CIB &amp; RC
            registration, and selling fertilizers requires a fertilizer licence,
            under the Insecticides Act and the Fertilizer (Control) Order
            respectively. These rules apply to online and offline sales alike.
          </p>
          <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
            You continue to trade under your own licence and remain the seller of
            record on every order. KrishiDukan is the marketplace that connects
            you to buyers — it does not sell on your behalf, and it does not take
            a share of your sale.
          </p>
        </section>

        {/* FAQ */}
        <section className="mt-20">
          <h2 className="text-2xl font-black text-on-surface text-center mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-surface-container bg-white p-5"
              >
                <summary className="cursor-pointer list-none text-sm font-black text-on-surface flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-primary text-lg leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-20 mb-8 rounded-2xl bg-primary px-6 py-10 sm:px-10 text-center">
          <h2 className="text-2xl font-black text-white">
            List your first product for ₹{entry.price}
          </h2>
          <p className="mt-3 text-sm text-white/90 max-w-xl mx-auto leading-relaxed">
            No joining fee, no monthly platform charge, and no commission on what
            you sell. Try it with one product and see the enquiries it brings.
          </p>
          <Link
            href="/?view=signup"
            className="mt-7 inline-flex items-center justify-center rounded-2xl bg-white px-7 py-3.5 font-bold text-primary hover:opacity-90 transition-opacity text-sm"
          >
            Create your seller account →
          </Link>
        </section>
      </div>
    </main>
  );
}
