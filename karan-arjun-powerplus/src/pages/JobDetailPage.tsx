import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useCareerData } from '../hooks/useCareerData';
import { ApplyForm } from '../components/career/ApplyForm';

const employmentTypeSchema: Record<string, string> = {
  'Full-time': 'FULL_TIME',
  'Part-time': 'PART_TIME',
  Contract: 'CONTRACTOR',
  Internship: 'INTERN',
};

/**
 * Job detail page — /career/:jobSlug. Mirrors CropDetailPage.tsx's structure
 * (hero + conditional sections + related items), but with a single route
 * param since jobs aren't nested under a parent category the way crops are
 * nested under cropCategories.
 */
export default function JobDetailPage() {
  const { jobSlug } = useParams<{ jobSlug: string }>();
  const { jobs, departments, isLoading } = useCareerData();
  const [showApply, setShowApply] = useState(false);

  const job = jobs.find((j) => j.slug === jobSlug);
  const department = job ? departments.find((d) => d.id === job.departmentId) : undefined;
  const relatedJobs = job ? jobs.filter((j) => j.id !== job.id && j.departmentId === job.departmentId).slice(0, 3) : [];

  const seoTitle = job?.seo.metaTitle || (job ? `${job.title} | Careers | Karan Arjun Pvt. Ltd.` : 'Careers');
  const seoDescription = job?.seo.metaDescription || job?.overview;

  usePageSeo({
    title: seoTitle,
    description: seoDescription,
    keywords: job?.seo.keywords,
    ogImage: job?.seo.ogImage || job?.heroImage,
    structuredData: job
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'JobPosting',
            title: job.title,
            description: job.overview,
            datePosted: job.publishAt || undefined,
            validThrough: job.applicationDeadline || undefined,
            employmentType: employmentTypeSchema[job.employmentType] || 'FULL_TIME',
            hiringOrganization: {
              '@type': 'Organization',
              name: 'Karan Arjun Pvt. Ltd.',
            },
            jobLocation: {
              '@type': 'Place',
              address: { '@type': 'PostalAddress', addressLocality: job.location, addressCountry: 'IN' },
            },
            ...(job.showSalary && job.salaryMin && job.salaryMax
              ? {
                  baseSalary: {
                    '@type': 'MonetaryAmount',
                    currency: 'INR',
                    value: { '@type': 'QuantitativeValue', minValue: job.salaryMin, maxValue: job.salaryMax, unitText: 'MONTH' },
                  },
                }
              : {}),
          },
        ]
      : [],
  });

  if (!isLoading && !job) {
    return <Navigate to="/career" replace />;
  }

  if (!job) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      {/* Hero */}
      <section className="relative min-h-[50vh] flex items-end overflow-hidden">
        {job.heroImage ? (
          <img src={job.heroImage} alt={job.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/career" className="hover:text-white transition-colors">Careers</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{job.title}</span>
          </nav>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {job.featured && <span className="px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase bg-secondary-container/30 text-secondary-container">Featured</span>}
            {job.urgentHiring && <span className="px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase bg-red-500/20 text-red-100">Urgent Hiring</span>}
          </div>
          <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-white mb-4">{job.title}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70 font-sans font-medium">
            {department && <span>{department.name}</span>}
            {job.location && <span>{job.location}</span>}
            <span>{job.employmentType}</span>
            {job.experience && <span>{job.experience}</span>}
          </div>
        </div>
      </section>

      <div className="relative z-10 bg-surface py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main content */}
          <div className="lg:col-span-2 flex flex-col gap-12">
            {job.overview && (
              <div>
                <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary mb-4 block">Overview</span>
                <p className="font-serif text-lg text-primary leading-relaxed">{job.overview}</p>
              </div>
            )}

            {job.responsibilities.length > 0 && (
              <div>
                <h2 className="font-sans text-2xl font-extrabold text-primary mb-4">Responsibilities</h2>
                <ul className="flex flex-col gap-3">
                  {job.responsibilities.map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-on-surface-variant font-serif leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-2.5 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.requirements.length > 0 && (
              <div>
                <h2 className="font-sans text-2xl font-extrabold text-primary mb-4">Requirements</h2>
                <ul className="flex flex-col gap-3">
                  {job.requirements.map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-on-surface-variant font-serif leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-2.5 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.preferredSkills.length > 0 && (
              <div>
                <h2 className="font-sans text-2xl font-extrabold text-primary mb-4">Preferred Skills</h2>
                <ul className="flex flex-col gap-3">
                  {job.preferredSkills.map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-on-surface-variant font-serif leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-2.5 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.qualifications.length > 0 && (
              <div>
                <h2 className="font-sans text-2xl font-extrabold text-primary mb-4">Qualifications</h2>
                <ul className="flex flex-col gap-3">
                  {job.qualifications.map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-on-surface-variant font-serif leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-2.5 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.benefits.length > 0 && (
              <div>
                <h2 className="font-sans text-2xl font-extrabold text-primary mb-4">Benefits</h2>
                <ul className="flex flex-col gap-3">
                  {job.benefits.map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-on-surface-variant font-serif leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-2.5 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 flex flex-col gap-5">
              <h3 className="font-sans text-lg font-bold text-primary">Job Overview</h3>
              <div className="flex flex-col gap-3 text-sm font-sans">
                {department && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Department</span>
                    <span className="font-semibold text-primary">{department.name}</span>
                  </div>
                )}
                {job.location && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Location</span>
                    <span className="font-semibold text-primary">{job.location}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Employment Type</span>
                  <span className="font-semibold text-primary">{job.employmentType}</span>
                </div>
                {job.experience && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Experience</span>
                    <span className="font-semibold text-primary">{job.experience}</span>
                  </div>
                )}
                {job.showSalary && job.salaryMin && job.salaryMax && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Salary</span>
                    <span className="font-semibold text-primary">₹{job.salaryMin} - ₹{job.salaryMax}</span>
                  </div>
                )}
                {job.applicationDeadline && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Apply By</span>
                    <span className="font-semibold text-primary">{new Date(job.applicationDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {job.acceptApplications ? (
                <button
                  onClick={() => setShowApply(true)}
                  className="w-full py-3.5 bg-primary text-secondary-container rounded-xl font-sans font-bold text-sm hover:bg-primary-container transition-colors"
                >
                  Apply Now
                </button>
              ) : (
                <p className="text-sm text-slate-400 font-sans text-center py-3">Applications are closed for this position.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Related Jobs */}
      {relatedJobs.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-6xl mx-auto px-8">
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-12 tracking-tight text-center">Related Positions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedJobs.map((related) => (
                <Link
                  key={related.id}
                  to={`/career/${related.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow p-6"
                >
                  <h3 className="font-sans font-bold text-primary mb-2">{related.title}</h3>
                  <p className="text-xs text-slate-400 font-sans">{related.location} · {related.employmentType}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {showApply && <ApplyForm job={job} onClose={() => setShowApply(false)} />}
    </div>
  );
}
