import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useFarmerSuccessData } from '../hooks/useFarmerSuccessData';
import { youTubeThumbnailUrl } from '../data/farmerSuccess';

/**
 * Farmer Success landing page — enterprise editorial layout, following the
 * spacing/typography conventions established in CareerLanding.tsx (result-
 * first ordering, divide-y lists over card grids, restrained badges, no
 * icons-as-decoration). Sections: Hero -> Featured Story -> Featured Videos
 * -> Latest Stories -> Case Studies -> Testimonials -> Before & After ->
 * Crop Results -> CTA.
 */
export default function FarmerSuccessLanding() {
  const { stories, videos, testimonials, beforeAfterCases, cropResults, caseStudies, isLoading } = useFarmerSuccessData();

  usePageSeo({
    title: 'Farmer Success | Karan Arjun Pvt. Ltd.',
    description: 'Real stories, field results, and testimonials from farmers who work with Karan Arjun Pvt. Ltd.',
  });

  const featuredStory = useMemo(() => stories.find((s) => s.featured) ?? stories[0], [stories]);
  const latestStories = useMemo(
    () => stories.filter((s) => s.id !== featuredStory?.id).sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || '')).slice(0, 6),
    [stories, featuredStory],
  );
  const featuredVideos = useMemo(() => videos.filter((v) => v.featured).slice(0, 3), [videos]);
  const featuredTestimonials = useMemo(() => testimonials.filter((t) => t.featured).slice(0, 3), [testimonials]);
  const featuredCaseStudies = useMemo(() => caseStudies.slice(0, 2), [caseStudies]);
  const featuredBeforeAfter = useMemo(() => beforeAfterCases.slice(0, 2), [beforeAfterCases]);
  const featuredCropResults = useMemo(() => cropResults.slice(0, 4), [cropResults]);

  return (
    <div className="flex flex-col relative">
      {/* Hero */}
      <section className="relative min-h-[56vh] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=2000&q=80"
          alt="Close-up of a seedling emerging from rich soil"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <span className="inline-block font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary-container mb-5">
            Farmer Success
          </span>
          <h1 className="font-sans text-[28px] md:text-[42px] lg:text-5xl font-extrabold leading-[1.15] mb-5 text-white max-w-2xl">
            Real Results, From Real Farms
          </h1>
          <p className="font-serif text-base md:text-lg text-white/80 max-w-xl leading-relaxed">
            Stories, field results, and testimonials from the farmers we work with across India.
          </p>
        </div>
      </section>

      {isLoading && (
        <div className="py-24 text-center font-sans text-sm text-primary/60">Loading farmer success stories...</div>
      )}

      {/* Featured Story */}
      {featuredStory && (
        <section className="relative z-10 bg-white py-20 md:py-28">
          <div className="max-w-5xl mx-auto px-8">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-6 block">Featured Story</span>
            <Link to={`/farmer-success/story/${featuredStory.slug}`} className="group grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
                {featuredStory.heroImage && <img src={featuredStory.heroImage} alt={featuredStory.title} className="absolute inset-0 w-full h-full object-cover" />}
              </div>
              <div>
                <h2 className="font-sans text-2xl md:text-[32px] font-extrabold text-primary mb-4 leading-tight group-hover:underline underline-offset-4">{featuredStory.title}</h2>
                {featuredStory.subtitle && <p className="text-on-surface-variant font-serif text-base leading-relaxed mb-5 max-w-md">{featuredStory.subtitle}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 font-sans font-medium mb-6">
                  {featuredStory.farmerName && <span>{featuredStory.farmerName}</span>}
                  {featuredStory.location && <span>{featuredStory.location}</span>}
                  {featuredStory.crop && <span>{featuredStory.crop}</span>}
                </div>
                <span className="inline-flex items-center gap-1.5 font-sans text-sm font-bold text-primary">
                  Read Story <Icons.ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Featured Videos */}
      {featuredVideos.length > 0 && (
        <section className="relative z-10 bg-surface py-20 md:py-28 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <div className="flex items-baseline justify-between gap-6 mb-10">
              <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight">Featured Videos</h2>
              <Link to="/farmer-success/videos" className="font-sans text-sm font-bold text-primary hover:underline underline-offset-4 shrink-0">View All</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredVideos.map((video) => (
                <Link key={video.id} to="/farmer-success/videos" className="group">
                  <div className="relative rounded-lg overflow-hidden aspect-video bg-primary/5 mb-3">
                    {youTubeThumbnailUrl(video.youtubeUrl) && (
                      <img src={youTubeThumbnailUrl(video.youtubeUrl)} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                      <Icons.PlayCircle className="w-10 h-10 text-white" />
                    </div>
                  </div>
                  <h3 className="font-sans font-bold text-primary text-sm">{video.title}</h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest Stories */}
      {latestStories.length > 0 && (
        <section className="relative z-10 bg-white py-20 md:py-28 border-t border-primary/5">
          <div className="max-w-4xl mx-auto px-8">
            <div className="flex items-baseline justify-between gap-6 mb-10 pb-6 border-b border-primary/10">
              <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight">Latest Stories</h2>
            </div>
            <div className="flex flex-col divide-y divide-primary/10">
              {latestStories.map((story) => (
                <Link key={story.id} to={`/farmer-success/story/${story.slug}`} className="group py-7 flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-sans text-lg font-bold text-primary mb-1.5 group-hover:underline underline-offset-4">{story.title}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 font-sans font-medium mb-2">
                      {story.crop && <span>{story.crop}</span>}
                      {story.location && <span>{story.location}</span>}
                    </div>
                    {story.subtitle && <p className="text-sm text-on-surface-variant font-serif leading-relaxed max-w-2xl line-clamp-2">{story.subtitle}</p>}
                  </div>
                  <Icons.ArrowRight className="w-4 h-4 text-primary/30 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 self-start md:self-center" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Case Studies */}
      {featuredCaseStudies.length > 0 && (
        <section className="relative z-10 bg-surface py-20 md:py-28 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <div className="flex items-baseline justify-between gap-6 mb-10">
              <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight">Case Studies</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {featuredCaseStudies.map((caseStudy) => (
                <Link key={caseStudy.id} to={`/farmer-success/case-study/${caseStudy.slug}`} className="group">
                  <div className="relative rounded-lg overflow-hidden aspect-[16/10] mb-4 bg-primary/5">
                    {caseStudy.coverImage && <img src={caseStudy.coverImage} alt={caseStudy.title} className="absolute inset-0 w-full h-full object-cover" />}
                  </div>
                  <h3 className="font-sans text-xl font-bold text-primary mb-2 group-hover:underline underline-offset-4">{caseStudy.title}</h3>
                  {caseStudy.summary && <p className="text-sm text-on-surface-variant font-serif leading-relaxed line-clamp-2">{caseStudy.summary}</p>}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials — featured-only showcase; full archive lives at /farmer-success/testimonials */}
      {featuredTestimonials.length > 0 && (
        <section className="relative z-10 bg-primary py-20 md:py-28">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-white tracking-tight mb-12 text-center">What Farmers Say</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              {featuredTestimonials.map((testimonial) => (
                <Link key={testimonial.id} to={`/farmer-success/testimonials/${testimonial.slug || testimonial.id}`} className="group flex flex-col">
                  <Icons.Quote className="w-6 h-6 text-secondary-container/60 mb-4" />
                  <p className="text-white/85 font-serif text-base leading-relaxed mb-6 flex-1 group-hover:text-white transition-colors">&ldquo;{testimonial.quote}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    {testimonial.farmerPhoto ? (
                      <img src={testimonial.farmerPhoto} alt={testimonial.farmerName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10" />
                    )}
                    <div>
                      <p className="font-sans font-bold text-white text-sm group-hover:underline underline-offset-4">{testimonial.farmerName}</p>
                      <p className="text-white/60 text-xs font-sans">{[testimonial.crop, testimonial.location].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center">
              <Link to="/farmer-success/testimonials" className="inline-flex items-center gap-1.5 font-sans text-sm font-bold text-white hover:underline underline-offset-4">
                View All Testimonials <Icons.ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Before & After */}
      {featuredBeforeAfter.length > 0 && (
        <section className="relative z-10 bg-white py-20 md:py-28 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight mb-12">Before &amp; After</h2>
            <div className="flex flex-col gap-14">
              {featuredBeforeAfter.map((entry) => (
                <div key={entry.id}>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
                      <img src={entry.beforeImage} alt={`${entry.title} — before`} className="absolute inset-0 w-full h-full object-cover" />
                      <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 text-white text-[10px] font-sans font-bold uppercase tracking-wide rounded">Before</span>
                    </div>
                    <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
                      <img src={entry.afterImage} alt={`${entry.title} — after`} className="absolute inset-0 w-full h-full object-cover" />
                      <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 text-white text-[10px] font-sans font-bold uppercase tracking-wide rounded">After</span>
                    </div>
                  </div>
                  <h3 className="font-sans text-lg font-bold text-primary mb-1">{entry.title}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 font-sans font-medium mb-2">
                    {entry.crop && <span>{entry.crop}</span>}
                    {entry.duration && <span>{entry.duration}</span>}
                    {entry.resultMetrics && <span className="text-primary font-semibold">{entry.resultMetrics}</span>}
                  </div>
                  {entry.description && <p className="text-sm text-on-surface-variant font-serif leading-relaxed max-w-2xl">{entry.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Crop Results */}
      {featuredCropResults.length > 0 && (
        <section className="relative z-10 bg-surface py-20 md:py-28 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight mb-12">Field Performance</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredCropResults.map((result) => (
                <div key={result.id} className="bg-white rounded-lg border border-slate-200 p-6">
                  <p className="font-sans font-bold text-primary mb-4">{result.crop}</p>
                  {result.yieldIncrease && (
                    <div className="mb-3">
                      <p className="text-2xl font-sans font-black text-primary">+{result.yieldIncrease}</p>
                      <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Yield Increase</p>
                    </div>
                  )}
                  {result.diseaseReduction && (
                    <div>
                      <p className="text-2xl font-sans font-black text-primary">-{result.diseaseReduction}</p>
                      <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Disease Reduction</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative z-10 bg-white py-20 md:py-28 border-t border-primary/5">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-4 tracking-tight">
            Have a Success Story to Share?
          </h2>
          <p className="font-serif text-base text-on-surface-variant mb-8">
            We'd love to hear how our products have helped your farm.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 bg-primary text-secondary-container px-8 py-3.5 rounded-full font-sans font-bold hover:bg-primary-container transition-colors uppercase tracking-widest text-sm"
          >
            Contact Us <Icons.ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
