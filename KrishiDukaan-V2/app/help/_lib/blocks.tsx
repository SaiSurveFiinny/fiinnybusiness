/**
 * Server-side renderer for the existing Help documentation.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE
 * ---------------------------------------
 * This file adds a SECOND renderer for content that already exists. It does not
 * own, copy or replace any of it:
 *
 *   app/views/helpContent.ts   HELP_SECTIONS   — untouched, still the source of truth
 *   app/views/helpMedia.ts     HELP_ENRICHMENTS — untouched
 *   app/i18n/translations.ts   the 468 help strings × 3 languages — untouched
 *   app/views/HelpView.tsx     the client renderer at /?view=help — untouched, still works
 *
 * The docs were only ever reachable at /?view=help, which is the SPA shell: it
 * serves crawlers 824 characters of nav chrome and declares
 * `canonical: https://krishidukan.com`, so the whole documentation set was
 * invisible to search and could never rank as its own page. These routes render
 * the SAME data server-side so it can finally be indexed.
 *
 * Two renderers over one content source — the same arrangement /reels (client
 * feed) and /reels/[slug] (server page) already use for reels.
 *
 * Language: English only for now. i18n is client-side via I18nContext, so
 * serving mr/hi server-side needs locale-in-URL routing — a separate decision.
 */
import Link from "next/link";
import { translations } from "../../i18n/translations";
import type { HelpBlock, HelpSection } from "../../views/helpContent";
import { HELP_ENRICHMENTS } from "../../views/helpMedia";

type Dict = typeof translations["en"];

/** Resolve an i18n key server-side. Falls back to the key so nothing renders blank. */
export function t(key: keyof Dict): string {
  const v = (translations.en as Record<string, unknown>)[key as string];
  return typeof v === "string" ? v : String(key);
}

/** Plain-text of a section's prose — used for meta descriptions and JSON-LD. */
export function sectionText(section: HelpSection, max = 600): string {
  const parts: string[] = [];
  for (const b of section.blocks) {
    if (b.kind === "p" || b.kind === "note" || b.kind === "sub") parts.push(t(b.key));
    else if (b.kind === "list" || b.kind === "steps" || b.kind === "states")
      parts.push(b.keys.map((k) => t(k)).join(". "));
    else if (b.kind === "flow")
      parts.push(b.layers.map((l) => `${t(l.titleKey)}: ${l.keys.map((k) => t(k)).join(", ")}`).join(" → "));
    if (parts.join(" ").length > max) break;
  }
  return parts.join(" ").slice(0, max).trim();
}

/** Ordered steps in a section, if any — drives HowTo schema. */
export function sectionSteps(section: HelpSection): string[] {
  return section.blocks
    .filter((b): b is Extract<HelpBlock, { kind: "steps" }> => b.kind === "steps")
    .flatMap((b) => b.keys.map((k) => t(k)));
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="mb-4 text-sm leading-relaxed text-on-surface-variant">
          {t(block.key)}
        </p>
      );
    case "sub":
      return (
        <h3 className="mb-2 mt-8 text-base font-black text-on-surface">
          {t(block.key)}
        </h3>
      );
    case "note":
      return (
        <div className="my-5 rounded-2xl border border-surface-container bg-surface-container-low p-4">
          <p className="text-sm leading-relaxed text-on-surface">{t(block.key)}</p>
        </div>
      );
    case "list":
      return (
        <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-on-surface-variant">
          {block.keys.map((k) => (
            <li key={k as string}>{t(k)}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-on-surface-variant">
          {block.keys.map((k) => (
            <li key={k as string}>{t(k)}</li>
          ))}
        </ol>
      );
    case "states":
      return (
        <div className="mb-4 flex flex-wrap gap-2">
          {block.keys.map((k) => (
            <span
              key={k as string}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
            >
              {t(k)}
            </span>
          ))}
        </div>
      );
    case "flow":
      return (
        <div className="mb-5 space-y-2">
          {block.layers.map((layer, i) => (
            <div
              key={layer.titleKey as string}
              className="rounded-2xl border border-surface-container bg-white p-4"
            >
              <p className="text-xs font-black uppercase tracking-wide text-primary">
                {i + 1}. {t(layer.titleKey)}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                {layer.keys.map((k) => t(k)).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function HelpBlocks({ section }: { section: HelpSection }) {
  const enrichment = HELP_ENRICHMENTS[section.id];
  // Only `kind: 'route'` links are real crawlable URLs. 'view' links point at
  // /?view=… SPA states that render nothing for a crawler, and requiresDashboard
  // links go behind the paywall — neither belongs on a public documentation page.
  const routeLinks = (enrichment?.links ?? []).filter(
    (l) => l.kind === "route" && !l.requiresDashboard,
  );

  return (
    <>
      {section.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}

      {enrichment?.media?.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {enrichment.media.map((m) => (
            <figure key={m.src} className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.src}
                alt={t(m.captionKey)}
                loading="lazy"
                className="w-full rounded-2xl border border-surface-container bg-white object-contain"
              />
              <figcaption className="mt-2 text-xs text-on-surface-variant">
                {t(m.captionKey)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {routeLinks.length ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {routeLinks.map((l) => (
            <Link
              key={l.target}
              href={l.target}
              className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-5 py-2.5 text-sm font-bold text-on-surface transition-colors hover:border-primary"
            >
              {t(l.labelKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
