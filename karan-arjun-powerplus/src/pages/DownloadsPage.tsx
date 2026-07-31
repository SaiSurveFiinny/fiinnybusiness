import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** Downloads — /resources/downloads. No detail route; each item links straight to its file, matching CaseStudy's PDF-link pattern rather than a full editorial page. */
export default function DownloadsPage() {
  const { downloads, isLoading } = useResourcesData();

  usePageSeo({
    title: 'Downloads | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Guides and reference documents available for download.',
  });

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">Downloads</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">Downloads</h1>
          <p className="font-serif text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
            Guides and reference documents available for download.
          </p>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading downloads...</p>}
          {!isLoading && downloads.length === 0 && <p className="font-sans text-sm text-primary/60">No downloads available yet.</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {downloads.map((download) => (
              <a
                key={download.id}
                href={download.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="group bg-white rounded-lg border border-slate-200 hover:shadow-md transition-shadow p-6 flex items-start gap-4"
              >
                {download.thumbnail ? (
                  <img src={download.thumbnail} alt={download.title} className="w-14 h-14 object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                    <Icons.Download className="w-5 h-5 text-primary/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-sans font-bold text-primary group-hover:underline underline-offset-4">{download.title}</h3>
                  {download.description && <p className="text-sm text-on-surface-variant font-serif leading-relaxed mt-1 line-clamp-2">{download.description}</p>}
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wide text-slate-400 mt-2 block">{download.fileType} · {download.category}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
