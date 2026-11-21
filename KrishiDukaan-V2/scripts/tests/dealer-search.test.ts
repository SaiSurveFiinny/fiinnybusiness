/**
 * Tests for dealer search matching and phone normalization.
 *   npx tsx scripts/tests/dealer-search.test.ts
 */
import assert from "node:assert/strict";
import { matchesSearch } from "../../app/admin/sales-team/[execId]/_components/DealersTab";
import type { Dealer } from "../../app/sales/dealers/dealers-service";

function dealer(overrides: Partial<Dealer>): Dealer {
  return {
    id: "d1",
    shopName: "Test Shop",
    ownerName: "Test Owner",
    phone: "9876543210",
    address: "123 Main St, Pune",
    type: "retailer",
    geo: null,
    active: true,
    createdBy: "exec1",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// ── Empty query always matches ────────────────────────────────────────────────
assert.equal(matchesSearch(dealer({}), ""), true);
assert.equal(matchesSearch(dealer({}), "  "), true);

// ── Shop name ─────────────────────────────────────────────────────────────────
assert.equal(matchesSearch(dealer({ shopName: "Surve Agro" }), "surve"), true);
assert.equal(matchesSearch(dealer({ shopName: "Surve Agro" }), "AGRO"), true);
assert.equal(matchesSearch(dealer({ shopName: "Surve Agro" }), "xyz"), false);

// ── Owner name ────────────────────────────────────────────────────────────────
assert.equal(matchesSearch(dealer({ ownerName: "Ramesh Kumar" }), "ramesh"), true);
assert.equal(matchesSearch(dealer({ ownerName: "Ramesh Kumar" }), "KUMAR"), true);
assert.equal(matchesSearch(dealer({ ownerName: "Ramesh Kumar" }), "rohit"), false);

// ── Address ───────────────────────────────────────────────────────────────────
assert.equal(matchesSearch(dealer({ address: "Main Market, Nashik" }), "nashik"), true);
assert.equal(matchesSearch(dealer({ address: "Main Market, Nashik" }), "MARKET"), true);

// ── Phone: exact digits match ─────────────────────────────────────────────────
assert.equal(matchesSearch(dealer({ phone: "9876543210" }), "9876543210"), true);

// Phone with +91 prefix on stored number
assert.equal(matchesSearch(dealer({ phone: "+919876543210" }), "9876543210"), true);

// Search with +91 prefix
assert.equal(matchesSearch(dealer({ phone: "9876543210" }), "+919876543210"), true);

// Search with spaces and dashes
assert.equal(matchesSearch(dealer({ phone: "9876543210" }), "98765 43210"), true);
assert.equal(matchesSearch(dealer({ phone: "9876543210" }), "98765-43210"), true);

// Partial phone match
assert.equal(matchesSearch(dealer({ phone: "9876543210" }), "98765"), true);

// Wrong number
assert.equal(matchesSearch(dealer({ phone: "9876543210" }), "1111111111"), false);

// ── Hindi shop name ───────────────────────────────────────────────────────────
assert.equal(matchesSearch(dealer({ shopName: "कृषी दुकान" }), "कृषी"), true);
assert.equal(matchesSearch(dealer({ shopName: "कृषी दुकान" }), "other"), false);

console.log("dealer-search tests passed ✓");
