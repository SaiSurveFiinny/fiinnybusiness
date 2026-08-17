"use client";

/**
 * Interactive product grid for a store page.
 *
 * The store page is a server component (415 of these are statically prerendered
 * for search), so the crawlable product links stay in the server HTML and this
 * client island renders the shopping UI on top — the same split
 * /brand/[slug]/page.tsx already uses with its sr-only <nav> plus BrandView.
 *
 * The card markup deliberately mirrors the Market grid and the brand page card:
 * discount ribbon, "From ₹X ₹Y" pricing, one compact button on mobile and
 * Add to Cart + Buy Now on desktop. A buyer who learns the controls on Market
 * should meet the same controls here.
 *
 * Cross-seller pricing (lowestPrice / lowestFinalPrice) is NOT stored on a
 * product doc — it is computed by the marketplace merge — so, exactly as
 * BrandView does, it is fetched client-side and keyed by lowercased name. Until
 * it arrives the card shows the catalog price with no ribbon, never a wrong one.
 */

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { fetchMarketplaceProducts } from "../../firebase";
import type { MarketplaceProduct } from "../../../types/product";
import { useSharedCart } from "../../lib/useSharedCart";

export interface StoreGridProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  slug: string;
}

export default function StoreProductGrid({
  products,
  storeName,
}: {
  products: StoreGridProduct[];
  storeName: string;
}) {
  const { addToCart, isInCart } = useSharedCart();
  const [marketByName, setMarketByName] = useState<Map<string, MarketplaceProduct>>(
    new Map(),
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMarketplaceProducts()
      .then((all) => {
        if (cancelled) return;
        setMarketByName(new Map(all.map((p) => [p.name.toLowerCase().trim(), p])));
      })
      .catch(() => { /* cards still render at the catalog price */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const marketFor = (p: StoreGridProduct) =>
    marketByName.get(p.name.toLowerCase().trim());

  const add = (p: StoreGridProduct): boolean => {
    const market = marketFor(p);
    return addToCart(
      market ??
        ({
          id: p.id,
          name: p.name,
          image: p.image,
          price: p.price,
        } as MarketplaceProduct),
    );
  };

  const handleAdd = (p: StoreGridProduct) => {
    setToast(
      add(p)
        ? `${p.name} added to cart.`
        : "This product is not available for online ordering.",
    );
  };

  const handleBuyNow = (p: StoreGridProduct) => {
    if (!isInCart(marketFor(p)?.id ?? p.id)) {
      if (!add(p)) {
        setToast("This product is not available for online ordering.");
        return;
      }
    }
    window.location.href = "/?view=cart";
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => {
          const market = marketFor(p);
          const base = market?.lowestPrice ?? market?.price ?? p.price;
          const final = market?.lowestFinalPrice ?? base;
          const showsDiscount = final < base;
          const savingsPct =
            showsDiscount && base > 0 ? Math.round((1 - final / base) * 100) : 0;
          const orderable = market ? market.sellMode !== "offline_store_only" : true;
          const inCart = isInCart(market?.id ?? p.id);

          return (
            <article
              key={p.id}
              className={`flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all hover:shadow-md ${
                showsDiscount
                  ? "border-green-400 shadow-green-100 hover:shadow-green-200"
                  : "border-surface-container hover:border-primary/40"
              }`}
            >
              <a href={`/products/${p.slug}`} className="group block">
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#f7f5f0] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                  {showsDiscount && savingsPct > 0 ? (
                    <div className="pointer-events-none absolute left-0 top-0 h-24 w-24 overflow-hidden">
                      <div
                        className="absolute bg-green-500 text-center text-white shadow-md"
                        style={{
                          width: 130,
                          top: 20,
                          left: -32,
                          transform: "rotate(-45deg)",
                          padding: "5px 0",
                        }}
                      >
                        <span className="flex items-center justify-center gap-0.5 text-[10px] font-black tracking-wide">
                          <Tag className="h-2.5 w-2.5 shrink-0" />
                          {savingsPct}% OFF
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </a>

              <div
                className={`flex flex-1 flex-col gap-0.5 p-2.5 md:p-4 ${
                  showsDiscount ? "bg-gradient-to-b from-green-50/30 to-white" : ""
                }`}
              >
                <a href={`/products/${p.slug}`} className="hover:text-primary">
                  <p className="line-clamp-2 text-xs font-bold leading-tight text-on-surface md:text-sm">
                    {p.name}
                  </p>
                </a>

                <div className="mt-1.5">
                  {showsDiscount ? (
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-outline">
                        From
                      </span>
                      <span className="text-base font-black leading-none text-green-700 md:text-lg">
                        ₹{final.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs font-semibold leading-none text-outline line-through">
                        ₹{base.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-extrabold text-secondary md:text-base">
                      ₹{base.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>

                {orderable ? (
                  <div className="mt-2">
                    {inCart ? (
                      <>
                        <a
                          href="/?view=cart"
                          className="block w-full rounded-lg border-2 border-green-600 py-1.5 text-center text-xs font-bold text-green-700 transition-colors hover:bg-green-600 hover:text-white md:hidden"
                        >
                          ✓ In Cart
                        </a>
                        <div className="hidden gap-1 md:flex">
                          <a
                            href="/?view=cart"
                            className="flex-1 rounded-lg border-2 border-green-600 py-1.5 text-center text-xs font-bold text-green-700 transition-colors hover:bg-green-600 hover:text-white"
                          >
                            Go to Cart
                          </a>
                          <button
                            type="button"
                            onClick={() => handleBuyNow(p)}
                            className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary/90"
                          >
                            Buy Now
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAdd(p)}
                          className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary/90 md:hidden"
                        >
                          <span className="text-sm font-black leading-none">+</span> Add
                        </button>
                        <div className="hidden gap-1 md:flex">
                          <button
                            type="button"
                            onClick={() => handleAdd(p)}
                            className="flex-1 rounded-lg border-2 border-primary py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-white"
                          >
                            Add to Cart
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBuyNow(p)}
                            className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary/90"
                          >
                            Buy Now
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-on-surface px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}
