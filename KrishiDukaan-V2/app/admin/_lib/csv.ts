/**
 * Shared CSV helpers used by sales-team export buttons and server-side
 * CSV routes. Pure functions — no Firestore or browser dependencies.
 *
 * UTF-8 BOM (﻿) is prepended so Excel opens Marathi/Hindi/Gujarati
 * text correctly on Windows without a manual import wizard.
 */

/** Wrap a cell in double-quotes, doubling any embedded quotes (RFC 4180). */
export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Build a CSV string (CRLF line endings) from headers + row objects. */
export function buildCsv<T extends Record<string, string | number | null | undefined>>(
  headers: Array<{ key: keyof T; label: string }>,
  rows: T[],
): string {
  const headerLine = headers.map((h) => csvCell(h.label)).join(",");
  const dataLines = rows.map((r) =>
    headers.map((h) => csvCell(r[h.key])).join(","),
  );
  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Trigger a browser download of [csv] as a UTF-8 BOM CSV file.
 * Only call in browser context ("use client" components or onClick handlers).
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Today's date as YYYY-MM-DD (local time). Used for download filenames. */
export function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Safe name fragment for filenames — replaces spaces/slashes with underscores. */
export function safeFilename(name: string): string {
  return name.trim().replace(/[\s/\\:*?"<>|]+/g, "_").slice(0, 60) || "export";
}
