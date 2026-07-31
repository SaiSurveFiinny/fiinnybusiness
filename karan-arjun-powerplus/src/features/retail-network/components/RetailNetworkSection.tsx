import { useEffect, useMemo, useRef, useState } from 'react';
import { useRetailNetwork } from '../hooks/useRetailNetwork';
import { RetailMap } from './RetailMap';
import { RetailerList } from './RetailerList';

/**
 * "Our Retail Network" homepage section — reads live, read-only data from
 * the separate KrishiDukan Firebase project (see api/krishiFirebaseClient.ts)
 * to show Karan Arjun's connected retail partners on a map + synchronized
 * list. Purely a display feature: no editing, no auth, no writes anywhere
 * in this module. Data fetch is deferred until the section scrolls into
 * view (IntersectionObserver) so it never costs a Firestore read on
 * homepage load for visitors who don't scroll this far.
 */
export function RetailNetworkSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return;
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  const { manufacturer, retailers, isLoading, error, selectedRetailerId, setSelectedRetailerId } = useRetailNetwork(isVisible);

  // `retailers` already includes the manufacturer as its first entry (see
  // useRetailNetwork), so its length IS the total location count — no
  // separate +1 needed, and this can never drift out of sync with what the
  // map/list actually render since all three read the same array.
  const states = useMemo(() => new Set(retailers.map((r) => r.address.state).filter(Boolean)), [retailers]);

  return (
    <section ref={sectionRef} className="relative z-10 bg-white py-20 md:py-28 border-t border-primary/5">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div className="max-w-xl">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-4 block">
              Where to Find Us
            </span>
            <h2 className="font-sans text-3xl md:text-[40px] font-extrabold text-primary tracking-tight leading-[1.1] mb-4">
              Our Retail Network
            </h2>
            <p className="font-serif text-base text-on-surface-variant leading-relaxed">
              Available through verified retail partners across Maharashtra.
            </p>
          </div>

          {retailers.length > 0 && (
            <div className="flex gap-8">
              <div>
                <p className="text-2xl font-sans font-black text-primary">{retailers.length}</p>
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 font-sans">Locations</p>
              </div>
              <div>
                <p className="text-2xl font-sans font-black text-primary">{states.size || 1}</p>
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 font-sans">
                  {states.size === 1 ? 'State' : 'States'}
                </p>
              </div>
            </div>
          )}
        </div>

        {!isVisible || isLoading ? (
          <div className="h-[420px] rounded-lg border border-slate-200 flex items-center justify-center">
            <p className="font-sans text-sm text-on-surface-variant">
              {isVisible ? 'Loading retail network...' : ''}
            </p>
          </div>
        ) : error || !manufacturer ? (
          <div className="h-[420px] rounded-lg border border-slate-200 flex items-center justify-center">
            <p className="font-sans text-sm text-on-surface-variant">{error ?? 'Retail network is temporarily unavailable.'}</p>
          </div>
        ) : (
          // Both grid children need min-h-0: without it, a grid item's default
          // min-height (auto) lets its content — the 25-card list — grow the
          // row past the container's fixed height instead of clipping and
          // scrolling, which is exactly why the list previously showed only a
          // few entries with no working scrollbar.
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-0 rounded-lg overflow-hidden border border-slate-200 h-[420px] md:h-[480px]">
            <div className="h-full min-h-0">
              <RetailMap
                manufacturer={manufacturer}
                retailers={retailers}
                selectedRetailerId={selectedRetailerId}
                onSelectRetailer={setSelectedRetailerId}
              />
            </div>
            <div className="h-full min-h-0 border-t lg:border-t-0 lg:border-l border-slate-200">
              <RetailerList
                retailers={retailers}
                selectedRetailerId={selectedRetailerId}
                onSelectRetailer={setSelectedRetailerId}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
