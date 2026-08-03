import { useEffect, useMemo, useState } from 'react';
import { fetchManufacturerBySlug, fetchManufacturerRetailers } from '../api/krishiRetailApi';
import type { ManufacturerNetworkInfo, RetailerWithDistance } from '../types';

const EARTH_RADIUS_KM = 6371;

/** Haversine distance — ported verbatim from KrishiDukan-v2's app/utils/haversine.ts. */
function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRadians = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
}

interface UseRetailNetworkResult {
  manufacturer: ManufacturerNetworkInfo | null;
  retailers: RetailerWithDistance[];
  isLoading: boolean;
  error: string | null;
  /** A `selectionKey` (not a raw KrishiDukan `id` — see types.ts), guaranteed unique across the unified list even when a retailer's underlying phone number happens to collide with the manufacturer's. */
  selectedRetailerId: string | null;
  setSelectedRetailerId: (selectionKey: string | null) => void;
}

/**
 * Loads the Karan Arjun manufacturer profile and its connected retailer
 * network from the separate, read-only KrishiDukan Firestore client.
 * `enabled` gates the fetch so callers can defer it until the section
 * actually scrolls into view (avoids an unconditional extra Firestore
 * round-trip to an external project on every homepage load).
 *
 * The manufacturer is prepended to `retailers` as a synthetic first entry
 * (`isManufacturer: true`, distanceKm: 0) so the map, the list, and the
 * displayed count all read from ONE array — matching the KrishiDukan
 * reference, where the manufacturer is location #1 of N, not a separate
 * concept bolted on beside the retailer list. `selectedRetailerId`
 * defaults to the manufacturer's `selectionKey` so it (not a random
 * retailer) is the one highlighted/gold on first render, again matching
 * the reference.
 *
 * IMPORTANT: selection is keyed on `selectionKey`, not the raw `id`. At
 * least one live KrishiDukan retailer has been onboarded with the same
 * phone number as the manufacturer itself, so `id` alone is not a safe
 * uniqueness guarantee across this unified list — comparing by raw `id`
 * caused both the manufacturer card and that retailer's card (and both
 * markers) to highlight together. `selectionKey` is namespaced
 * (`manufacturer:{id}` / `retailer:{id}`) specifically to rule that out.
 */
export function useRetailNetwork(enabled: boolean): UseRetailNetworkResult {
  const [manufacturer, setManufacturer] = useState<ManufacturerNetworkInfo | null>(null);
  const [retailersRaw, setRetailersRaw] = useState<RetailerWithDistance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || hasLoaded) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const manufacturerInfo = await fetchManufacturerBySlug();
        if (cancelled) return;
        if (!manufacturerInfo) {
          setError('Retail network is temporarily unavailable.');
          setIsLoading(false);
          setHasLoaded(true);
          return;
        }
        setManufacturer(manufacturerInfo);

        const retailerEntries = await fetchManufacturerRetailers(manufacturerInfo.id);
        if (cancelled) return;

        const retailersWithDistance: RetailerWithDistance[] = retailerEntries.map((retailer) => {
          if (retailer.geo && manufacturerInfo.geo) {
            const distanceKm = haversineDistanceKm(
              { lat: manufacturerInfo.geo.latitude, lng: manufacturerInfo.geo.longitude },
              { lat: retailer.geo.latitude, lng: retailer.geo.longitude },
            );
            return { ...retailer, distanceKm, distanceLabel: formatDistance(distanceKm) };
          }
          return { ...retailer, distanceKm: Infinity, distanceLabel: '' };
        });
        retailersWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

        const manufacturerEntry: RetailerWithDistance = {
          id: manufacturerInfo.id,
          selectionKey: `manufacturer:${manufacturerInfo.id}`,
          shopName: manufacturerInfo.businessName,
          ownerName: '',
          address: manufacturerInfo.address,
          geo: manufacturerInfo.geo,
          isManufacturer: true,
          distanceKm: 0,
          distanceLabel: '',
        };

        setRetailersRaw([manufacturerEntry, ...retailersWithDistance]);
        setSelectedRetailerId(manufacturerEntry.selectionKey);
      } catch {
        if (!cancelled) setError('Could not load the retail network right now.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, hasLoaded]);

  const retailers = useMemo(() => retailersRaw, [retailersRaw]);

  return { manufacturer, retailers, isLoading, error, selectedRetailerId, setSelectedRetailerId };
}
