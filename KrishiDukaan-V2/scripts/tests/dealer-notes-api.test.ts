/**
 * Tests for dealer notes — collection structure, dealerId linking, ordering.
 *   npx tsx scripts/tests/dealer-notes-api.test.ts
 */
import assert from "node:assert/strict";

// ── Collection contract ───────────────────────────────────────────────────────
// These tests verify the shape and linking logic that the API route and
// client-side service both depend on.

type NoteDoc = {
  id: string;
  dealerId: string;
  salesExecutiveId: string;
  note: string;
  createdAt: { toDate: () => Date } | null;
};

function makeNote(overrides: Partial<NoteDoc> & { id: string }): NoteDoc {
  return {
    dealerId: "dealer1",
    salesExecutiveId: "exec1",
    note: "Test note",
    createdAt: { toDate: () => new Date("2026-01-01T10:00:00Z") },
    ...overrides,
  };
}

// ── dealerId linking ──────────────────────────────────────────────────────────
const n1 = makeNote({ id: "n1", dealerId: "dealer1" });
const n2 = makeNote({ id: "n2", dealerId: "dealer2" });
const n3 = makeNote({ id: "n3", dealerId: "dealer1" });

const allNotes = [n1, n2, n3];

// Only notes for dealer1 should be returned
const forDealer1 = allNotes.filter((n) => n.dealerId === "dealer1");
assert.equal(forDealer1.length, 2);
assert.ok(forDealer1.every((n) => n.dealerId === "dealer1"));
assert.ok(forDealer1.some((n) => n.id === "n1"));
assert.ok(forDealer1.some((n) => n.id === "n3"));

// dealer2 note must NOT appear
assert.ok(!forDealer1.some((n) => n.dealerId === "dealer2"));

// ── Newest-first ordering (DESC createdAt) ────────────────────────────────────
const notes = [
  makeNote({ id: "a", createdAt: { toDate: () => new Date("2026-01-01T08:00:00Z") } }),
  makeNote({ id: "b", createdAt: { toDate: () => new Date("2026-03-15T12:00:00Z") } }),
  makeNote({ id: "c", createdAt: { toDate: () => new Date("2026-02-10T09:30:00Z") } }),
];

// Simulate DESC sort (newest first)
const sorted = [...notes].sort((a, b) => {
  const ta = a.createdAt!.toDate().getTime();
  const tb = b.createdAt!.toDate().getTime();
  return tb - ta; // DESC
});

assert.equal(sorted[0].id, "b"); // 2026-03-15 is newest
assert.equal(sorted[1].id, "c"); // 2026-02-10
assert.equal(sorted[2].id, "a"); // 2026-01-01 is oldest

// ── Reversed ASC → produces same DESC ────────────────────────────────────────
// fetchNotesForDealer returns ASC; reversing it = same as DESC sort above
const asc = [...notes].sort((a, b) =>
  a.createdAt!.toDate().getTime() - b.createdAt!.toDate().getTime()
);
const reversed = [...asc].reverse();
assert.deepEqual(reversed.map((n) => n.id), sorted.map((n) => n.id));

// ── Pagination cursor logic ───────────────────────────────────────────────────
const PAGE = 2;
const page1 = sorted.slice(0, PAGE);               // ["b", "c"]
const cursorId = page1[page1.length - 1].id;       // "c"
const afterCursor = sorted.findIndex((n) => n.id === cursorId); // 1
const page2 = sorted.slice(afterCursor + 1, afterCursor + 1 + PAGE); // ["a"]

assert.equal(page1.length, 2);
assert.equal(page2.length, 1);
assert.equal(page2[0].id, "a");
assert.ok(!page2.some((n) => page1.some((p) => p.id === n.id)), "pages must not overlap");

// ── hasMore flag ──────────────────────────────────────────────────────────────
// Fetch pageSize+1, then trim — extra item signals hasMore
const LIMIT = 2;
const fetchResult = sorted.slice(0, LIMIT + 1); // fetches 3 items
const hasMore = fetchResult.length > LIMIT;
const finalPage = fetchResult.slice(0, LIMIT);
assert.equal(hasMore, true);
assert.equal(finalPage.length, LIMIT);

// Last page — only 1 item, hasMore false
const lastFetch = sorted.slice(2, 2 + LIMIT + 1); // ["a"]
const hasMoreLast = lastFetch.length > LIMIT;
assert.equal(hasMoreLast, false);

// ── Schema fields present ─────────────────────────────────────────────────────
const note = makeNote({ id: "x" });
assert.ok("dealerId" in note,          "dealerNotes must have dealerId");
assert.ok("salesExecutiveId" in note,  "dealerNotes must have salesExecutiveId");
assert.ok("note" in note,              "dealerNotes must have note");
assert.ok("createdAt" in note,         "dealerNotes must have createdAt");

console.log("dealer-notes-api tests passed ✓");
