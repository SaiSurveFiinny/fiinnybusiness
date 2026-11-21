/**
 * Tests for the admin permission system (hasSection, sectionsForPath).
 *   npx tsx scripts/tests/admin-permissions.test.ts
 */
import assert from "node:assert/strict";
import { hasSection, sectionsForPath, ADMIN_SECTIONS, type AdminIdentity } from "../../app/admin/_context/admin-sections";

// ── hasSection ────────────────────────────────────────────────────────────────

const admin: AdminIdentity = { uid: "u1", role: "admin", adminSections: [] };
const teamNone: AdminIdentity = { uid: "u2", role: "team", adminSections: [] };
const teamSales: AdminIdentity = { uid: "u3", role: "team", adminSections: ["salesTeam"] };
const teamEdit: AdminIdentity = { uid: "u4", role: "team", adminSections: ["salesTeam", "salesDealerEdit"] };
const teamFull: AdminIdentity = { uid: "u5", role: "team", adminSections: ["salesTeam", "salesDealerEdit", "salesDealerDelete", "auditLog"] };

// Admin always has everything
assert.equal(hasSection(admin, "salesTeam"), true);
assert.equal(hasSection(admin, "salesDealerEdit"), true);
assert.equal(hasSection(admin, "salesDealerDelete"), true);
assert.equal(hasSection(admin, "auditLog"), true);

// Team with no sections has nothing
assert.equal(hasSection(teamNone, "salesTeam"), false);
assert.equal(hasSection(teamNone, "salesDealerEdit"), false);
assert.equal(hasSection(teamNone, "auditLog"), false);

// Team with salesTeam can view but not edit/delete
assert.equal(hasSection(teamSales, "salesTeam"), true);
assert.equal(hasSection(teamSales, "salesDealerEdit"), false);
assert.equal(hasSection(teamSales, "salesDealerDelete"), false);
assert.equal(hasSection(teamSales, "auditLog"), false);

// Team with salesDealerEdit can edit but not delete
assert.equal(hasSection(teamEdit, "salesDealerEdit"), true);
assert.equal(hasSection(teamEdit, "salesDealerDelete"), false);

// Team with all granted sections
assert.equal(hasSection(teamFull, "salesTeam"), true);
assert.equal(hasSection(teamFull, "salesDealerEdit"), true);
assert.equal(hasSection(teamFull, "salesDealerDelete"), true);
assert.equal(hasSection(teamFull, "auditLog"), true);

// ── sectionsForPath ───────────────────────────────────────────────────────────

assert.deepEqual(sectionsForPath("/admin/sales-team"), ["salesTeam"]);
assert.deepEqual(sectionsForPath("/admin/sales-team/abc123"), ["salesTeam"]);
assert.deepEqual(sectionsForPath("/admin/audit-log"), ["auditLog"]);
assert.deepEqual(sectionsForPath("/admin/analytics"), ["analytics"]);
assert.deepEqual(sectionsForPath("/admin"), ["overview"]);

// ── ADMIN_SECTIONS includes new sections ─────────────────────────────────────

assert.ok((ADMIN_SECTIONS as readonly string[]).includes("auditLog"), "auditLog should be in ADMIN_SECTIONS");
assert.ok((ADMIN_SECTIONS as readonly string[]).includes("salesDealerEdit"), "salesDealerEdit should be in ADMIN_SECTIONS");
assert.ok((ADMIN_SECTIONS as readonly string[]).includes("salesDealerDelete"), "salesDealerDelete should be in ADMIN_SECTIONS");

console.log("admin-permissions tests passed ✓");
