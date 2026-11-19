# Delivery money: who pays the courier, who gets what

Status: design agreed with the owner on 16 Nov 2026. UAT branch only
(`feat/courier-automation-uat`). Nothing here is in production.

## 1. The rules (owner's decisions)

| Rule | Decision |
|---|---|
| Commission | **2%** of the seller's goods (items + added GST). Never on delivery. |
| Gateway fee (~2% + 18% GST = 2.36%) | Seller bears it on the money they receive. On delivery the platform keeps, it is **added to the customer's delivery charge** (gross-up), so the platform nets the full courier cost. |
| Delivery money | **Never in the seller's Route transfer** when the platform ships. It stays with the platform, which pays the courier. |
| Courier choice | Cheaper of Delhivery / Shiprocket; if one doesn't serve, the other. If neither serves, the **seller delivers** with their own slab charge, and that charge is theirs. |
| Scenario 1 | Customer pays delivery. |
| Scenario 2 | Seller offers free (or %) delivery: their share of the courier cost is deducted from their payout. |
| Scenario 3 | Platform campaign: free delivery on everything for a period. Platform pays the courier. |
| Campaign + seller offer | **Option B**: the seller pays what they offered (100% = all, 50% = half), the platform pays the rest. Customer pays ₹0. |
| Campaign limits | Start/end, max courier cost covered per order, total budget; it stops itself. |
| Courier wallets | Pre-funded wallets (Shiprocket, Delhivery), topped up by hand weekly. Automated: balance watch + alerts, fallback to the other courier, weekly reconciliation report. |

## 2. Today's problems this fixes

1. Checkout puts the customer's delivery charge into the seller's held transfer;
   the courier engine claws it back at booking (`keepDeliveryFee`). A failed
   claw-back leaves the money with the seller.
2. Commission is charged on delivery too (`computeSellerSplit(gross)`).
3. Five places compute "what the seller is owed" and disagree:
   `seller-earnings.ts` and `seller_earnings.dart` subtract delivery,
   `pay-after-kyc.ts` and `seller-stats.ts` don't, checkout includes it.
4. Payout figures are read from the order document, which the customer's
   browser/app writes.

## 3. The design: a settlement plan, made once, by the server

### 3.1 One pure module, one set of numbers

`functions/src/payouts/settlement.ts`. No Firebase, no network. Imported by the
Next server (checkout, refunds, reassignment, payout run, earnings screens) and by
Cloud Functions (courier engine, payout jobs, stats). The Flutter app mirrors only
the reader (`settlementNet` etc.), with tests that pin the same cases.

All money is **integer paise**. Deductions round **up** (as today), so a transfer
can never exceed what the platform holds.

### 3.2 The plan (per seller, per payment)

Computed in `create-cart-order` from the server's own pricing, before the
Razorpay order is created:

```
goods            = subtotal + gstAdded                  (what the seller sold)
deliveryTo       = "platform" (courier priced) | "seller" (seller's slab)
customerDelivery = what the customer pays for delivery (gross-up included)
keptDelivery     = deliveryTo == seller ? customerDelivery : 0
commission       = ceil(goods × 2%)
gatewayFee       = ceil((goods + keptDelivery) × 2%) + ceil(that × 18%)
sellerCourier    = seller's agreed share of the courier cost (scenario 2 / B)
campaign         = platform's planned share under a campaign (budget)
transfer         = goods + keptDelivery − commission − gatewayFee − sellerCourier
```

`transfer` is what the seller's Route transfer is created for. The rest of the
payment (delivery, commission, the seller's courier share) stays with the platform.

Stored server-side on `paymentAttempts/{razorpayOrderId}.settlements[sellerKey]`
together with `routed` (whether a Route transfer was actually created for that
seller, after Razorpay's answer).

### 3.3 Stamped onto the order by the server

A Cloud Function `stampOrderSettlement` (onCreate `orders/*`) copies the plan from
the payment attempt to `order.settlement`. Clients can never write `settlement`
or `settlementAdjustments` (firestore.rules). The courier engine stamps it itself
if a seller accepts before the trigger ran (same idempotent function).

Orders without a plan (old app builds that don't send per-seller pricing, manual
admin orders, everything paid before this ships) keep **today's behaviour
unchanged**, including the claw-back. Nothing old is re-interpreted.

### 3.4 One invariant: later changes only ever ADD money for the seller

The checkout transfer is the least the seller is owed. Events after payment can
only add, via `order.settlementAdjustments[]` (server-written, append-only,
idempotent by id), so the platform never has to claw money back in the normal flow:

| Event | Adjustment for the seller who delivers |
|---|---|
| Courier-priced order, but no courier books (not serviceable / booking failed / automation off) → seller delivers | + customer's delivery charge (less gateway fee on it) + their courier share (they now bear their own cost) |
| Courier booked cheaper than the checkout quote | + the part of their share they no longer owe |
| Order reassigned to a new seller | new seller's transfer = their goods (no offer share; the platform pays the courier, as today) |

Adjustments are paid **after delivery and the 7-day hold**, by:
- routed sellers: a new scheduled job `paySettlementTopUps` (direct Razorpay
  transfer from balance, claim-once like `pay-after-kyc`), behind the same
  `settings/payouts.transfersEnabled && autoPayout` switches;
- non-routed sellers: the admin payout run and `pay-after-kyc`, which pay plan +
  adjustments in one transfer.

### 3.5 Courier pricing at checkout

```
c   = cheapest courier quote (₹, rounded up)
s   = seller's offer share 0..1 (product / store / network / free-above, existing)
r   = gateway rate = 2% × 1.18 = 0.0236

No campaign:   sellerCourier = s·c          customerBase = c − s·c
Campaign (B):  sellerCourier = s·c          platform = min(cap, c − s·c)
               customerBase  = c − s·c − platform      (0 unless over the cap)
customerDelivery = ceil(customerBase / (1 − r))        (0 stays 0)
```

The courier engine at booking uses the real cost `c'`:
`sellerShareActual = min(planned, round(s·c'))`; the platform pays the rest. If the
actual share is lower, a top-up adjustment is added.

### 3.6 Campaign

`_serverConfig/deliveryCampaign` (admin, server-only): `active, name, startsAt, endsAt,
maxPerOrder (₹, 0 = none), budget (₹, 0 = none)`. Server field `spentPaise`.

- Applies only to courier-priced parcels. A parcel no courier serves is the
  seller's, at their slab (owner: "retailer responsible").
- Checkout checks dates and `spentPaise < budget`. Spend is recorded at booking
  (actual cost) in a transaction, reversed if the booking is cancelled. Overrun is
  bounded by orders paid but not yet booked, and is visible in the report.

### 3.7 Courier wallets and reconciliation

- `deliveryLedger/{id}` (server-only, append-only): one entry per booking,
  cancellation and self-delivery switch: courier, cost, what the customer paid,
  the seller's share, campaign share, platform's net.
- `courierWalletWatch` (hourly): Shiprocket balance from its API
  (`/account/details/wallet-balance`, verified 16 Nov: ₹2,277.43). Delhivery has
  no balance API, so its balance is **estimated**: the last balance an admin
  entered, minus ledger bookings since. Alert (in-app + WhatsApp) to
  `_serverConfig/shipping.alertPhones` when below `walletAlertBelow` (₹5,000),
  at most once every 12 hours per wallet.
- Admin → Courier: campaign editor, wallet balances, weekly report (customer
  delivery collected, sellers' shares, campaign spend, courier cost, net).
- A booking that fails for lack of balance already falls through to the next
  courier, then to the seller (engine, unchanged).

## 4. Every reader of "what the seller is owed"

| Reader | Change |
|---|---|
| `create-cart-order` | transfers from the plan |
| `stampOrderSettlement` (new) | copies plan to the order |
| `shipping/engine.ts` | no claw-back on planned orders; adjustments; ledger; campaign spend |
| `paySettlementTopUps` (new) | pays adjustments to routed sellers |
| `pay-after-kyc.ts`, admin payout run | pay plan + adjustments |
| `order-refund.ts` | refund base and reversal from the plan |
| `order-reassignment.ts` | new seller's transfer = goods split |
| `seller-earnings.ts`, `seller_earnings.dart`, `seller-stats.ts` | read the plan |
| `/api/payment/fee` | commission shown = plan's commission |

## 5. Safety

- Every step idempotent (triggers fire twice). Money moves only behind the
  existing payout switches.
- Failures leave the seller **owed** (visible, retried), never overpaid.
- Unit tests for every scenario's numbers; rules emulator test that clients
  cannot write `settlement`.
- UAT only. Commission 2% is set in UAT `settings/route` only; production keeps
  1% until sellers are told (Seller Terms show the live rate).
