import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useCropSolutions } from '../hooks/useCropSolutions';

/**
 * Crop Solutions landing page — organizes agricultural knowledge by crop
 * category (not by product; products live at /products). Hero + category
 * showcase + featured crops + search, all backed by the same
 * cropCategories/crops Firestore collections the Admin manager writes to.
 */
export default function CropSolutionsLanding() {
  const { categories, crops, isLoading } = useCropSolutions();
  const [searchTerm, setSearchTerm] = useState('');

  usePageSeo({
    title: 'Crop Solutions | Karan Arjun Pvt. Ltd.',
    description: 'Agricultural knowledge and solutions organized by crop — common problems, recommended practices, and expert guidance for Indian farmers.',
  });

  const featuredCrops = useMemo(() => crops.filter((c) => c.featured).slice(0, 6), [crops]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return crops.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 8);
  }, [crops, searchTerm]);

  const cropCountForCategory = (categoryId: string) => crops.filter((c) => c.categoryId === categoryId).length;

  return (
    <div className="flex flex-col relative">
      {/* Hero */}
      <section className="relative min-h-[60vh] flex items-end overflow-hidden">
        {/*
          Interim asset: verified real Unsplash photo of a lush green field.
          Should be replaced with licensed company photography before production.
        */}
        <img
          src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=2000&q=80"
          alt="Close-up of a seedling emerging from rich soil"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/75 to-primary/30" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-8 md:px-12 pb-16 pt-32">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-secondary-container border border-white/10 mb-6 text-xs font-sans font-bold uppercase tracking-widest">
            <Icons.Leaf className="w-3.5 h-3.5" /> Crop Solutions
          </span>
          <h1 className="font-sans text-[32px] md:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6 text-white max-w-3xl">
            Agricultural Knowledge, Organized by Crop
          </h1>
          <p className="font-serif text-base md:text-lg text-white/80 max-w-2xl leading-relaxed mb-10">
            Explore common problems, recommended practices, and expert guidance for the crops you grow — a knowledge
            center built for Indian farming conditions.
          </p>

          <div className="relative max-w-lg">
            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by crop name..."
              className="w-full pl-11 pr-4 py-3.5 rounded-full bg-white/95 backdrop-blur-md text-sm font-sans focus:outline-none focus:ring-2 focus:ring-secondary-container"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-20 mt-2 w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                {searchResults.map((crop) => {
                  const category = categories.find((c) => c.id === crop.categoryId);
                  if (!category) return null;
                  return (
                    <Link
                      key={crop.id}
                      to={`/crop-solutions/${category.slug}/${crop.slug}`}
                      onClick={() => setSearchTerm('')}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      {crop.heroImage && <img src={crop.heroImage} alt="" className="w-8 h-8 rounded-lg object-cover" />}
                      <span className="font-sans text-sm font-semibold text-primary">{crop.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{category.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Category Showcase */}
      <section className="relative z-10 bg-surface py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8 text-center mb-14">
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">Browse by Category</h2>
          <p className="font-serif text-lg text-on-surface-variant">Solutions organized around the crops Indian farmers grow.</p>
        </div>

        {isLoading && <p className="text-center font-sans font-semibold text-primary/70">Loading categories...</p>}
        {!isLoading && categories.length === 0 && (
          <p className="text-center font-sans font-semibold text-primary/70">No crop categories published yet.</p>
        )}

        <div className="max-w-6xl mx-auto px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/crop-solutions/${category.slug}`}
              className="group relative rounded-[2rem] overflow-hidden aspect-[4/3] border border-slate-100"
            >
              {category.coverImage ? (
                <img src={category.coverImage} alt={category.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="absolute inset-0 bg-primary/5 flex items-center justify-center">
                  <Icons.Layers className="w-10 h-10 text-primary/20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="font-sans text-xl font-extrabold text-white mb-1">{category.name}</h3>
                <p className="text-white/70 text-sm font-serif">{cropCountForCategory(category.id)} crop guide(s)</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Crops */}
      {featuredCrops.length > 0 && (
        <section className="relative z-10 bg-primary py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-8 mb-12">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-secondary-container mb-4 block">Featured</span>
            <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white">Popular Crop Guides</h2>
          </div>
          <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredCrops.map((crop) => {
              const category = categories.find((c) => c.id === crop.categoryId);
              if (!category) return null;
              return (
                <Link
                  key={crop.id}
                  to={`/crop-solutions/${category.slug}/${crop.slug}`}
                  className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 transition-colors"
                >
                  <div className="aspect-[16/10] relative overflow-hidden">
                    {crop.heroImage && <img src={crop.heroImage} alt={crop.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                  </div>
                  <div className="p-5">
                    <h3 className="font-sans font-bold text-white text-lg mb-1">{crop.name}</h3>
                    <p className="text-white/60 text-sm font-serif line-clamp-2">{crop.shortDescription}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Educational CTA */}
      <section className="relative z-10 bg-surface py-16 md:py-24">
        <div className="max-w-2xl mx-auto px-8 text-center">
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-4 tracking-tight">
            Have a Question About Your Crop?
          </h2>
          <p className="font-serif text-lg text-on-surface-variant mb-10">
            Reach out to our team for guidance specific to your farm and growing conditions.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 bg-primary text-secondary-container px-8 py-4 rounded-full font-sans font-bold hover:bg-primary-container transition-colors shadow-xl uppercase tracking-widest text-sm"
          >
            Contact Us <Icons.ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
