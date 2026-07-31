import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';
import type { Testimonial } from '../data/farmerSuccess';

/** Firestore serverTimestamp() resolves to a Timestamp with toMillis(); pending writes are briefly null before that. Falls back to 0 (oldest) so newly-committed docs settle into place once resolved rather than crashing the sort. */
function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/**
 * Testimonials listing — /farmer-success/testimonials. Shows every
 * published testimonial (featured and non-featured), ordered featured-first
 * then most-recent-first within each group, per the requirement that the
 * homepage stay a "featured only" showcase while this page is the full
 * browsable archive. Crop filter mirrors VideoLibraryPage.tsx's filter-bar
 * pattern; search-ready via the same searchTerm state shape used across
 * every other Farmer Success listing (Career/Crop Solutions precedent).
 */
export default function TestimonialsListingPage() {
  const { testimonials, isLoading } = useFarmerSuccessData();
  const [cropFilter, setCropFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  usePageSeo({
    title: 'Farmer Testimonials | Farmer Success | Karan Arjun Pvt. Ltd.',
    description: 'Read what farmers across India say about working with Karan Arjun Pvt. Ltd.',
  });

  const crops = useMemo(() => Array.from(new Set(testimonials.map((t) => t.crop).filter(Boolean))), [testimonials]);

  const orderedTestimonials = useMemo(() => {
    const filtered = testimonials.filter((t) => {
      if (cropFilter !== 'all' && t.crop !== cropFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        if (!t.farmerName.toLowerCase().includes(term) && !t.quote.toLowerCase().includes(term)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });
  }, [testimonials, cropFilter, searchTerm]);

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/farmer-success" className="hover:text-white transition-colors">Farmer Success</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Testimonials</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">What Farmers Say</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed mb-8">
            Testimonials from farmers who work with us across India.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or quote..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/95 text-sm font-sans focus:outline-none"
            />
            {crops.length > 0 && (
              <select value={cropFilter} onChange={(e) => setCropFilter(e.target.value)} className="px-4 py-2.5 rounded-lg bg-white/95 text-sm font-sans">
                <option value="all">All Crops</option>
                {crops.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
              </select>
            )}
          </div>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading testimonials...</p>}
          {!isLoading && orderedTestimonials.length === 0 && <p className="font-sans text-sm text-primary/60">No testimonials match this filter.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {orderedTestimonials.map((testimonial) => <TestimonialCard key={testimonial.id} testimonial={testimonial} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <Link
      to={`/farmer-success/testimonials/${testimonial.slug || testimonial.id}`}
      className="group bg-white rounded-lg border border-slate-200 hover:shadow-md transition-shadow p-6 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <Icons.Quote className="w-5 h-5 text-secondary/60" />
        {testimonial.featured && (
          <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-secondary">Featured</span>
        )}
      </div>
      <p className="text-on-surface-variant font-serif text-sm leading-relaxed mb-6 flex-1 line-clamp-4">&ldquo;{testimonial.quote}&rdquo;</p>
      <div className="flex items-center gap-3">
        {testimonial.farmerPhoto ? (
          <img src={testimonial.farmerPhoto} alt={testimonial.farmerName} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/5" />
        )}
        <div>
          <p className="font-sans font-bold text-primary text-sm group-hover:underline underline-offset-4">{testimonial.farmerName}</p>
          <p className="text-slate-400 text-xs font-sans">{[testimonial.crop, testimonial.location].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
    </Link>
  );
}
