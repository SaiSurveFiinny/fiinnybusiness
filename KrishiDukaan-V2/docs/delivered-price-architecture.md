# Delivered price everywhere ("Amazon style")

Status: designed and built 17 Nov 2026 on the UAT branch (`feat/courier-automation-uat`), uncommitted, awaiting owner verification.

## 1. What the owner asked for

1. **One delivery address.** The profile holds the same detailed address as
   checkout (house, area, landmark, town/city, district, state, pincode), on
   web and app, kept in sync. Checkout fills from it; the customer can edit.
2. **Delivered price on every product.** With a saved pincode, a product shows
   what it costs *delivered to that address* (item + delivery) and the date it
   arrives.
3. **Product page: sellers ranked by delivered price.** We now deliver, and a
   far store costs more to ship, so the seller list shows each seller's item
   price, delivery, total and date, cheapest delivered first. A seller with an
   offer wins when the offer makes them cheapest.
4. **Fast.** Refreshing must not make the site slow or multiply server reads,
   writes or courier API calls.

## 2. What exists today

| | Website | App |
|---|---|---|
| Profile address | none | one line `users.address/city/state/pincode` (also a seller's **shop** address) |
| Checkout | prefills/saves `users.addressHouse/…/addressPincode` | prefills Area/City/State/Pincode from the one-line profile; never saves |

Listings read precomputed `marketplaceCards` (each card carries every seller's
price, offer, online flag, sizes) through a CDN-cached API
(`s-maxage=60`). SEO pages are server-rendered. Courier quotes cost ~6 courier
API calls per uncached route (seller pincode → customer pincode → weight band),
cached 30 min, one Firestore read per route.

## 3. Address design

**Canonical:** `users/{phone}.deliveryAddress = { house, area, landmark, city,
district, state, pincode }` — the same shape as `orders.deliveryAddress`.

- **Readers** (web + app): `deliveryAddress` → else the web checkout's old
  `addressHouse…addressPincode` → else, for buyers only, the one-line
  `address/city/state/pincode`. One helper on each platform.
- **Writers** (profile on web + app, "save address" at checkout on web + app):
  write `deliveryAddress`, plus the old web fields so nothing reading them
  breaks. For **buyers only** also the one-line fields, so older app builds
  keep prefilling. **Never** for sellers: those fields are their shop address,
  which courier pickup and store pages read.
- Web profile wrote `users/{uid}`; it now writes the same `users/{phone}` doc
  checkout uses (resolved through `uidIndex`, as `getUserProfile` reads).

## 4. Delivered price design

### 4.1 The customer's pincode ("Deliver to")
Logged in: `deliveryAddress.pincode`. Guest: a pincode they type, kept on the
device (web `localStorage`, app `shared_preferences`). A "Deliver to 411062"
chip changes it. No pincode → prices show as today.

### 4.2 Shared, cached HTML stays shared
The product list, SEO pages and cards stay exactly as cached today. The
delivered price is added **in the browser/app after load**, for the products on
screen. Search engines and the CDN see no change.

### 4.3 One batched endpoint: `POST /api/delivery/offers`
Input: the pincode and up to 60 *offers* — `{ id, sellerKey, weightKg, price,
productFree, productPct, manufacturerPhone }` for one pack. Output per offer:
`{ deliverable, deliveryCharge, free, campaign, etaDays, deliveryBy, carrier,
mode: "courier" | "seller" }`.

Priced with checkout's own `computeSellerPricing` on a one-pack line (offers,
store "free above", campaign Option B, gateway gross-up, seller slab when no
courier serves), so **the listing price equals the checkout price** for one pack.

### 4.4 Why it stays fast and cheap

| Cost | How it is kept down |
|---|---|
| Courier API calls | Quotes cached per route for **12 h** (rates don't change within a day). Checkout uses the same cache, so listing and checkout agree and checkout is pre-warmed. Concurrent identical requests share one call. At most 6 routes fetched at once, with a 4 s budget; the rest return "calculating" and are asked again. |
| Firestore reads | All routes for one customer pincode live in **one** doc `deliveryQuotes/{pincode}` (map `pickupPin_band → quote`): one read per request instead of one per route, plus an in-memory cache. Seller pincode / online flag / delivery settings: in-memory 10 min, cold misses read in one batch. |
| Firestore writes | One merged write per request, only for newly fetched routes. |
| Requests from a page | Only products **on screen** are priced; their offers are batched into one request every 300 ms. Results are kept on the device for 30 min, so a refresh costs **no** request. Per card only the 3 cheapest online sellers are asked about. |
| Page speed | Pages render immediately with the item price; the delivered price fills in when ready. |

Example: a new pincode opening a 20-product page with sellers in 8 distinct
towns needs ~8 routes (~50 courier calls, once per 12 h for that pincode, for
everyone there). A refresh: 0 requests. Another customer in the same pincode:
1 Firestore read.

### 4.5 Product page
Sellers ranked by delivered total (deliverable first), each showing item price,
delivery (or FREE / campaign), total and "by Thu, 19 Nov". Stores that only
sell in-store follow, distance-sorted as today.

## 5. Out of scope now
Sell-area rules (licence states, network locks) are still enforced at checkout;
the listing doesn't pre-filter by them. Multi-quantity prices are exact only at
checkout (the listing prices one pack).

## 6. Where it lives (built 17 Nov 2026)

| Piece | Website | App |
|---|---|---|
| Address reader/writer | `app/lib/delivery-address.ts` (+ `saveDeliveryAddress` in `app/firebase.ts`) | `lib/core/models/delivery_address.dart`, `AuthRepository.saveDeliveryAddress` |
| Profile address form | `app/components/shared/delivery-address-form.tsx` in `ProfileView` | `profile_edit_screen.dart` (buyers: full address; sellers: separate "for your own orders") |
| Checkout prefill / save | `page.tsx` (prefill + "save as default") | `checkout_screen.dart` (all parts prefilled; "Save as my delivery address") |
| Deliver-to pincode | `app/lib/deliver-to.ts`, `deliver-to-chip.tsx` | `deliver_to_provider.dart`, `deliver_to_chip.dart` |
| Batched client + cache | `app/lib/delivered-price-client.ts` | `lib/core/services/delivered_price_service.dart` |
| Card line | `delivered-price-line.tsx` (Market, Home, category, store pages) | `delivered_price_line.dart` (replaces the distance row, card height unchanged) |
| Seller ranking | `ProductDetailView.tsx` ("Lowest delivered", item + delivery = total · date) | `product_detail_screen.dart` (`_DeliveredBreakdown`) |

Server: `app/api/delivery/offers/route.ts` → `app/lib/delivered-offers.ts`
(pure, uses `computeSellerPricing`), `app/lib/courier-quote.ts` (12 h cache in
`deliveryQuotes/{pincode}`, `fetchRoute` dedupe, `pickupPincodesFor` batch),
`app/lib/pincode-info.ts` (shared pincode → state lookup). Checkout and the
product-page estimate use the same quote cache. The old per-route
`courierQuotes` docs are no longer read (harmless; can be deleted).

Tests: `scripts/tests/delivery-address.test.ts`, `delivered-offers.test.ts`,
`quote-cache-emulator.ts` (run under `firebase emulators:exec`), app
`test/delivery_address_test.dart`, `test/delivered_price_test.dart`.

Limits per IP per server instance: 30 requests/min, 40 new courier routes/min.
