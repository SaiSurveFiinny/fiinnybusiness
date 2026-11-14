import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Users & Roles CSV export: every user in the listing (all roles, all pages),
 * reduced to three columns — User Name, Phone Number, Role. Read once per
 * click, nothing on page load.
 *
 * Deliberately NOT exported: email, UID, payment info or any other personal
 * data — only the three columns above. Deleted users are excluded; because a
 * delete hard-removes the users/{id} doc (app/api/admin/delete-user), they are
 * already absent, and the defensive `deleted`/`isDeleted` guard below drops any
 * soft-deleted doc too, so the file matches the on-screen listing.
 */

export type UserExportRow = {
  name: string;
  phone: string;
  role: string;
};

/** The listing's display name: sellers show their shop/business, others their name. */
function displayName(u: any): string {
  if (u.role === "retailer" || u.role === "manufacturer") {
    return String(u.shopName || u.businessName || u.ownerName || u.name || "");
  }
  return String(u.name || "");
}

/** Pure: export rows from already-loaded user docs, deleted users removed. */
export function buildUserExportRows(users: any[]): UserExportRow[] {
  return users
    .filter((u) => !u.deleted && !u.isDeleted)
    .map((u) => ({
      name: displayName(u),
      phone: String(u.phone || ""),
      role: String(u.role || "customer"),
    }));
}

const HEADERS: Array<[keyof UserExportRow, string]> = [
  ["name", "User Name"],
  ["phone", "Phone Number"],
  ["role", "Role"],
];

/** Excel-safe CSV cell: wrap in quotes, double any embedded quotes. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Pure: a full CSV string (with header row) from export rows. */
export function buildUsersCsv(rows: UserExportRow[]): string {
  const lines = [
    HEADERS.map(([, h]) => csvCell(h)).join(","),
    ...rows.map((r) => HEADERS.map(([k]) => csvCell(r[k])).join(",")),
  ];
  return lines.join("\r\n");
}

/** Loads every user, builds the CSV and downloads it. Returns how many rows were written. */
export async function exportUsersCsv(): Promise<number> {
  const snap = await getDocs(collection(db, "users"));
  const rows = buildUserExportRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  const csv = buildUsersCsv(rows);

  // Prepend a UTF-8 BOM so Excel renders Marathi/Hindi/Gujarati names correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `krishidukan-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return rows.length;
}
