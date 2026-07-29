import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useCareerData } from '../hooks/useCareerData';
import type { EmploymentType } from '../data/career';

/**
 * Career landing page — hero with search/filters, Open Positions (primary
 * content — most visitors arrive to browse jobs), then a "Why Join Us"
 * editorial section supporting the hiring decision further down the page.
 * Reuses useCareerData (the public-jobs equivalent of hooks/useCropSolutions.ts).
 * No data/filter/routing logic changed from the prior version — presentation only.
 */
export default function CareerLanding() {
  const { jobs, departments, isLoading } = useCareerData();
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EmploymentType>('all');

  usePageSeo({
    title: 'Careers | Karan Arjun Pvt. Ltd.',
    description: 'Explore career opportunities at Karan Arjun Pvt. Ltd. — join a team building agricultural solutions for Indian farmers.',
  });

  const locations = useMemo(() => Array.from(new Set(jobs.map((j) => j.location).filter(Boolean))), [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (searchTerm.trim() && !job.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (locationFilter !== 'all' && job.location !== locationFilter) return false;
      if (departmentFilter !== 'all' && job.departmentId !== departmentFilter) return false;
      if (typeFilter !== 'all' && job.employmentType !== typeFilter) return false;
      return true;
    });
  }, [jobs, searchTerm, locationFilter, departmentFilter, typeFilter]);

  return (
    <div className="flex flex-col relative">
      {/* Hero */}
      <section className="relative min-h-[56vh] flex items-end overflow-hidden">
        {/*
          Interim asset: verified real Unsplash photo of agricultural
          fieldwork. Should be replaced with licensed company/team
          photography before production.
        */}
        <img
          src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=2000&q=80"
          alt="Close-up of a seedling emerging from rich soil"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <span className="inline-block font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary-container mb-5">
            Careers
          </span>
          <h1 className="font-sans text-[28px] md:text-[42px] lg:text-5xl font-extrabold leading-[1.15] mb-5 text-white max-w-2xl">
            Build Your Career in Indian Agriculture
          </h1>
          <p className="font-serif text-base md:text-lg text-white/80 max-w-xl leading-relaxed mb-10">
            We're looking for people who care about farmers as much as we do — in research, field operations,
            manufacturing, and beyond.
          </p>

          <div className="bg-white rounded-xl p-3 flex flex-col md:flex-row gap-2 max-w-4xl shadow-lg">
            <div className="relative flex-1">
              <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search job title..."
                className="w-full pl-11 pr-4 py-3 rounded-lg bg-slate-50 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="px-4 py-3 rounded-lg bg-slate-50 text-sm font-sans">
              <option value="all">All Locations</option>
              {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="px-4 py-3 rounded-lg bg-slate-50 text-sm font-sans">
              <option value="all">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | EmploymentType)} className="px-4 py-3 rounded-lg bg-slate-50 text-sm font-sans">
              <option value="all">All Types</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
            </select>
          </div>
        </div>
      </section>

      {/* Open Positions — primary content, first section after the fold */}
      <section className="relative z-10 bg-surface py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <div className="flex items-baseline justify-between gap-6 mb-12 pb-6 border-b border-primary/10">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight">Open Positions</h2>
            {!isLoading && (
              <span className="font-sans text-sm text-slate-400 shrink-0">
                {filteredJobs.length} {filteredJobs.length === 1 ? 'position' : 'positions'}
              </span>
            )}
          </div>

          {isLoading && <p className="font-sans text-sm text-primary/60 py-8">Loading positions...</p>}
          {!isLoading && filteredJobs.length === 0 && (
            <p className="font-sans text-sm text-primary/60 py-8">No open positions match your filters right now.</p>
          )}

          <div className="flex flex-col divide-y divide-primary/10">
            {filteredJobs.map((job) => {
              const department = departments.find((d) => d.id === job.departmentId);
              return (
                <Link
                  key={job.id}
                  to={`/career/${job.slug}`}
                  className="group py-8 flex flex-col md:flex-row md:items-start gap-4 md:gap-8"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-2">
                      <h3 className="font-sans text-lg font-bold text-primary group-hover:underline underline-offset-4">{job.title}</h3>
                      {job.featured && <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-secondary">Featured</span>}
                      {job.urgentHiring && <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wide text-red-600">Urgent Hiring</span>}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 font-sans font-medium mb-3">
                      {department && <span>{department.name}</span>}
                      {job.location && <span>{job.location}</span>}
                      <span>{job.employmentType}</span>
                      {job.experience && <span>{job.experience}</span>}
                      {job.publishAt && (
                        <span>Posted {new Date(job.publishAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                    </div>

                    {job.overview && (
                      <p className="text-sm text-on-surface-variant font-serif leading-relaxed max-w-2xl line-clamp-2">{job.overview}</p>
                    )}
                  </div>

                  <div className="shrink-0 self-start md:self-center">
                    <span className="inline-flex items-center gap-1.5 font-sans text-sm font-bold text-primary">
                      View Details
                      <Icons.ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Join Us — alternating rows, consistent aspect ratio and grid alignment */}
      <section className="relative z-10 bg-white py-20 md:py-28 border-t border-primary/5">
        <div className="max-w-4xl mx-auto px-8 mb-16">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3 block">Why Join Us</span>
          <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary tracking-tight max-w-lg">
            What it's like to work at Karan Arjun Pvt. Ltd.
          </h2>
        </div>

        <div className="max-w-4xl mx-auto px-8 flex flex-col gap-20 md:gap-28">
          {[
            {
              title: 'Working Culture',
              desc: 'We work closely with the farmers our products serve — decisions are grounded in field reality, not assumptions made from a distance.',
              image: 'https://images.unsplash.com/photo-1707721690626-10e5f0366bcb?auto=format&fit=crop&w=1200&q=80',
              alt: 'A group of people working together in a field',
            },
            {
              title: 'Growth',
              desc: 'As the company grows from a single product into a broader agricultural business, there is real room to grow with it — in scope, responsibility, and impact.',
              image: 'https://images.unsplash.com/photo-1498408040764-ab6eb772a145?auto=format&fit=crop&w=1200&q=80',
              alt: 'Vibrant green wheat field in daylight',
            },
            {
              title: 'Agriculture Impact',
              desc: 'The work we do reaches thousands of farmers across India — every role here, whether in research, sales, or operations, connects back to that impact.',
              image: 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=1200&q=80',
              alt: 'Hands planting a seedling into dark soil',
            },
          ].map((row, index) => {
            const isEven = index % 2 === 0;
            return (
              <div key={row.title} className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-10 md:gap-14`}>
                <div className="w-full md:w-5/12">
                  <div className="relative rounded-lg overflow-hidden aspect-[4/3]">
                    <img src={row.image} alt={row.alt} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                </div>
                <div className="w-full md:w-7/12 flex flex-col">
                  <h3 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-3">{row.title}</h3>
                  <p className="text-on-surface-variant font-serif text-base leading-relaxed max-w-md">{row.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
