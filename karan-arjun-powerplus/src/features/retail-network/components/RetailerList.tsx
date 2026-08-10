import { useEffect, useRef } from 'react';
import { RetailerCard } from './RetailerCard';
import { useLanguage } from '../../../context/LanguageContext';
import type { RetailerWithDistance } from '../types';

interface RetailerListProps {
  retailers: RetailerWithDistance[];
  selectedRetailerId: string | null;
  onSelectRetailer: (id: string) => void;
}

/**
 * Scrollable retailer list, synchronized with the map — selecting a
 * retailer (via list click or map marker click, both funnel through the
 * same `selectedRetailerId` state lifted in RetailNetworkSection) scrolls
 * the corresponding card into view. Ported from KrishiDukan-v2's
 * StoreLocatorView.tsx ref-registry + scrollTo pattern.
 */
export function RetailerList({ retailers, selectedRetailerId, onSelectRetailer }: RetailerListProps) {
  const { t } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!selectedRetailerId) return;
    const card = cardRefs.current.get(selectedRetailerId);
    const container = listRef.current;
    if (card && container) {
      const cardTop = card.offsetTop - container.offsetTop;
      container.scrollTo({ top: cardTop - 12, behavior: 'smooth' });
    }
  }, [selectedRetailerId]);

  if (retailers.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-on-surface-variant font-sans">{t.retailnetwork_empty}</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto divide-y divide-primary/10">
      {retailers.map((retailer) => (
        <div
          key={retailer.selectionKey}
          ref={(el) => {
            if (el) cardRefs.current.set(retailer.selectionKey, el);
            else cardRefs.current.delete(retailer.selectionKey);
          }}
        >
          <RetailerCard
            retailer={retailer}
            isSelected={retailer.selectionKey === selectedRetailerId}
            onSelect={() => onSelectRetailer(retailer.selectionKey)}
          />
        </div>
      ))}
    </div>
  );
}
