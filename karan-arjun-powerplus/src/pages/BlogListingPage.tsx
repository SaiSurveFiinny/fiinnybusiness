import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';
import type { Blog } from '../data/resources';

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
}

/**
 * Blog listing — /resources/blogs (formerly the standalone /blog page,
 * which now redirects here — see App.tsx). Rendering is preserved exactly
 * from the original pages/Blog.tsx: card grid + modal detail view, same
 * fields, same image/video/link handling. Only the data source changed
 * (useResourcesData's shared subscription instead of its own onSnapshot)
 * and a usePageSeo call was added, since the original page had none.
 */
export default function BlogListingPage() {
  const { blogs, isLoading } = useResourcesData();
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);

  usePageSeo({
    title: 'Blog | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Simple, expert advice to maximize your crop yield and ensure soil health.',
  });

  return (
    <div className="flex flex-col pt-32 pb-16 px-8 max-w-7xl mx-auto min-h-screen">
      <nav className="flex items-center gap-2 mb-8 text-xs font-sans font-bold text-primary/50 uppercase tracking-widest">
        <Link to="/resources" className="hover:text-primary transition-colors">Resources</Link>
        <Icons.ChevronRight className="w-3 h-3" />
        <span className="text-primary">Blogs</span>
      </nav>

      <header className="text-center max-w-3xl mx-auto space-y-4 mb-16">
        <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-primary leading-tight">
          Agricultural Insights
        </h1>
        <p className="text-base md:text-lg text-on-surface-variant font-serif">
          Simple, expert advice to maximize your crop yield and ensure soil health.
        </p>
      </header>

      {isLoading && <p className="text-center font-sans font-semibold text-primary/70 mb-8">Loading blogs...</p>}

      {!isLoading && blogs.length === 0 && (
        <p className="text-center font-sans font-semibold text-primary/70 mb-8">No blog posts published yet.</p>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {blogs.map((blog) => (
          <article key={blog.id} className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-shadow flex flex-col">
            {blog.imageUrls && blog.imageUrls.length > 0 && (
              <img src={blog.imageUrls[0]} alt={blog.title} className="w-full h-48 object-cover rounded-2xl mb-6" />
            )}
            <div className="flex items-center justify-between mb-6">
              <span className="px-3 py-1 bg-primary/5 text-primary text-[10px] font-sans font-bold rounded-full uppercase tracking-widest">
                {blog.category}
              </span>
              <span className="text-xs text-slate-400 font-sans font-medium">{blog.date}</span>
            </div>
            <h3 className="font-sans text-xl font-bold text-primary mb-4 leading-snug">{blog.title}</h3>
            <p className="text-sm text-on-surface-variant font-serif mb-8 flex-grow">{blog.excerpt}</p>
            <button
              onClick={() => setSelectedBlog(blog)}
              className="flex items-center gap-2 font-sans font-bold text-primary text-sm hover:text-secondary-container transition-colors mt-auto w-fit"
            >
              Read Article <Icons.ArrowRight className="w-4 h-4" />
            </button>
          </article>
        ))}
      </section>

      {selectedBlog && (
        <div className="fixed inset-0 bg-black/60 z-50 p-4 md:p-8 flex items-center justify-center">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2rem] p-6 md:p-8 relative">
            <button onClick={() => setSelectedBlog(null)} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close article">
              <Icons.X className="w-5 h-5" />
            </button>
            <span className="inline-block px-3 py-1 bg-primary/5 text-primary text-[10px] font-sans font-bold rounded-full uppercase tracking-widest mb-3">
              {selectedBlog.category}
            </span>
            <h2 className="font-sans text-2xl md:text-3xl font-extrabold text-primary mb-2 pr-10">{selectedBlog.title}</h2>
            <p className="text-xs text-slate-400 font-sans font-medium mb-6">{selectedBlog.date}</p>

            {selectedBlog.imageUrls && selectedBlog.imageUrls.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {selectedBlog.imageUrls.map((imageUrl) => (
                  <img key={imageUrl} src={imageUrl} alt={selectedBlog.title} className="w-full h-56 object-cover rounded-xl" />
                ))}
              </div>
            )}

            {(selectedBlog.content || selectedBlog.excerpt) && (
              <div className="space-y-4 text-sm md:text-base text-on-surface-variant font-serif leading-relaxed mb-6">
                {(selectedBlog.content || selectedBlog.excerpt)
                  .split('\n')
                  .filter((line) => line.trim().length > 0)
                  .map((line) => <p key={line}>{line}</p>)}
              </div>
            )}

            {selectedBlog.videoUrls && selectedBlog.videoUrls.length > 0 && (
              <div className="mb-6">
                <h3 className="font-sans font-bold text-primary mb-3">Videos</h3>
                <div className="space-y-4">
                  {selectedBlog.videoUrls.map((videoUrl) => (
                    <div key={videoUrl} className="space-y-2">
                      {isDirectVideoUrl(videoUrl) ? (
                        <video controls className="w-full rounded-xl bg-black/90">
                          <source src={videoUrl} />
                        </video>
                      ) : (
                        <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary font-sans font-semibold hover:underline">
                          Watch Video <Icons.ArrowRight className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedBlog.links && selectedBlog.links.length > 0 && (
              <div>
                <h3 className="font-sans font-bold text-primary mb-3">Useful Links</h3>
                <div className="space-y-2">
                  {selectedBlog.links.map((link) => (
                    <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="block text-sm text-primary hover:underline font-sans">
                      {link.label || link.url}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
