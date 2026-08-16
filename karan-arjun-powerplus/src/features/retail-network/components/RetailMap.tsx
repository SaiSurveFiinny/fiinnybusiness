import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import type { ManufacturerNetworkInfo, RetailerWithDistance } from '../types';

interface RetailMapProps {
  manufacturer: ManufacturerNetworkInfo;
  retailers: RetailerWithDistance[];
  selectedRetailerId: string | null;
  onSelectRetailer: (id: string) => void;
}

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: 'cooperative',
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbe9e3' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f4f6f4' }] },
  ],
};

/** Colored SVG pin data-URI — pattern ported from KrishiDukan-v2's BrandView/StoreLocatorView marker icons, restyled to this project's palette (primary green / secondary gold) instead of KrishiDukan's red/green. */
function pinDataUri(color: string, selected: boolean): string {
  const r = selected ? 13 : 10;
  const size = selected ? 40 : 32;
  const cx = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 10}" viewBox="0 0 ${size} ${size + 10}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="${color}" stroke="white" stroke-width="2.5"/><polygon points="${cx - 5},${size - 4} ${cx},${size + 8} ${cx + 5},${size - 4}" fill="${color}"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Map pane for the retail network section — @react-google-maps/api, same
 * library KrishiDukan-v2 uses. Implements the bidirectional click-sync that
 * KrishiDukan's own Brand page never wired up (traced: the pattern exists
 * only in their separate StoreLocatorView) — marker click selects a
 * retailer, selecting a retailer (from either side) pans/zooms and
 * highlights the corresponding marker. Bounds are fit to all markers on
 * initial load, since neither of KrishiDukan's Google-Maps-based views
 * call fitBounds (only their unused Leaflet component does).
 *
 * `retailers` is the single unified array (manufacturer as its first,
 * `isManufacturer: true` entry — see useRetailNetwork) that also backs the
 * list and the displayed count, so which marker is "selected"/gold is
 * driven by the exact same `selectedRetailerId` used everywhere else —
 * there is no separate manufacturer-marker code path to fall out of sync.
 * The `manufacturer` prop is kept only for its business name (used in the
 * marker title) and is otherwise unused for marker placement.
 */
export function RetailMap({ manufacturer, retailers, selectedRetailerId, onSelectRetailer }: RetailMapProps) {
  const { t } = useLanguage();
  const { isLoaded } = useJsApiLoader({
    id: 'karan-arjun-retail-network-map',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const entriesWithGeo = retailers.filter((r) => r.geo);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const bounds = new google.maps.LatLngBounds();

    entriesWithGeo.forEach((entry) => {
      bounds.extend({ lat: entry.geo!.latitude, lng: entry.geo!.longitude });
    });

    if (entriesWithGeo.length > 1) {
      map.fitBounds(bounds, 48);
    } else if (entriesWithGeo.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(11);
    }
    // Only run once when the map instance and data are both ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);

  useEffect(() => {
    if (!map || !selectedRetailerId) return;
    const selected = entriesWithGeo.find((r) => r.selectionKey === selectedRetailerId);
    if (!selected?.geo) return;
    map.panTo({ lat: selected.geo.latitude, lng: selected.geo.longitude });
  }, [map, selectedRetailerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) {
    return (
      <div className="w-full h-full min-h-[380px] flex items-center justify-center bg-surface-container rounded-lg">
        <p className="font-sans text-sm text-on-surface-variant">{t.retailnetwork_loading_map}</p>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      options={MAP_OPTIONS}
      zoom={11}
      onLoad={(instance) => setMap(instance)}
      onUnmount={() => setMap(null)}
    >
      {entriesWithGeo.map((entry) => {
        const isSelected = entry.selectionKey === selectedRetailerId;
        const size = isSelected ? 40 : 32;
        const baseColor = entry.isManufacturer ? '#0A1913' : '#3F4944';
        return (
          <MarkerF
            key={entry.selectionKey}
            position={{ lat: entry.geo!.latitude, lng: entry.geo!.longitude }}
            icon={{
              url: pinDataUri(isSelected ? '#B48D00' : baseColor, isSelected),
              scaledSize: new google.maps.Size(size, size + 10),
            }}
            title={entry.isManufacturer ? `${manufacturer.businessName} (${t.retailnetwork_manufacturer_badge})` : entry.shopName}
            zIndex={entry.isManufacturer ? 10 : isSelected ? 9 : 5}
            onClick={() => onSelectRetailer(entry.selectionKey)}
          />
        );
      })}
    </GoogleMap>
  );
}
