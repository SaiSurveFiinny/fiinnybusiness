import { Link, Navigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useCropSolutions } from '../hooks/useCropSolutions';

/**
 * Category page — e.g. /crop-solutions/fruits — displays every published
 * crop within a category as an editorial card grid, each linking to its own
 * detail page at /crop-solutions/:category/:crop.
 */
export default function CropCategoryPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const { categories, crops, isLoading } = useCropSolutions();

  const category = categories.find((c) => c.slug === categorySlug);
  const categoryCrops = category ? crops.filter((c) => c.categoryId === category.id).sort((a, b) => a.order - b.order) : [];

  usePageSeo({
    title: category ? `${category.name} | Crop Solutions | Karan Arjun Pvt. Ltd.` : 'Crop Solutions',
    description: category?.description,
  });

  if (!isLoading && !category) {
    return <Navigate to="/crop-solutions" replace />;
  }

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative min-h-[45vh] flex items-end overflow-hidden">
        {category?.coverImage ? (
          <img src={category.coverImage} alt={category.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/20" />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-8 md:px-12 pb-14 pt-32">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/crop-solutions" className="hover:text-white transition-colors">Crop Solutions</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">{category?.name}</span>
          </nav>
          <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-white mb-4">{category?.name}</h1>
          {category?.description && (
            <p className="font-serif text-base md:text-lg text-white/80 max-w-2xl">{category.description}</p>
          )}
        </div>
      </section>

      <section className="relative z-10 bg-surface py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-8">
          {isLoading && <p className="text-center font-sans font-semibold text-primary/70">Loading crops...</p>}
          {!isLoading && categoryCrops.length === 0 && (
            <p className="text-center font-sans font-semibold text-primary/70">No crops published in this category yet.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {categoryCrops.map((crop) => (
              <Link
                key={crop.id}
                to={`/crop-solutions/${category?.slug}/${crop.slug}`}
                className="group bg-white rounded-[2rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="aspect-[4/3] relative overflow-hidden bg-primary/5">
                  {crop.heroImage && (
                    <img src={crop.heroImage} alt={crop.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  )}
                </div>
                <div className="p-6">
                  <h3 className="font-sans text-xl font-bold text-primary mb-2">{crop.name}</h3>
                  <p className="text-sm text-on-surface-variant font-serif line-clamp-2">{crop.shortDescription}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
