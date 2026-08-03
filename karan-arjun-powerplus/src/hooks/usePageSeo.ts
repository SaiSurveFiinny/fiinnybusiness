import { useEffect } from 'react';

interface PageSeoOptions {
  title: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
  /** JSON-LD structured data objects (e.g. Product, FAQPage, BreadcrumbList). */
  structuredData?: object[];
}

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  if (!content) return;
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/**
 * Best-effort CLIENT-SIDE SEO for a CSR-only app (no SSR/prerendering exists
 * in this codebase). This updates document.title, meta description/keywords,
 * Open Graph tags, canonical link, and injects JSON-LD structured data after
 * mount. Modern crawlers that execute JavaScript (Googlebot) can pick this
 * up; simple scrapers and some social-preview bots that don't run JS will
 * not see it. This is a known, explicitly-flagged ceiling — true SSR/SSG
 * would be required to fully solve link-preview and non-JS-crawler cases,
 * and is out of scope for this module (see project discussion).
 */
export function usePageSeo({ title, description, keywords, ogImage, canonicalUrl, structuredData }: PageSeoOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
    }
    if (keywords) setMetaTag('name', 'keywords', keywords);
    setMetaTag('property', 'og:title', title);
    if (ogImage) setMetaTag('property', 'og:image', ogImage);

    let canonicalTag: HTMLLinkElement | null = null;
    if (canonicalUrl) {
      canonicalTag = document.querySelector('link[rel="canonical"]');
      if (!canonicalTag) {
        canonicalTag = document.createElement('link');
        canonicalTag.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalTag);
      }
      canonicalTag.setAttribute('href', canonicalUrl);
    }

    const scriptTags: HTMLScriptElement[] = [];
    (structuredData ?? []).forEach((data) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
      scriptTags.push(script);
    });

    return () => {
      document.title = previousTitle;
      scriptTags.forEach((tag) => tag.remove());
    };
  }, [title, description, keywords, ogImage, canonicalUrl, structuredData]);
}
