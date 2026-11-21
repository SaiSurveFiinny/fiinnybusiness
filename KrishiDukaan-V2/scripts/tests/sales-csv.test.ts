/**
 * Tests for the sales-team CSV utilities.
 *   npx tsx scripts/tests/sales-csv.test.ts
 */
import assert from "node:assert/strict";
import { csvCell, buildCsv, safeFilename } from "../../app/admin/_lib/csv";

// ── csvCell ───────────────────────────────────────────────────────────────────

assert.equal(csvCell("hello"), '"hello"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
assert.equal(csvCell("comma,val"), '"comma,val"');
assert.equal(csvCell(""), '""');
assert.equal(csvCell(null), '""');
assert.equal(csvCell(undefined), '""');
assert.equal(csvCell(42), '"42"');
assert.equal(csvCell(0), '"0"');

// Hindi text round-trips through csvCell unchanged
const hindiName = "रमेश कुमार";
assert.equal(csvCell(hindiName), `"${hindiName}"`);

// Marathi text
const marathiName = "कृषी दुकान";
assert.equal(csvCell(marathiName), `"${marathiName}"`);

// ── buildCsv ──────────────────────────────────────────────────────────────────

const headers = [
  { key: "name" as const, label: "Dealer Name" },
  { key: "phone" as const, label: "Phone" },
];
type Row = { name: string; phone: string };

const rows: Row[] = [
  { name: "Surve Agro", phone: "9876543210" },
  { name: 'He said "yes"', phone: "1234567890" },
];

const csv = buildCsv(headers, rows);
const lines = csv.split("\r\n");

assert.equal(lines.length, 3);
assert.equal(lines[0], '"Dealer Name","Phone"');
assert.equal(lines[1], '"Surve Agro","9876543210"');
assert.equal(lines[2], '"He said ""yes""","1234567890"');

// Empty rows produces just the header line
const emptycsv = buildCsv(headers, []);
assert.equal(emptycsv, '"Dealer Name","Phone"');

// ── safeFilename ──────────────────────────────────────────────────────────────

assert.equal(safeFilename("Ramesh Kumar"), "Ramesh_Kumar");
assert.equal(safeFilename("Surve/Agro"), "Surve_Agro");
assert.equal(safeFilename(""), "export");
assert.equal(safeFilename("   "), "export");

// Very long names are truncated to 60 chars
const longName = "A".repeat(80);
assert.equal(safeFilename(longName).length, 60);

console.log("sales-csv tests passed ✓");
