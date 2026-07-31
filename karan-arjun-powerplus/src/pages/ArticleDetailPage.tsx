import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** Article detail page — /resources/articles/:slug. Mirrors StoryDetailPage.tsx's structure (hero, BreadcrumbList + Article JSON-LD, related items). */
export default function ArticleDetailPage() {
  const { articleSlug } = useParams<{ articleSlug: string }>();
  const { articles, isLoading } = useResourcesData();

  const article = articles.find((a) => a.slug === articleSlug);
  const relatedArticles = article ? articles.filter((a) => a.id !== article.id && a.category === article.category).slice(0, 3) : [];

  usePageSeo({
    title: article?.seo.metaTitle || (article ? `${article.title} | Resources | Karan Arjun Pvt. Ltd.` : 'Resources'),
    description: article?.seo.metaDescription || article?.excerpt,
    keywords: article?.seo.keywords,
    ogImage: article?.seo.ogImage || article?.coverImage,
    structuredData: article
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Resources', item: `${window.location.origin}/resources` },
              { '@type': 'ListItem', position: 2, name: 'Articles', item: `${window.location.origin}/resources/articles` },
              { '@type': 'ListItem', position: 3, name: article.title, item: window.location.href },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: article.excerpt,
            image: article.coverImage || undefined,
            datePublished: article.publishDate || undefined,
            author: { '@type': 'Person', name: article.author || 'Karan Arjun Pvt. Ltd.' },
            publisher: { '@type': 'Organization', name: 'Karan Arjun Pvt. Ltd.' },
          },
        ]
      : [],
  });

  if (!isLoading && !article) return <Navigate to="/resources/articles" replace />;
  if (!article) return <div className="min-h-screen flex items-center justify-center font-sans text-primary/60">Loading...</div>;

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative min-h-[45vh] flex items-end overflow-hidden">
        {article.coverImage ? (
          <img src={article.coverImage} alt={article.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />
        <div className="relative z-10 w-full max-w-3xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <Link to="/resources/articles" className="hover:text-white transition-colors">Articles</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{article.title}</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4 leading-tight">{article.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70 font-sans font-medium">
            {article.category && <span>{article.category}</span>}
            {article.author && <span>{article.author}</span>}
            {article.publishDate && <span>{new Date(article.publishDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8">
          {article.content && <p className="font-serif text-lg text-primary leading-relaxed whitespace-pre-line">{article.content}</p>}
        </div>
      </div>

      {relatedArticles.length > 0 && (
        <section className="relative z-10 bg-surface py-16 md:py-24 border-t border-primary/5">
          <div className="max-w-5xl mx-auto px-8">
            <h2 className="font-sans text-2xl md:text-[28px] font-extrabold text-primary mb-10 tracking-tight text-center">Related Articles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedArticles.map((related) => (
                <Link key={related.id} to={`/resources/articles/${related.slug}`} className="group bg-white rounded-lg overflow-hidden border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="aspect-[16/10] relative overflow-hidden bg-primary/5">
                    {related.coverImage && <img src={related.coverImage} alt={related.title} className="absolute inset-0 w-full h-full object-cover" />}
                  </div>
                  <div className="p-5">
                    <h3 className="font-sans font-bold text-primary group-hover:underline underline-offset-4">{related.title}</h3>
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
