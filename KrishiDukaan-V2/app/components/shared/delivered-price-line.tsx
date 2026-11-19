"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Truck } from "lucide-react";
import { useDeliverTo } from "../../lib/deliver-to";
import { cardOffers, useBestDelivered, type CardSource } from "../../lib/delivered-price-client";
import { formatDeliveryDate } from "../../lib/delivery-eta";
import { formatINR } from "../../lib/price-display";

/**
 * Under a card's price: "₹532 delivered · by Sat, 21 Nov" (or "FREE delivery
 * · by …") for the shopper's "Deliver to" pincode — the cheapest of the
 * product's sellers once delivery is counted. Asks only once the card is on
 * screen (lib/delivered-price-client batches and caches); shows nothing
 * without a pincode, while loading, or when it can't be priced, so the card
 * never jumps or shows a wrong number.
 */
export function DeliveredPriceLine({ product, seller, className = "" }: {
  product: CardSource;
  /** A store's own page: price only this store's offer. */
  seller?: string;
  className?: string;
}) {
  const deliverTo = useDeliverTo();
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || onScreen || !deliverTo) return;
    if (typeof IntersectionObserver === "undefined") { setOnScreen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setOnScreen(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onScreen, deliverTo]);

  const offers = useMemo(() => cardOffers(product, 3, seller), [product, seller]);
  const best = useBestDelivered(offers, deliverTo?.pincode ?? null, onScreen);

  return (
    <div ref={ref} className={`min-h-[1rem] text-[11px] leading-tight ${className}`}>
      {best && (
        <span className="inline-flex items-center gap-1 font-semibold text-on-surface-variant">
          <Truck className="h-3 w-3 shrink-0 text-green-700" aria-hidden />
          {best.free
            ? <span className="text-green-700">FREE delivery</span>
            : <span>{formatINR(best.total!)} <span className="font-normal">delivered</span></span>}
          {best.deliveryBy && <span className="font-normal">· by {formatDeliveryDate(best.deliveryBy)}</span>}
        </span>
      )}
    </div>
  );
}
