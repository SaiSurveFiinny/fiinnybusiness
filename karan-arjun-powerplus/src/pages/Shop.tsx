import { motion } from 'motion/react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { ProductsHero } from '../components/products/ProductsHero';
import { useCart } from '../context/CartContext';
import { db } from '../lib/firebase';
import { displayPrice, getPurchaseUrl, isProductPubliclyVisible, normalizeProduct, primaryImage, type ProductDetail } from '../data/products';

export default function Shop() {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const firestoreProducts = snapshot.docs
        .map((docItem) => normalizeProduct(docItem.id, docItem.data()))
        .filter(isProductPubliclyVisible);
      setProducts(firestoreProducts);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddToCart = (p: ProductDetail) => {
    const price = displayPrice(p);
    if (price === undefined) return;
    addToCart({
      id: p.id,
      name: p.name,
      price,
      image: primaryImage(p)?.url || '/bottle-1l-Photoroom.png',
      desc: p.tagline,
      badge: p.badges[0],
    });
  };

  const handleBuyNow = (p: ProductDetail) => {
    const purchaseUrl = getPurchaseUrl(p);
    if (!purchaseUrl) return;
    window.open(purchaseUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col relative min-h-screen">
      <ProductsHero />

      <div className="flex flex-col relative py-16 px-8 max-w-7xl mx-auto w-full">
        {/* Background Mesh */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-secondary-container/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]"></div>
        </div>

      <header className="text-center mb-16 relative z-10">
        <h1 className="font-sans text-[36px] md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-secondary">Premium Crop Nutrition</h1>
        <p className="text-base md:text-lg text-on-surface-variant max-w-2xl mx-auto font-serif">
          Choose the perfect size for your agricultural needs. Formulated with scientifically balanced micro-nutrients for optimal yield.
        </p>
      </header>

      {isLoading && (
        <div className="text-center mb-8 text-primary/70 font-sans font-semibold">Loading products...</div>
      )}

      {!isLoading && products.length === 0 && (
        <div className="text-center mb-8 text-primary/70 font-sans font-semibold">
          No products are published yet.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 mb-20 relative z-10">
        {products.map((p) => {
          const price = displayPrice(p);
          const image = primaryImage(p)?.url || '/bottle-1l-Photoroom.png';
          const purchaseUrl = getPurchaseUrl(p);
          return (
            <motion.div
              key={p.id}
              whileHover={{ y: -12 }}
              onClick={() => navigate(`/products/${p.slug}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/products/${p.slug}`); }}
              className={`flex flex-col glass-panel rounded-[2rem] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgba(10,25,19,0.12)] hover:border-white/60 cursor-pointer ${p.featured ? 'ring-2 ring-secondary-container shadow-[0_10px_30px_rgba(250,204,21,0.15)]' : ''}`}
            >
              {/* Fixed-height viewport (not aspect-ratio-based) so portrait/square/landscape/tall-bottle images all scale down consistently via object-contain instead of the container itself changing shape per image. Padding trimmed and height grown (reclaiming the space the badge row used to take above the image) so the image reads larger without changing overall card height. */}
              <div className="h-64 sm:h-72 pt-4 px-4 pb-2 flex items-center justify-center relative group">
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <motion.img
                  whileHover={{ scale: 1.08 }}
                  transition={{ duration: 0.4 }}
                  src={image}
                  alt={p.name}
                  className="max-h-full max-w-full object-contain drop-shadow-xl relative z-10"
                />
              </div>
              <div className="px-8 pb-8">
                <h3 className="font-sans text-2xl font-bold text-primary mb-1">{p.name}</h3>
                {p.badges[0] && (
                  <span className="inline-block bg-tertiary-container/10 text-tertiary-container px-3 py-1 rounded-full text-xs font-extrabold font-sans border border-tertiary-container/20 mb-2">
                    {p.badges[0]}
                  </span>
                )}
                {p.tagline && <p className="text-on-surface-variant mb-4 text-sm">{p.tagline}</p>}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="flex flex-col">
                    {price !== undefined ? (
                      <span className="text-3xl font-extrabold text-primary tracking-tight">₹{price.toLocaleString('en-IN')}</span>
                    ) : (
                      <span className="text-xl font-extrabold text-primary tracking-tight">Contact for Price</span>
                    )}
                  </div>
                  <Link
                    to={`/products/${p.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-sans font-bold text-primary hover:underline underline-offset-4 flex items-center gap-1 shrink-0"
                  >
                    View Details <Icons.ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddToCart(p); }}
                    disabled={price === undefined}
                    className="w-full px-2 py-3 rounded-xl font-sans font-bold transition-all border border-primary/20 text-primary hover:bg-primary/5 hover:-translate-y-1 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <Icons.ShoppingCart className="w-4 h-4" /> Add to Cart
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBuyNow(p); }}
                    disabled={!purchaseUrl}
                    title={purchaseUrl ? undefined : 'Online ordering coming soon.'}
                    className="w-full px-2 py-3 rounded-xl font-sans font-bold transition-all shadow-md bg-primary text-secondary-container hover:bg-primary-container hover:-translate-y-1 text-sm flex items-center justify-center gap-1 disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    {purchaseUrl ? <>Buy Now <Icons.ChevronRight className="w-4 h-4" /></> : 'Unavailable'}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Authenticity Section */}
      <section className="glass-panel-dark rounded-[2.5rem] p-8 md:p-14 flex flex-col lg:flex-row items-center gap-10 md:gap-16 relative z-10 overflow-hidden group">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-secondary/20 rounded-full blur-3xl group-hover:bg-secondary/30 transition-colors duration-700"></div>
        <div className="lg:w-1/2 text-center lg:text-left relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-secondary-container border border-white/10 mb-6">
            <Icons.ShieldCheck className="w-4 h-4" />
            <span className="font-sans font-bold text-xs uppercase tracking-widest">Quality Assured</span>
          </div>
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-white mb-6 leading-tight">Verify Authenticity Instantly</h2>
          <p className="text-sm md:text-lg text-white/70 mb-10">
            Every bottle of Power Plus™ comes with advanced security features to ensure you receive only the genuine formulation.
          </p>
          <div className="space-y-6">
            <div className="flex items-start gap-5 justify-center lg:justify-start">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-secondary-container border border-white/10">
                <Icons.ShieldCheck className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h4 className="font-sans font-bold text-white text-lg">Holographic Logo</h4>
                <p className="text-sm text-white/60 mt-1">Check for the official 3D holographic seal on every bottle.</p>
              </div>
            </div>
            <div className="flex items-start gap-5 justify-center lg:justify-start">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-secondary-container border border-white/10">
                <Icons.QrCode className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h4 className="font-sans font-bold text-white text-lg">Scan QR Code</h4>
                <p className="text-sm text-white/60 mt-1">Use your smartphone to scan the unique code on the cap.</p>
              </div>
            </div>
            <div className="pt-6 border-t border-white/10">
              <p className="text-sm text-white/50 font-serif">
                Suspect a counterfeit? Report it immediately to our official WhatsApp support channel.
              </p>
            </div>
          </div>
        </div>
        <div className="w-full lg:w-1/2 glass-panel rounded-3xl p-8 md:p-12 border-white/30 shadow-2xl flex flex-col items-center text-center relative z-10 transform transition-transform duration-500 hover:scale-[1.02]">
          <div className="w-32 h-32 md:w-48 md:h-48 border-2 border-dashed border-primary/20 rounded-2xl flex items-center justify-center mb-6 md:mb-8 bg-white/50 backdrop-blur-sm">
            <Icons.QrCode className="w-12 h-12 md:w-16 md:h-16 text-primary" />
          </div>
          <h4 className="font-sans text-xl md:text-2xl font-extrabold text-primary mb-2">Scan to Verify</h4>
          <p className="text-sm text-on-surface-variant mb-6">Validating product serial...</p>
          <div className="bg-tertiary-container/10 px-5 md:px-6 py-2.5 rounded-full flex items-center gap-2 text-tertiary-container font-sans font-bold text-xs md:text-sm border border-tertiary-container/20">
            <Icons.CheckCircle2 className="w-5 h-5" />
            <span>Genuine Product Verified</span>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
