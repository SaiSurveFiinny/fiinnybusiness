/**
 * One delivery address everywhere (app/lib/delivery-address.ts).
 *
 *   npx tsx scripts/tests/delivery-address.test.ts
 */
import assert from "node:assert/strict";
import {
  addressLine, deliveryAddressWriteFields, isDeliverable, readDeliveryAddress, EMPTY_ADDRESS,
} from "../../app/lib/delivery-address";

const full = { house: "Flat 4, Sai Heights", area: "Kothrud", landmark: "Dahanukar Colony", city: "Pune", district: "Pune", state: "Maharashtra", pincode: "411038" };

// New field wins.
assert.deepEqual(readDeliveryAddress({ deliveryAddress: full, addressArea: "old", address: "older" }), full);
// Old web checkout fields.
assert.deepEqual(readDeliveryAddress({
  addressHouse: "12", addressArea: "Nandgaon", addressLandmark: "", addressCity: "Nashik",
  addressDistrict: "Nashik", addressState: "Maharashtra", addressPincode: "423106",
}), { house: "12", area: "Nandgaon", landmark: "", city: "Nashik", district: "Nashik", state: "Maharashtra", pincode: "423106" });
// App one-line address, buyers only.
assert.deepEqual(readDeliveryAddress({ role: "consumer", address: "MG Road", city: "Nashik", state: "Maharashtra", pincode: "422001" }),
  { ...EMPTY_ADDRESS, area: "MG Road", city: "Nashik", state: "Maharashtra", pincode: "422001" });
// A seller's one-line address is their SHOP: never used as their delivery address.
assert.deepEqual(readDeliveryAddress({ role: "retailer", address: "Shop 5, Market Yard", city: "Pune", pincode: "411037" }), EMPTY_ADDRESS);
// Empty new field falls through.
assert.equal(readDeliveryAddress({ deliveryAddress: { house: " " }, addressArea: "Kothrud" }).area, "Kothrud");
// Bad pincode is dropped, not kept.
assert.equal(readDeliveryAddress({ deliveryAddress: { ...full, pincode: "01234" } }).pincode, "");
assert.deepEqual(readDeliveryAddress(null), EMPTY_ADDRESS);

assert.equal(isDeliverable(full), true);
assert.equal(isDeliverable({ ...full, pincode: "" }), false);
assert.equal(addressLine(full), "Flat 4, Sai Heights, Kothrud, Near Dahanukar Colony, Pune, Maharashtra, 411038");
assert.equal(addressLine({ ...full, district: "Haveli" }), "Flat 4, Sai Heights, Kothrud, Near Dahanukar Colony, Pune, Haveli, Maharashtra, 411038");

// Writes: buyers mirror the one-line fields (older app builds read them) …
const buyer = deliveryAddressWriteFields(full, "consumer");
assert.deepEqual(buyer.deliveryAddress, full);
assert.equal(buyer.addressPincode, "411038");
assert.equal(buyer.address, "Flat 4, Sai Heights, Kothrud");
assert.equal(buyer.pincode, "411038");
// … sellers never touch their shop address.
const seller = deliveryAddressWriteFields(full, "retailer");
assert.equal("address" in seller, false);
assert.equal("pincode" in seller, false);
assert.equal("city" in seller, false);
assert.equal(seller.addressCity, "Pune");

console.log("delivery address: all checks passed");
