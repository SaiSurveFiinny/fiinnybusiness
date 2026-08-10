import { Icons } from '../../../components/Icons';
import { useLanguage } from '../../../context/LanguageContext';
import type { RetailerWithDistance } from '../types';

interface RetailerCardProps {
  retailer: RetailerWithDistance;
  isSelected: boolean;
  onSelect: () => void;
}

function googleMapsUrl(retailer: RetailerWithDistance): string | null {
  if (!retailer.geo) return null;
  return `https://www.google.com/maps/search/?api=1&query=${retailer.geo.latitude},${retailer.geo.longitude}`;
}

/** Single retailer (or manufacturer) row — enterprise list-item treatment (no icons-as-decoration, no card shadows), matching CareerLanding.tsx's divide-y row pattern rather than a boxed card grid. The manufacturer entry is visually distinguished with a small label badge instead of a distance line, matching the KrishiDukan reference's "Manufacturer" tag on card #1. Distance is intentionally not shown here — see useRetailNetwork.ts, distance is still computed for sort order but not surfaced in the UI. */
export function RetailerCard({ retailer, isSelected, onSelect }: RetailerCardProps) {
  const { t } = useLanguage();
  const mapsUrl = googleMapsUrl(retailer);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-5 py-4 border-l-2 transition-colors ${
        isSelected ? 'border-secondary bg-secondary-container/10' : 'border-transparent hover:bg-surface-container'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="font-sans font-bold text-primary text-sm leading-snug">{retailer.shopName}</p>
            {retailer.isManufacturer && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-wide bg-secondary-container/30 text-secondary">
                {t.retailnetwork_manufacturer_badge}
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant font-sans mt-1">
            {[retailer.address.city, retailer.address.state].filter(Boolean).join(', ') || t.retailnetwork_location_unavailable}
          </p>
        </div>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-sans font-bold text-primary hover:underline underline-offset-4"
          >
            {t.retailnetwork_map_link} <Icons.ArrowRight className="w-3 h-3" />
          </a>
        ) : (
          <span className="shrink-0 text-xs font-sans font-semibold text-slate-300 cursor-not-allowed" title={t.retailnetwork_no_coordinates}>
            {t.retailnetwork_map_link}
          </span>
        )}
      </div>
    </button>
  );
}
