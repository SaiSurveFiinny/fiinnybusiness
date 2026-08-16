import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../lib/firebase';
import {
  autoRelatedProducts,
  displayMrp,
  displayPrice,
  getPurchaseUrl,
  hasText,
  hasTextItems,
  isProductPubliclyVisible,
  meaningfulBenefits,
  meaningfulCertifications,
  meaningfulCompositionRows,
  meaningfulCrops,
  meaningfulDosageRows,
  meaningfulDownloads,
  meaningfulExpectedResults,
  meaningfulFaqs,
  meaningfulSpecRows,
  meaningfulSteps,
  meaningfulVideos,
  normalizeProduct,
  primaryImage,
  secondaryImages,
  toYouTubeEmbedUrl,
  type ProductDetail,
  type ProductVariant,
} from '../data/products';

function toVimeoEmbed(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? `https://player.vimeo.com/video/${match[1]}` : null;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-8 tracking-tight">{children}</h2>;
}

/**
 * Public product detail page — /products/:slug. Every section is rendered
 * conditionally from ProductDetail (see data/products.ts) with no hardcoded
 * product content; sections with empty data simply don't render. Mirrors
 * StoryDetailPage.tsx/CropDetailPage.tsx's shell (usePageSeo + BreadcrumbList
 * JSON-LD, Navigate-away on not-found) plus a Product JSON-LD block and the
 * variant-driven pricing/cart flow Shop.tsx already established via useCart().
 */
export default function ProductDetailPage() {
  const { t } = useLanguage();
  const { productSlug } = useParams<{ productSlug: string }>();
  const { addToCart } = useCart();
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map((d) => normalizeProduct(d.id, d.data())));
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const product = products.find((p) => p.slug === productSlug && isProductPubliclyVisible(p));

  const selectedVariant: ProductVariant | null = useMemo(() => {
    if (!product || product.variants.length === 0) return null;
    return product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0];
  }, [product, selectedVariantId]);

  const galleryImages = useMemo(() => {
    if (!product) return [];
    const primary = primaryImage(product);
    if (!primary) return [];
    return [primary, ...secondaryImages(product)];
  }, [product]);

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    if (product.relatedProductsMode === 'manual') {
      return product.relatedProductIds.map((id) => products.find((p) => p.id === id)).filter((p): p is ProductDetail => Boolean(p) && isProductPubliclyVisible(p!));
    }
    return autoRelatedProducts(product, products.filter(isProductPubliclyVisible));
  }, [product, products]);

  // Filtered, content-only versions of every repeatable section — a row with every field blank (e.g. freshly "Add Row"-ed in the admin editor) should never render, so `.length > 0` alone is not a valid gate. See meaningful*() in data/products.ts.
  const benefits = useMemo(() => (product ? meaningfulBenefits(product.benefits) : []), [product]);
  const crops = useMemo(() => (product ? meaningfulCrops(product.recommendedCrops) : []), [product]);
  const dosageRows = useMemo(() => (product ? meaningfulDosageRows(product.dosage) : []), [product]);
  const compositionRows = useMemo(() => (product ? meaningfulCompositionRows(product.composition) : []), [product]);
  const specRows = useMemo(() => (product ? meaningfulSpecRows(product.specifications) : []), [product]);
  const steps = useMemo(() => (product ? meaningfulSteps(product.howToUse) : []), [product]);
  const expectedResults = useMemo(() => (product ? meaningfulExpectedResults(product.expectedResults) : []), [product]);
  const faqs = useMemo(() => (product ? meaningfulFaqs(product.faqs) : []), [product]);
  const certifications = useMemo(() => (product ? meaningfulCertifications(product.certifications) : []), [product]);
  const downloads = useMemo(() => (product ? meaningfulDownloads(product.downloads) : []), [product]);
  const videos = useMemo(() => (product ? meaningfulVideos(product.videos) : []), [product]);

  const displayImageUrl = activeImage ?? galleryImages[0]?.url ?? '/bottle-1l-Photoroom.png';

  const seoTitle = product?.seo.metaTitle || (product ? `${product.name} | Karan Arjun Pvt. Ltd.` : 'Product');
  const seoDescription = product?.seo.metaDescription || product?.tagline;
  const canonicalUrl = product?.seo.canonicalUrl || (product ? `${window.location.origin}/products/${product.slug}` : undefined);

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    keywords: product?.seo.keywords,
    ogImage: product?.seo.ogImage || (product ? primaryImage(product)?.url : undefined),
    canonicalUrl,
    structuredData: product
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin },
              { '@type': 'ListItem', position: 2, name: 'Products', item: `${window.location.origin}/products` },
              { '@type': 'ListItem', position: 3, name: product.name, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            description: product.seo.metaDescription || product.tagline || product.description.slice(0, 160),
            image: galleryImages.length > 0 ? galleryImages.map((img) => img.url) : undefined,
            sku: product.sku || undefined,
            brand: { '@type': 'Brand', name: product.brand },
            category: product.category || undefined,
            offers:
              product.variants.length > 0
                ? product.variants.map((v) => ({
                    '@type': 'Offer',
                    url: window.location.href,
                    priceCurrency: 'INR',
                    price: v.price,
                    availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                    sku: v.sku || undefined,
                  }))
                : product.price > 0
                  ? {
                      '@type': 'Offer',
                      url: window.location.href,
                      priceCurrency: 'INR',
                      price: product.price,
                      availability: 'https://schema.org/InStock',
                    }
                  : undefined,
          },
        ]
      : [],
  });

  if (!isLoading && !product) {
    return <Navigate to="/products" replace />;
  }

  if (!product) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">{t.pdp_loading}</div>;
  }

  const cartPrice = selectedVariant?.price ?? (product.price > 0 ? product.price : undefined);

  const handleAddToCart = () => {
    if (cartPrice === undefined) return;
    addToCart({
      id: `${product.id}${selectedVariant?.id ? `-${selectedVariant.id}` : ''}`,
      name: `${product.name}${selectedVariant?.label ? ` (${selectedVariant.label})` : ''}`,
      price: cartPrice,
      image: displayImageUrl,
      desc: product.tagline,
    });
  };

  const purchaseUrl = getPurchaseUrl(product);

  const handleBuyNow = () => {
    if (!purchaseUrl) return;
    window.open(purchaseUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col relative min-h-screen">
      {/* Hero */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-20 bg-surface">
        <div className="max-w-7xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-8 text-xs font-sans font-bold text-primary/50 uppercase tracking-widest">
            <Link to="/products" className="hover:text-primary transition-colors">{t.pdp_breadcrumb_products}</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-primary">{product.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Gallery — hero shows the Primary Image; thumbnails are the remaining Product Images. Variant selection does not change the displayed image. */}
            <div>
              <div className="aspect-square rounded-[2rem] bg-white border border-slate-100 shadow-sm flex items-center justify-center p-10 mb-4 cursor-zoom-in" onClick={() => setLightboxImage(displayImageUrl)}>
                <img src={displayImageUrl} alt={product.name} className="max-h-full max-w-full object-contain" />
              </div>
              {galleryImages.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {galleryImages.map((image) => (
                    <button
                      key={image.id}
                      onClick={() => setActiveImage(image.url)}
                      className={`w-20 h-20 shrink-0 rounded-xl border-2 p-2 bg-white transition-colors ${displayImageUrl === image.url ? 'border-primary' : 'border-slate-100 hover:border-slate-300'}`}
                    >
                      <img src={image.url} alt={image.alt || ''} className="w-full h-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div>
              {(hasText(product.category) || hasTextItems(product.badges)) && (
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {hasText(product.category) && (
                    <span className="px-3 py-1 rounded-full text-xs font-sans font-bold uppercase bg-primary/5 text-primary">{product.category}</span>
                  )}
                  {product.badges.filter(hasText).map((badge) => (
                    <span key={badge} className="px-3 py-1 rounded-full text-xs font-sans font-bold uppercase bg-secondary-container/20 text-secondary">{badge}</span>
                  ))}
                </div>
              )}
              <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-primary mb-3 leading-tight">{product.name}</h1>
              {hasText(product.tagline) && <p className="font-serif text-base md:text-lg text-on-surface-variant mb-6">{product.tagline}</p>}

              {(() => {
                const price = selectedVariant?.price ?? displayPrice(product);
                const mrp = selectedVariant?.mrp ?? displayMrp(product);
                if (price === undefined) {
                  return <p className="text-2xl font-extrabold text-primary mb-6">{t.pdp_contact_for_price}</p>;
                }
                return (
                  <div className="flex items-baseline gap-3 mb-6">
                    <span className="text-4xl font-extrabold text-primary tracking-tight">₹{price.toLocaleString('en-IN')}</span>
                    {mrp !== undefined && mrp > price && (
                      <span className="text-lg text-slate-400 line-through">₹{mrp.toLocaleString('en-IN')}</span>
                    )}
                    {selectedVariant && (
                      <span className={`text-xs font-sans font-bold uppercase ${selectedVariant.stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {selectedVariant.stock > 0 ? t.pdp_in_stock : t.pdp_out_of_stock}
                      </span>
                    )}
                  </div>
                );
              })()}

              {product.variants.length > 1 && (
                <div className="mb-6">
                  <span className="block font-sans text-xs font-bold text-primary/50 uppercase tracking-widest mb-3">{t.pdp_size_label}</span>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedVariantId(variant.id)}
                        className={`px-4 py-2 rounded-xl font-sans font-bold text-sm border transition-colors ${
                          selectedVariant?.id === variant.id ? 'border-primary bg-primary text-secondary-container' : 'border-slate-200 text-primary hover:border-primary/40'
                        }`}
                      >
                        {variant.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 mb-6">
                <span className="block font-sans text-xs font-bold text-primary/50 uppercase tracking-widest">{t.pdp_quantity_label}</span>
                <div className="flex items-center border border-slate-200 rounded-xl">
                  <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-primary font-bold">−</button>
                  <span className="px-4 font-sans font-bold text-primary">{quantity}</span>
                  <button onClick={() => setQuantity((q) => q + 1)} className="px-3 py-2 text-primary font-bold">+</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={handleAddToCart}
                  disabled={cartPrice === undefined || (selectedVariant ? selectedVariant.stock === 0 : false)}
                  className="w-full px-4 py-4 rounded-xl font-sans font-bold border border-primary/20 text-primary hover:bg-primary/5 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Icons.ShoppingCart className="w-4 h-4" /> {t.pdp_add_to_cart}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={!purchaseUrl}
                  title={purchaseUrl ? undefined : t.pdp_ordering_soon}
                  className="w-full px-4 py-4 rounded-xl font-sans font-bold shadow-md bg-primary text-secondary-container hover:bg-primary-container transition-colors text-sm flex items-center justify-center gap-1 disabled:opacity-40"
                >
                  {purchaseUrl ? <>{t.pdp_buy_now} <Icons.ChevronRight className="w-4 h-4" /></> : t.pdp_currently_unavailable}
                </button>
              </div>
              {!purchaseUrl && <p className="text-xs text-slate-400 font-sans -mt-3 mb-6">{t.pdp_ordering_soon}</p>}

              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => { if (navigator.share) void navigator.share({ title: product.name, url: window.location.href }); else void navigator.clipboard.writeText(window.location.href); }}
                  className="flex items-center gap-2 text-sm font-sans font-semibold text-primary/70 hover:text-primary transition-colors"
                >
                  <Icons.ArrowLeftRight className="w-4 h-4" /> {t.pdp_share}
                </button>
              </div>

              {hasText(product.sku) && <p className="text-xs text-slate-400 font-sans">{t.pdp_sku_prefix} {product.sku}</p>}
            </div>
          </div>
        </div>
      </section>

      <div className="bg-white">
        <div className="max-w-5xl mx-auto px-8 py-16 md:py-20 flex flex-col gap-20">
          {/* Highlights */}
          {hasTextItems(product.highlights) && (
            <div>
              <SectionHeading>{t.pdp_key_highlights}</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {product.highlights.filter(hasText).map((highlight, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 rounded-xl bg-surface">
                    <Icons.CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-sm font-sans text-primary">{highlight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {hasText(product.description) && (
            <div>
              <SectionHeading>{t.pdp_description}</SectionHeading>
              <p className="font-serif text-base md:text-lg text-primary/80 leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}

          {/* Benefits */}
          {benefits.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_benefits}</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...benefits].sort((a, b) => a.order - b.order).map((benefit) => (
                  <div key={benefit.id} className="p-6 rounded-2xl bg-surface border border-slate-100">
                    {benefit.icon && <img src={benefit.icon} alt="" className="w-10 h-10 object-contain mb-4" />}
                    {hasText(benefit.title) && <h3 className="font-sans font-bold text-primary mb-2">{benefit.title}</h3>}
                    {hasText(benefit.description) && <p className="text-sm text-on-surface-variant font-serif leading-relaxed">{benefit.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Crops */}
          {crops.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_recommended_crops}</SectionHeading>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {[...crops].sort((a, b) => a.order - b.order).map((crop) => (
                  <div key={crop.id} className="text-center">
                    <div className="aspect-square rounded-2xl bg-surface border border-slate-100 flex items-center justify-center p-4 mb-2">
                      {crop.image && <img src={crop.image} alt={crop.name} className="max-h-full max-w-full object-contain" />}
                    </div>
                    {hasText(crop.name) && <span className="text-sm font-sans font-semibold text-primary">{crop.name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dosage & Application */}
          {dosageRows.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_dosage_application}</SectionHeading>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left font-sans text-sm min-w-[600px]">
                  <thead>
                    <tr className="bg-surface border-b border-slate-100">
                      <th className="py-3 px-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">{t.pdp_table_crop}</th>
                      <th className="py-3 px-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">{t.pdp_table_dosage}</th>
                      <th className="py-3 px-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">{t.pdp_table_method}</th>
                      <th className="py-3 px-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">{t.pdp_table_growth_stage}</th>
                      <th className="py-3 px-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">{t.pdp_table_spray_interval}</th>
                      <th className="py-3 px-4 text-primary/60 font-semibold uppercase tracking-wider text-xs">{t.pdp_table_remarks}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dosageRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-3 px-4 font-bold text-primary">{row.crop}</td>
                        <td className="py-3 px-4 text-primary/80">{row.dosage}</td>
                        <td className="py-3 px-4 text-primary/80">{row.method}</td>
                        <td className="py-3 px-4 text-primary/80">{row.growthStage}</td>
                        <td className="py-3 px-4 text-primary/80">{row.sprayInterval}</td>
                        <td className="py-3 px-4 text-primary/80">{row.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Composition */}
          {compositionRows.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_composition}</SectionHeading>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left font-sans text-sm">
                  <tbody>
                    {compositionRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-3 px-4 font-semibold text-primary">{row.ingredient}</td>
                        <td className="py-3 px-4 text-primary/80 text-right">{row.percentage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Technical Specifications */}
          {specRows.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_technical_specifications}</SectionHeading>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left font-sans text-sm">
                  <tbody>
                    {specRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-3 px-4 font-semibold text-primary w-1/3">{row.property}</td>
                        <td className="py-3 px-4 text-primary/80">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* How To Use */}
          {steps.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_how_to_use}</SectionHeading>
              <div className="flex flex-col gap-8">
                {[...steps].sort((a, b) => a.stepNumber - b.stepNumber).map((step) => (
                  <div key={step.id} className="flex gap-5 items-start">
                    <div className="w-10 h-10 rounded-full bg-primary text-secondary-container font-sans font-bold flex items-center justify-center shrink-0">{step.stepNumber}</div>
                    <div className="flex-1">
                      {hasText(step.title) && <h3 className="font-sans font-bold text-primary mb-1">{step.title}</h3>}
                      {hasText(step.description) && <p className="text-sm text-on-surface-variant font-serif leading-relaxed">{step.description}</p>}
                    </div>
                    {step.image && <img src={step.image} alt="" className="w-20 h-20 object-contain rounded-xl border border-slate-100 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Safety / Storage */}
          {(hasTextItems(product.safetyChecklist) || hasTextItems(product.storageChecklist)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {hasTextItems(product.safetyChecklist) && (
                <div>
                  <SectionHeading>{t.pdp_safety_information}</SectionHeading>
                  <ul className="space-y-2">
                    {product.safetyChecklist.filter(hasText).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm font-sans text-primary/80">
                        <Icons.ShieldCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hasTextItems(product.storageChecklist) && (
                <div>
                  <SectionHeading>{t.pdp_storage_instructions}</SectionHeading>
                  <ul className="space-y-2">
                    {product.storageChecklist.filter(hasText).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm font-sans text-primary/80">
                        <Icons.Box className="w-4 h-4 text-secondary shrink-0 mt-0.5" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Videos */}
          {videos.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_product_videos}</SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {videos.map((video) => {
                  if (video.provider === 'youtubeShort') {
                    const embed = toYouTubeEmbedUrl(video.url);
                    return (
                      <div key={video.id} className="w-full max-w-[280px] mx-auto md:col-span-1">
                        <div className="rounded-2xl overflow-hidden bg-black aspect-[9/16]">
                          {embed ? (
                            <iframe src={embed} title={video.title} className="w-full h-full" allowFullScreen />
                          ) : (
                            <video src={video.url} poster={video.thumbnail} controls className="w-full h-full object-contain" />
                          )}
                        </div>
                      </div>
                    );
                  }
                  const embed = video.provider === 'youtube' ? toYouTubeEmbedUrl(video.url) : video.provider === 'vimeo' ? toVimeoEmbed(video.url) : null;
                  return (
                    <div key={video.id} className="rounded-2xl overflow-hidden bg-black aspect-video">
                      {embed ? (
                        <iframe src={embed} title={video.title} className="w-full h-full" allowFullScreen />
                      ) : (
                        <video src={video.url} poster={video.thumbnail} controls className="w-full h-full object-contain" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expected Results */}
          {expectedResults.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_expected_results}</SectionHeading>
              <div className="flex flex-col gap-4">
                {expectedResults.map((result) => (
                  <div key={result.id} className="flex gap-5 items-start p-4 rounded-xl bg-surface">
                    {hasText(result.day) && <span className="font-sans font-bold text-secondary shrink-0 w-24">{result.day}</span>}
                    {hasText(result.result) && <span className="text-sm font-sans text-primary/80">{result.result}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Gallery — the full Product Images set (same source as the hero, shown again as a browsable gallery per-spec). Skipped when there's only the one primary image already shown in the hero. */}
          {galleryImages.length > 1 && (
            <div>
              <SectionHeading>{t.pdp_gallery}</SectionHeading>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {galleryImages.map((image) => (
                  <button key={image.id} onClick={() => setLightboxImage(image.url)} className="aspect-[4/3] rounded-xl overflow-hidden bg-surface border border-slate-100">
                    <img src={image.url} alt={image.alt || ''} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FAQ */}
          {faqs.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_faq}</SectionHeading>
              <div className="flex flex-col gap-3">
                {[...faqs].sort((a, b) => a.order - b.order).map((faq) => (
                  <div key={faq.id} className="border border-slate-100 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOpenFaqId(openFaqId === faq.id ? null : faq.id)}
                      className="w-full flex items-center justify-between gap-4 p-4 text-left font-sans font-bold text-primary"
                    >
                      {faq.question}
                      <Icons.ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaqId === faq.id ? 'rotate-180' : ''}`} />
                    </button>
                    {openFaqId === faq.id && hasText(faq.answer) && <p className="px-4 pb-4 text-sm font-serif text-on-surface-variant leading-relaxed">{faq.answer}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_certifications}</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {certifications.map((cert) => (
                  <div key={cert.id} className="p-5 rounded-2xl bg-surface border border-slate-100 text-center">
                    {cert.image && <img src={cert.image} alt={cert.title} className="w-20 h-20 object-contain mx-auto mb-3" />}
                    {hasText(cert.title) && <h3 className="font-sans font-bold text-primary text-sm mb-1">{cert.title}</h3>}
                    {cert.description && <p className="text-xs text-on-surface-variant font-serif">{cert.description}</p>}
                    {cert.certificateNumber && <p className="text-[10px] text-slate-400 font-sans mt-2">{t.pdp_cert_number_prefix} {cert.certificateNumber}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Downloads */}
          {downloads.length > 0 && (
            <div>
              <SectionHeading>{t.pdp_download_resources}</SectionHeading>
              <div className="flex flex-col gap-3">
                {downloads.map((download) => (
                  <a key={download.id} href={download.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-slate-100 hover:border-primary/30 transition-colors">
                    <Icons.FileText className="w-6 h-6 text-primary shrink-0" />
                    <div className="flex-1">
                      <span className="font-sans font-bold text-primary text-sm block">{hasText(download.title) ? download.title : download.url}</span>
                      <span className="text-xs text-slate-400 font-sans uppercase">{download.type}{download.size ? ` · ${download.size}` : ''}</span>
                    </div>
                    <Icons.Download className="w-5 h-5 text-primary/40 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {lightboxImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6" onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} alt="" className="max-w-full max-h-full object-contain" />
          <button onClick={() => setLightboxImage(null)} className="absolute top-6 right-6 text-white/80 hover:text-white">
            <Icons.X className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">{t.pdp_related_products}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((related) => (
                <Link key={related.id} to={`/products/${related.slug}`} className="group bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-md transition-shadow">
                  <div className="aspect-square relative overflow-hidden bg-surface flex items-center justify-center p-6">
                    {primaryImage(related) && <img src={primaryImage(related)!.url} alt={related.name} className="max-h-full max-w-full object-contain" />}
                  </div>
                  <div className="p-5">
                    <h3 className="font-sans font-bold text-primary group-hover:underline underline-offset-4">{related.name}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
