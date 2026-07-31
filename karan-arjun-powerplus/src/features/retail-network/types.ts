/**
 * Read-only display types for the KrishiDukan retail network integration.
 * These mirror (a subset of) KrishiDukan-v2's `ManufacturerBrandData` /
 * `BrandRetailerSummary` shapes (see app/dashboard/_lib/brand-page-types.ts
 * in that repo) — field names match exactly so raw Firestore docs need
 * minimal transformation. `geo: { latitude, longitude }` is used throughout
 * (not `{ lat, lng }`) since that matches the raw Firestore GeoPoint shape;
 * conversion to Google Maps' `{ lat, lng }` LatLngLiteral happens only at
 * the point markers are rendered.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface RetailAddress {
  line1: string;
  city: string;
  state: string;
}

export interface ManufacturerNetworkInfo {
  id: string;
  businessName: string;
  address: RetailAddress;
  geo: GeoPoint | null;
}

export interface RetailerNetworkEntry {
  /**
   * Raw KrishiDukan Firestore doc ID (the retailer's, or the manufacturer's
   * own, phone number). NOT guaranteed unique within the unified list: at
   * least one KrishiDukan retailer has been onboarded using the same phone
   * number as the manufacturer itself, so a retailer entry's `id` can
   * collide with the manufacturer entry's `id`. Never use `id` alone for
   * selection/React-key purposes — use `selectionKey` instead.
   */
  id: string;
  /** Unique within the unified list even when `id` collides — see `id`'s doc comment. Always `manufacturer:{id}` for the synthetic manufacturer entry and `retailer:{id}` for every retailer, so the two can never be mistaken for each other regardless of what the underlying phone numbers happen to be. */
  selectionKey: string;
  shopName: string;
  ownerName: string;
  address: RetailAddress;
  geo: GeoPoint | null;
  logo?: string;
  /** True only for the single synthetic entry representing the manufacturer itself, prepended to the retailer list so map/list/count all read from one unified array — matching the KrishiDukan reference, where the manufacturer is card #1 of the location list. */
  isManufacturer?: boolean;
}

export interface RetailerWithDistance extends RetailerNetworkEntry {
  distanceKm: number;
  distanceLabel: string;
}
