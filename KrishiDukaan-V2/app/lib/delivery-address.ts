/**
 * The customer's delivery address: one shape, everywhere
 * (docs/delivered-price-architecture.md §3).
 *
 *   users/{phone}.deliveryAddress = { house, area, landmark, city, district, state, pincode }
 *
 * the same shape as orders.deliveryAddress. The profile (web + app) and
 * checkout (web + app) read and write it, so an address typed in one place is
 * there in the other.
 *
 * Older fields are still READ as fallbacks and still WRITTEN so nothing that
 * reads them breaks:
 *   - addressHouse … addressPincode: what web checkout used before;
 *   - address / city / state / pincode: the app's one-line profile address —
 *     but for SELLERS these are their SHOP address (courier pickup, store page),
 *     so they are read and written for buyers only.
 *
 * Pure: no Firebase here, so the rules are tested on their own
 * (scripts/tests/delivery-address.test.ts).
 */

export type DeliveryAddress = {
  house: string;
  area: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
};

export const EMPTY_ADDRESS: DeliveryAddress = {
  house: "", area: "", landmark: "", city: "", district: "", state: "", pincode: "",
};

const PIN = /^[1-9]\d{5}$/;

const s = (v: unknown, max = 160) => String(v ?? "").trim().slice(0, max);

/** Retailers and manufacturers: their one-line address fields are the shop's. */
export function isSellerRole(role: unknown): boolean {
  return role === "retailer" || role === "manufacturer";
}

function clean(a: Partial<Record<keyof DeliveryAddress, unknown>>): DeliveryAddress {
  return {
    house: s(a.house, 120),
    area: s(a.area),
    landmark: s(a.landmark, 80),
    city: s(a.city, 80),
    district: s(a.district, 80),
    state: s(a.state, 60),
    pincode: PIN.test(s(a.pincode, 6)) ? s(a.pincode, 6) : "",
  };
}

const hasAny = (a: DeliveryAddress) => Object.values(a).some((v) => v !== "");

/**
 * The saved delivery address from a users/{phone} document: the new field,
 * else the old web checkout fields, else (buyers only) the app's one-line
 * profile address. Always a full object; missing parts are "".
 */
export function readDeliveryAddress(user: Record<string, unknown> | null | undefined): DeliveryAddress {
  if (!user) return { ...EMPTY_ADDRESS };
  const canonical = user.deliveryAddress && typeof user.deliveryAddress === "object"
    ? clean(user.deliveryAddress as Record<string, unknown>)
    : null;
  if (canonical && hasAny(canonical)) return canonical;

  const webCheckout = clean({
    house: user.addressHouse, area: user.addressArea, landmark: user.addressLandmark,
    city: user.addressCity, district: user.addressDistrict, state: user.addressState,
    pincode: user.addressPincode,
  });
  if (hasAny(webCheckout)) return webCheckout;

  if (!isSellerRole(user.role)) {
    // The app's one-line address goes in "area" (it was typed as street/area).
    return clean({ area: user.address, city: user.city, state: user.state, pincode: user.pincode });
  }
  return { ...EMPTY_ADDRESS };
}

/** Pincode, area, town and state: enough to deliver (house is asked at checkout). */
export function isDeliverable(a: DeliveryAddress): boolean {
  return PIN.test(a.pincode) && a.area !== "" && a.city !== "" && a.state !== "";
}

/** One line for an order or a label, in the order an Indian address is written. */
export function addressLine(a: DeliveryAddress): string {
  const district = a.district && a.district.toLowerCase() !== a.city.toLowerCase() ? a.district : "";
  return [a.house, a.area, a.landmark ? `Near ${a.landmark}` : "", a.city, district, a.state, a.pincode]
    .filter(Boolean)
    .join(", ");
}

/**
 * The fields to merge into users/{phone} when an address is saved. Buyers also
 * get the one-line fields older app builds read; sellers never do (their shop
 * address lives there).
 */
export function deliveryAddressWriteFields(input: Partial<DeliveryAddress>, role: unknown): Record<string, unknown> {
  const a = clean(input);
  const fields: Record<string, unknown> = {
    deliveryAddress: a,
    addressHouse: a.house,
    addressArea: a.area,
    addressLandmark: a.landmark,
    addressCity: a.city,
    addressDistrict: a.district,
    addressState: a.state,
    addressPincode: a.pincode,
  };
  if (!isSellerRole(role)) {
    fields.address = [a.house, a.area].filter(Boolean).join(", ");
    fields.city = a.city;
    fields.state = a.state;
    fields.pincode = a.pincode;
  }
  return fields;
}
