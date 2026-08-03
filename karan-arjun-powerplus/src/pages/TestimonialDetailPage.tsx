import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { db } from '../lib/firebase';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';
import type { Product } from '../data/mockData';

/** Resolves a single product by id for display — read-only counterpart to admin's ProductSelect, mirrors CropDetailPage.tsx's useProductsById pattern but scoped to one id instead of the whole collection. */
function useProduct(productId: string): Product | null {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'products', productId), (snapshot) => {
      if (!snapshot.exists()) {
        setProduct(null);
        return;
      }
      const data = snapshot.data();
      setProduct({
        id: snapshot.id,
        name: String(data.name ?? 'Untitled Product'),
        desc: String(data.desc ?? ''),
        numericPrice: Number(data.numericPrice ?? data.price ?? 0),
        price: typeof data.price === 'string' ? data.price : `₹${Number(data.numericPrice ?? 0).toLocaleString('en-IN')}`,
        image: String(data.image ?? '/bottle-1l-Photoroom.png'),
        badge: data.badge ? String(data.badge) : undefined,
        featured: Boolean(data.featured),
      });
    });
    return () => unsubscribe();
  }, [productId]);

  return product;
}

/**
 * Testimonial detail page — /farmer-success/testimonials/:slug. Mirrors
 * StoryDetailPage.tsx/VideoDetailPage.tsx: hero-less editorial layout (a
 * testimonial has no hero image concept), conditional sections so an
 * incomplete testimonial never shows empty headings, related testimonials
 * by shared crop, BreadcrumbList + Review JSON-LD (Review is the correct
 * schema.org type for a farmer's review of the company/product, distinct
 * from the Article schema used for Stories/Case Studies).
 */
export default function TestimonialDetailPage() {
  const { testimonialSlug } = useParams<{ testimonialSlug: string }>();
  const { testimonials, isLoading } = useFarmerSuccessData();

  // Testimonials created before the slug field existed fall back to their
  // Firestore doc id as the route segment (see TestimonialsListingPage's
  // link generation) until re-saved in the admin backfills a real slug.
  const testimonial = testimonials.find((t) => (t.slug || t.id) === testimonialSlug);
  const relatedProduct = useProduct(testimonial?.relatedProductId ?? '');
  const relatedTestimonials = testimonial
    ? testimonials.filter((t) => t.id !== testimonial.id && t.crop === testimonial.crop).slice(0, 3)
    : [];

  usePageSeo({
    title: testimonial ? `${testimonial.farmerName}'s Story | Farmer Success | Karan Arjun Pvt. Ltd.` : 'Farmer Success',
    description: testimonial?.quote,
    ogImage: testimonial?.farmerPhoto,
    structuredData: testimonial
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Farmer Success', item: `${window.location.origin}/farmer-success` },
              { '@type': 'ListItem', position: 2, name: 'Testimonials', item: `${window.location.origin}/farmer-success/testimonials` },
              { '@type': 'ListItem', position: 3, name: testimonial.farmerName, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Review',
            reviewBody: testimonial.quote,
            author: { '@type': 'Person', name: testimonial.farmerName },
            itemReviewed: { '@type': 'Organization', name: 'Karan Arjun Pvt. Ltd.' },
            ...(testimonial.rating > 0
              ? { reviewRating: { '@type': 'Rating', ratingValue: testimonial.rating, bestRating: 5 } }
              : {}),
          },
        ]
      : [],
  });

  if (!isLoading && !testimonial) {
    return <Navigate to="/farmer-success/testimonials" replace />;
  }

  if (!testimonial) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      <div className="bg-primary py-8">
        <div className="max-w-3xl mx-auto px-8">
          <nav className="flex items-center gap-2 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/farmer-success" className="hover:text-white transition-colors">Farmer Success</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to="/farmer-success/testimonials" className="hover:text-white transition-colors">Testimonials</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{testimonial.farmerName}</span>
          </nav>
        </div>
      </div>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8">
          <div className="flex items-center gap-4 mb-8">
            {testimonial.farmerPhoto ? (
              <img src={testimonial.farmerPhoto} alt={testimonial.farmerName} className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/5" />
            )}
            <div>
              <h1 className="font-sans text-xl font-extrabold text-primary">{testimonial.farmerName}</h1>
              <p className="text-slate-400 text-sm font-sans">{[testimonial.crop, testimonial.location].filter(Boolean).join(' · ')}</p>
            </div>
          </div>

          <Icons.Quote className="w-7 h-7 text-secondary/50 mb-4" />
          <p className="font-serif text-xl md:text-2xl text-primary leading-relaxed mb-8">&ldquo;{testimonial.quote}&rdquo;</p>

          {testimonial.rating > 0 && (
            <div className="flex items-center gap-1 mb-8">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Icons.Star key={idx} className={`w-4 h-4 ${idx < testimonial.rating ? 'text-secondary fill-secondary' : 'text-slate-200'}`} />
              ))}
            </div>
          )}

          {relatedProduct && (
            <div>
              <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">Product Used</span>
              <Link to="/shop" className="inline-flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <img src={relatedProduct.image} alt={relatedProduct.name} className="w-10 h-10 object-cover rounded" />
                <span className="font-sans font-semibold text-primary text-sm">{relatedProduct.name}</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {relatedTestimonials.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">More Testimonials</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedTestimonials.map((related) => (
                <Link key={related.id} to={`/farmer-success/testimonials/${related.slug}`} className="group bg-white rounded-lg border border-slate-200 hover:shadow-md transition-shadow p-6 flex flex-col">
                  <Icons.Quote className="w-5 h-5 text-secondary/60 mb-3" />
                  <p className="text-on-surface-variant font-serif text-sm leading-relaxed mb-5 flex-1 line-clamp-3">&ldquo;{related.quote}&rdquo;</p>
                  <p className="font-sans font-bold text-primary text-sm group-hover:underline underline-offset-4">{related.farmerName}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
