"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
// exceljs is imported dynamically in downloadTemplate() to keep it out of the
// initial bundle — it's only needed when the user requests the template file.
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Download, ImageIcon, Loader2, RotateCw, Upload, X,
} from "lucide-react";
import { storage } from "../../firebase";
import { compressImage, imageUploadMetadata } from "../../utils/compressImage";
import { createManufacturerProduct } from "../_lib/manufacturer-products-firestore";
import { createProductAndInventory } from "../_lib/inventory-firestore";
import { PRODUCT_CATEGORIES, loadProductSchema, getProductCategories } from "../_lib/category-info";
import type { SeatStats } from "../_types/subscriptions";

// ─── Constants ────────────────────────────────────────────────────────────────

// Resolved at CALL time, not module load: settings/productSchema is fetched
// asynchronously, and a stale snapshot here would reject a category the rest
// of the app now offers (e.g. Adjuvants, which 333 live products already use).
// Falls back to the bundled constant until the load resolves.
const validCategories = (): readonly string[] =>
  getProductCategories() ?? (PRODUCT_CATEGORIES as readonly string[]);

// Labels shown in the dropdown and accepted in the upload file
const UNIT_TYPE_LABELS = [
  "gm", "KG", "ml", "L", "Packet", "Piece", "Bottle", "Can", "Custom",
] as const;

const DEFAULT_STOCK = 20;

// The image column now holds a FILE NAME (matched against the separately
// uploaded images), not a URL — the retailer no longer needs a hosted image.
const REQUIRED_HEADERS = [
  "name", "category", "packageSize", "unitType", "price", "description", "imageFileName",
] as const;

// stockQuantity is optional — present in the template but not in REQUIRED_HEADERS

// Image file types accepted for the product-image upload section.
const ACCEPTED_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;
const ACCEPTED_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = {
  rowNum: number;
  name: string;
  category: string;
  packageSize: string;
  unitType: string;
  price: string;
  /** Resolved stock: uploaded value OR DEFAULT_STOCK when blank. */
  stockQuantity: number;
  description: string;
  /** Filename the retailer typed — matched case-insensitively to an uploaded image. */
  imageFileName: string;
};

type ValidationError = {
  row: number;
  message: string;
};

/** One image the retailer selected. `key` is the normalized match key. */
type ImageItem = {
  file: File;
  /** Original filename as selected. */
  name: string;
  /** Lower-cased, trimmed filename used for matching. */
  key: string;
  /** Object URL for the preview thumbnail (revoked on cleanup). */
  previewUrl: string;
};

type MatchStatus = "matched" | "missing" | "ambiguous";

type RowMatch = {
  row: ParsedRow;
  status: MatchStatus;
  /** The single matched image when status === "matched". */
  image?: ImageItem;
};

type UploadStatus = "pending" | "uploading" | "done" | "error";

type UploadRow = {
  parsed: ParsedRow;
  image: ImageItem;
  status: UploadStatus;
  error?: string;
  /** Cached Storage URL once the image uploads — reused on retry so a failed
   *  Firestore write never re-uploads (and never orphans) the image. */
  uploadedUrl?: string;
};

type Props = {
  userId: string | null;
  role: "manufacturer" | "retailer";
  seatStats: SeatStats;
  onDone: () => Promise<void>;
  storeName?: string;
  accountDeliveryEnabled?: boolean;
};

// ─── Filename helpers ───────────────────────────────────────────────────────────

/** Match key: trimmed + lower-cased. Never fuzzy — exact filename only. */
function normalizeFileName(name: string): string {
  return name.trim().toLowerCase();
}

/** Lower-cased extension without the dot, or "" when none. */
function fileExt(name: string): string {
  const m = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

// ─── Template generation ──────────────────────────────────────────────────────
// Uses ExcelJS (dynamically imported) because SheetJS CE does not write
// data validations (dropdown lists) to XLSX — that is a SheetJS Pro feature.

async function downloadTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");

  // Column definitions
  ws.columns = [
    { header: "name",          key: "name",          width: 32 },
    { header: "category",      key: "category",      width: 20 },
    { header: "packageSize",   key: "packageSize",   width: 14 },
    { header: "unitType",      key: "unitType",      width: 14 },
    { header: "price",         key: "price",         width: 10 },
    { header: "stockQuantity", key: "stockQuantity", width: 16 },
    { header: "description",   key: "description",   width: 55 },
    { header: "imageFileName", key: "imageFileName", width: 28 },
  ];

  // Style the header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FF" } };
  headerRow.alignment = { vertical: "middle" };

  // Note row explaining the optional stockQuantity + the imageFileName column
  const noteRow = ws.addRow({
    name: "← stockQuantity is optional. Leave blank to use default stock of 20.",
    imageFileName: "← exact image file name incl. extension, e.g. urea-50kg.jpg",
  });
  noteRow.font = { italic: true, color: { argb: "FF777777" } };

  // Example data rows
  ws.addRow({
    name:          "Urea Fertilizer",
    category:      "Fertilizers",
    packageSize:   "50",
    unitType:      "KG",
    price:         "850",
    stockQuantity: "100",
    description:   "Premium urea fertilizer for all crops. Boosts nitrogen content and improves yield.",
    imageFileName: "urea-50kg.jpg",
  });
  ws.addRow({
    name:          "DAP Fertilizer",
    category:      "Fertilizers",
    packageSize:   "50",
    unitType:      "KG",
    price:         "1400",
    stockQuantity: "",
    description:   "Di-ammonium phosphate for strong root growth and higher yields across crops.",
    imageFileName: "dap-50kg.jpg",
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];

  // ── Dropdown validations ─────────────────────────────────────────────────
  const categoryList = validCategories();
  const categoryFormula = `"${categoryList.join(",")}"`;
  const unitFormula     = `"${UNIT_TYPE_LABELS.join(",")}"`;

  // ExcelJS types omit dataValidations from Worksheet but it exists at runtime
  const dv = (ws as any).dataValidations;
  dv.add("B2:B1001", {
    type: "list",
    allowBlank: false,
    formulae: [categoryFormula],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Invalid Category",
    error: `Choose one of: ${categoryList.join(", ")}`,
  });
  dv.add("D2:D1001", {
    type: "list",
    allowBlank: false,
    formulae: [unitFormula],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Invalid Unit Type",
    error: `Choose one of: ${UNIT_TYPE_LABELS.join(", ")}`,
  });

  // Trigger browser download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk-product-template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Parsing & validation ─────────────────────────────────────────────────────

async function parseAndValidate(
  file: File,
): Promise<{ rows: ParsedRow[]; errors: ValidationError[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  if (!ws) {
    return { rows: [], errors: [{ row: 0, message: "Spreadsheet is empty or unreadable." }] };
  }

  // sheet_to_json returns objects keyed by the header row
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false, // keep everything as string (prevents Excel number coercion)
  });

  if (raw.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "No data rows found in the file." }] };
  }

  // Verify required headers exist (case-sensitive)
  const firstRow = raw[0];
  const missing = REQUIRED_HEADERS.filter((h) => !(h in firstRow));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{
        row: 0,
        message:
          `Missing required columns: ${missing.join(", ")}. ` +
          `Download the latest template — the image column is now "imageFileName".`,
      }],
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ValidationError[] = [];
  // Skip the italic note row the template ships in row 2 (blank name is its tell)
  // so it never counts as a product.

  raw.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, +1 for header, +1 for 1-based

    const name             = String(row["name"]          ?? "").trim();
    const category         = String(row["category"]      ?? "").trim();
    const packageSize      = String(row["packageSize"]   ?? "").trim();
    const unitType         = String(row["unitType"]      ?? "").trim();
    const price            = String(row["price"]         ?? "").trim();
    const stockRaw         = String(row["stockQuantity"] ?? "").trim();
    const description      = String(row["description"]   ?? "").trim();
    const imageFileName    = String(row["imageFileName"] ?? "").trim();

    // Skip the template's instructional note row (begins with "←") and any
    // fully-blank row, so neither becomes a phantom product or a false error.
    const isNoteRow = name.startsWith("←") || imageFileName.startsWith("←");
    const isBlankRow =
      !name && !category && !packageSize && !unitType && !price && !description && !imageFileName;
    if (isNoteRow || isBlankRow) return;

    const err = (msg: string) => errors.push({ row: rowNum, message: msg });

    if (!name)
      err("Product Name is required");

    if (!category)
      err("Category is required");
    else if (!validCategories().includes(category))
      err(`Invalid Category "${category}" — must be one of: ${validCategories().join(", ")}`);

    if (!packageSize) {
      err("Package Size is required");
    } else {
      const n = parseFloat(packageSize);
      if (isNaN(n) || n <= 0)
        err("Package Size must be a number greater than 0");
    }

    if (!unitType)
      err("Unit Type is required");
    else if (!(UNIT_TYPE_LABELS as readonly string[]).includes(unitType))
      err(`Invalid Unit Type "${unitType}" — must be one of: ${UNIT_TYPE_LABELS.join(", ")}`);

    if (!price) {
      err("Price is required");
    } else {
      const n = parseFloat(price);
      if (isNaN(n) || n <= 0)
        err("Price must be greater than 0");
    }

    // stockQuantity — optional; blank → DEFAULT_STOCK; provided → integer ≥ 0
    let stockQuantity = DEFAULT_STOCK;
    if (stockRaw !== "") {
      const n = Number(stockRaw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        err("Stock Quantity must be a whole number (0 or greater) if provided");
      } else {
        stockQuantity = n;
      }
    }

    if (!description)
      err("Description is required");
    else if (description.length < 20 || description.length > 300)
      err(`Description must be between 20 and 300 characters (row ${rowNum} has ${description.length})`);

    // imageFileName — required, must carry a supported extension. The actual
    // image match against the uploaded files happens after both are selected.
    if (!imageFileName) {
      err("Image File Name is required (e.g. urea-50kg.jpg)");
    } else {
      const ext = fileExt(imageFileName);
      if (!(ACCEPTED_IMAGE_EXTS as readonly string[]).includes(ext))
        err(`Image "${imageFileName}" must end in ${ACCEPTED_IMAGE_EXTS.join(", ")}`);
    }

    rows.push({ rowNum, name, category, packageSize, unitType, price, stockQuantity, description, imageFileName });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ row: 0, message: "No product rows found in the file." });
  }

  return { rows, errors };
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

/** Build the unit string from packageSize + unitType, e.g. "500 ml", "1 KG". */
function buildUnit(packageSize: string, unitType: string): string {
  return `${packageSize} ${unitType}`.trim();
}

/**
 * Compress + upload one image to Firebase Storage and return its download URL.
 * Reuses the exact compression + metadata used by the individual add-product
 * form. The path is collision-safe (timestamp + random suffix) because a bulk
 * run uploads many images within the same millisecond.
 */
async function uploadImage(image: ImageItem): Promise<string> {
  const toUpload = await compressImage(image.file);
  const safeName = toUpload.name.replace(/\s+/g, "_");
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `product-images/${Date.now()}-${rand}-${safeName}`;
  const snap = await uploadBytes(storageRef(storage, path), toUpload, imageUploadMetadata(toUpload));
  return getDownloadURL(snap.ref);
}

/** Create the product (+ inventory for retailers) with an already-uploaded image URL. */
async function createRow(
  row: ParsedRow,
  imageUrl: string,
  userId: string,
  role: "manufacturer" | "retailer",
  storeName: string,
  sellMode: "online_delivery" | "offline_store_only",
): Promise<void> {
  const unit  = buildUnit(row.packageSize, row.unitType);
  const price = parseFloat(row.price);
  const stock = row.stockQuantity; // already resolved (uploaded value OR DEFAULT_STOCK)

  if (role === "manufacturer") {
    // A manufacturer's product sells online only once its licence (states +
    // document) is added, so bulk-created products start in-store only; the
    // manufacturer adds each licence from Edit product, then switches online.
    await createManufacturerProduct(userId, {
      name: row.name,
      category: row.category,
      unit,
      price,
      variants: [{ unit, price, stock }],
      stockQuantity: stock,
      description: row.description,
      image: imageUrl,
      images: [imageUrl],
      gstApplicable: false,
      gstRate: 0,
      sellMode: "offline_store_only",
    });
  } else {
    await createProductAndInventory(userId, {
      name: row.name,
      category: row.category,
      unit,
      stockQuantity: stock,
      sellingPrice: price,
      reorderThreshold: 0,
      description: row.description,
      imageUrl,
      storeName,
      sellMode,
      gstApplicable: false,
      gstRate: 0,
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkProductUpload({
  userId,
  role,
  seatStats,
  onDone,
  storeName,
  accountDeliveryEnabled,
}: Props) {
  const [open, setOpen] = useState(false);
  // Warm the shared category schema so template generation and row validation
  // accept every category the rest of the app offers, not just the bundled
  // constant. Fire-and-forget: on failure the constant remains in effect.
  useEffect(() => { void loadProductSchema(); }, []);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [excelName, setExcelName] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedRow[] | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const noSubscription = seatStats.totalPurchased === 0;

  // Revoke object URLs only on unmount. A per-change cleanup would wrongly
  // revoke thumbnails that are reused across renders (handleImagesChange keeps
  // the same ImageItem — and its previewUrl — for unchanged filenames); every
  // other revoke (remove / replace / clear / reset) is done explicitly.
  const imagesRef = useRef<ImageItem[]>([]);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => () => {
    imagesRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl));
  }, []);

  const reset = () => {
    setValidationErrors([]);
    setExcelName(null);
    setPreviewRows(null);
    setImages((prev) => { prev.forEach((i) => URL.revokeObjectURL(i.previewUrl)); return []; });
    setUploadRows(null);
    setAllDone(false);
    if (fileRef.current) fileRef.current.value = "";
    if (imageRef.current) imageRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValidationErrors([]);
    setPreviewRows(null);
    setUploadRows(null);
    setAllDone(false);
    setExcelName(file.name);
    setParsing(true);
    try {
      const { rows, errors } = await parseAndValidate(file);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setPreviewRows(null);
      } else {
        setPreviewRows(rows);
      }
    } catch (err) {
      setValidationErrors([{
        row: 0,
        message: err instanceof Error ? err.message : "Failed to parse file.",
      }]);
    } finally {
      setParsing(false);
    }
  };

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setImages((prev) => {
      const byKey = new Map(prev.map((i) => [i.key, i]));
      for (const file of picked) {
        const key = normalizeFileName(file.name);
        // Last pick wins for the same filename; revoke the one we drop.
        const existing = byKey.get(key);
        if (existing) URL.revokeObjectURL(existing.previewUrl);
        byKey.set(key, { file, name: file.name, key, previewUrl: URL.createObjectURL(file) });
      }
      return Array.from(byKey.values());
    });
    // Allow re-selecting the same files later (e.g. after removing one).
    if (imageRef.current) imageRef.current.value = "";
  };

  const removeImage = (key: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  };

  // ── Derived matching ───────────────────────────────────────────────────────
  const imagesByKey = useMemo(() => {
    // A single filename could be selected twice (same name, different folders) —
    // track every file per key so we can flag the ambiguity instead of guessing.
    const m = new Map<string, ImageItem[]>();
    for (const img of images) {
      const arr = m.get(img.key);
      if (arr) arr.push(img); else m.set(img.key, [img]);
    }
    return m;
  }, [images]);

  const matches: RowMatch[] = useMemo(() => {
    if (!previewRows) return [];
    return previewRows.map((row) => {
      const key = normalizeFileName(row.imageFileName);
      const hits = imagesByKey.get(key) ?? [];
      if (hits.length === 0) return { row, status: "missing" as const };
      if (hits.length > 1) return { row, status: "ambiguous" as const };
      return { row, status: "matched" as const, image: hits[0] };
    });
  }, [previewRows, imagesByKey]);

  const missingCount   = matches.filter((m) => m.status === "missing").length;
  const ambiguousCount = matches.filter((m) => m.status === "ambiguous").length;
  const matchedCount   = matches.filter((m) => m.status === "matched").length;

  // Images the retailer uploaded that no row references — surfaced as info.
  const referencedKeys = useMemo(
    () => new Set((previewRows ?? []).map((r) => normalizeFileName(r.imageFileName))),
    [previewRows],
  );
  const unusedImages = images.filter((i) => !referencedKeys.has(i.key));

  // Duplicate assignment: one image used by more than one product (allowed, warned).
  const duplicateAssignments = useMemo(() => {
    const count = new Map<string, number>();
    matches.forEach((m) => {
      if (m.status === "matched" || m.status === "ambiguous") {
        const key = normalizeFileName(m.row.imageFileName);
        count.set(key, (count.get(key) ?? 0) + 1);
      }
    });
    return Array.from(count.entries()).filter(([, n]) => n > 1).map(([key]) => key);
  }, [matches]);

  const rowCount = previewRows?.length ?? 0;
  const hasEnoughSeats = seatStats.available >= rowCount && rowCount > 0;
  const allMatched = rowCount > 0 && missingCount === 0 && ambiguousCount === 0;
  const canImport = !!previewRows && allMatched && hasEnoughSeats && !!userId;

  // ── Import (sequential — controlled concurrency of 1) ────────────────────────
  const runImport = async (rowsToRun: UploadRow[], allRows: UploadRow[]) => {
    const sellMode: "online_delivery" | "offline_store_only" =
      role === "manufacturer"
        ? "offline_store_only"
        : accountDeliveryEnabled ? "online_delivery" : "offline_store_only";

    setUploading(true);
    setAllDone(false);

    for (const target of rowsToRun) {
      const i = allRows.indexOf(target);
      allRows[i] = { ...allRows[i], status: "uploading", error: undefined };
      setUploadRows([...allRows]);
      try {
        // Reuse a previously-uploaded image on retry so a Firestore-write
        // failure never re-uploads the bytes (no orphaned duplicates).
        const url = allRows[i].uploadedUrl ?? (await uploadImage(allRows[i].image));
        allRows[i] = { ...allRows[i], uploadedUrl: url };

        await createRow(
          allRows[i].parsed,
          url,
          userId!,
          role,
          storeName || "My Store",
          sellMode,
        );
        allRows[i] = { ...allRows[i], status: "done" };
      } catch (err) {
        allRows[i] = {
          ...allRows[i],
          status: "error",
          error: err instanceof Error ? err.message : "Import failed",
        };
      }
      setUploadRows([...allRows]);
    }

    setUploading(false);
    setAllDone(true);
    await onDone();
  };

  const handleUpload = async () => {
    if (!canImport) return;
    const rows: UploadRow[] = matches
      .filter((m): m is RowMatch & { image: ImageItem } => m.status === "matched" && !!m.image)
      .map((m) => ({ parsed: m.row, image: m.image, status: "pending" as const }));
    setUploadRows(rows);
    await runImport(rows, rows);
  };

  const handleRetryFailed = async () => {
    if (!uploadRows) return;
    const failed = uploadRows.filter((r) => r.status === "error");
    if (failed.length === 0) return;
    await runImport(failed, uploadRows);
  };

  const uploadedCount  = uploadRows?.filter((r) => r.status === "done").length ?? 0;
  const errorCount     = uploadRows?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient overflow-hidden">
      {/* ── Header / toggle ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surface-container/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Upload className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-on-surface">
              Bulk Upload Products
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Import multiple products at once with an XLSX file and their images
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!noSubscription && (
            <span className="text-xs font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
              {seatStats.available} seat{seatStats.available !== 1 ? "s" : ""} available
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-on-surface-variant" />
          ) : (
            <ChevronDown className="h-4 w-4 text-on-surface-variant" />
          )}
        </div>
      </button>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-outline-variant/20 px-5 py-5 space-y-5">

          {noSubscription ? (
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
              A subscription is required to upload products.{" "}
              <a href="/dashboard/upgrade" className="underline font-bold">Upgrade now</a>
            </p>
          ) : (
            <>
              {/* Template download */}
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">1. Download Template</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    XLSX with category &amp; unit dropdowns — put each image&apos;s file name in the <span className="font-semibold">imageFileName</span> column
                  </p>
                </div>
                <button
                  type="button"
                  disabled={downloadingTemplate}
                  onClick={async () => {
                    setDownloadingTemplate(true);
                    try { await downloadTemplate(); } finally { setDownloadingTemplate(false); }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  {downloadingTemplate
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…</>
                    : <><Download className="h-3.5 w-3.5" /> Template</>
                  }
                </button>
              </div>

              {!uploadRows && (
                <>
                  {/* ── A. Excel upload ──────────────────────────────────────── */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-on-surface">2. Upload Excel File</p>
                    {!excelName ? (
                      <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/40 px-6 py-7 cursor-pointer hover:border-primary/40 hover:bg-primary/3 transition-all">
                        {parsing ? (
                          <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        ) : (
                          <Upload className="h-6 w-6 text-on-surface-variant" />
                        )}
                        <span className="text-sm font-medium text-on-surface">
                          {parsing ? "Parsing file…" : "Click to select XLSX file"}
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          .xlsx or .xls — max 1000 rows
                        </span>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".xlsx,.xls"
                          disabled={parsing}
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </label>
                    ) : (
                      <div className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {parsing ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                          ) : validationErrors.length > 0 ? (
                            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          )}
                          <span className="text-sm font-medium text-on-surface truncate">{excelName}</span>
                          {previewRows && (
                            <span className="text-xs text-on-surface-variant shrink-0">
                              · {previewRows.length} product{previewRows.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="text-xs font-semibold text-primary hover:underline shrink-0 ml-3"
                        >
                          Replace
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".xlsx,.xls"
                          disabled={parsing}
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </div>
                    )}
                  </div>

                  {/* ── Validation errors ─────────────────────────────────────── */}
                  {validationErrors.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                          <p className="text-sm font-bold text-red-800">
                            {validationErrors.length} error{validationErrors.length !== 1 ? "s" : ""} in the file
                          </p>
                        </div>
                        <button type="button" onClick={reset} className="text-red-600 hover:text-red-800 p-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                        {validationErrors.map((e, i) => (
                          <li key={i} className="text-xs text-red-700 flex gap-2">
                            <span className="font-bold shrink-0">
                              {e.row === 0 ? "File" : `Row ${e.row}`}:
                            </span>
                            <span>{e.message}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-red-700">
                        Fix the file and use <span className="font-semibold">Replace</span> above to try again.
                      </p>
                    </div>
                  )}

                  {/* ── B. Product images upload ─────────────────────────────── */}
                  {previewRows && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-on-surface">3. Upload Product Images</p>
                      <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/40 px-6 py-6 cursor-pointer hover:border-primary/40 hover:bg-primary/3 transition-all">
                        <ImageIcon className="h-6 w-6 text-on-surface-variant" />
                        <span className="text-sm font-medium text-on-surface">
                          Click to select all product images
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          JPG, JPEG, PNG or WebP — select many at once
                        </span>
                        <input
                          ref={imageRef}
                          type="file"
                          accept={ACCEPTED_IMAGE_ACCEPT}
                          multiple
                          onChange={handleImagesChange}
                          className="sr-only"
                        />
                      </label>

                      {images.length > 0 && (
                        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-on-surface-variant">
                              {images.length} image{images.length !== 1 ? "s" : ""} selected
                            </p>
                            <button
                              type="button"
                              onClick={() => setImages((prev) => { prev.forEach((i) => URL.revokeObjectURL(i.previewUrl)); return []; })}
                              className="text-xs text-on-surface-variant hover:text-on-surface"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                            {images.map((img) => (
                              <div key={img.key} className="group relative flex items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-white pl-1 pr-2 py-1">
                                <img src={img.previewUrl} alt="" className="h-7 w-7 rounded object-cover" />
                                <span className="text-[11px] text-on-surface max-w-[140px] truncate">{img.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeImage(img.key)}
                                  className="text-on-surface-variant hover:text-red-600"
                                  title="Remove"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── 4. Review / matching preview ─────────────────────────── */}
                  {previewRows && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-on-surface">4. Review &amp; Import</p>
                        <button type="button" onClick={reset} className="text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1">
                          <X className="h-3.5 w-3.5" /> Start over
                        </button>
                      </div>

                      {/* Match + seat status banners */}
                      {images.length === 0 ? (
                        <p className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 font-medium">
                          Select the product images above — each row&apos;s <span className="font-semibold">imageFileName</span> is matched to a file.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-green-50 border border-green-200 px-2.5 py-1 font-semibold text-green-800">
                            {matchedCount} matched
                          </span>
                          {missingCount > 0 && (
                            <span className="rounded-full bg-red-50 border border-red-200 px-2.5 py-1 font-semibold text-red-800">
                              {missingCount} missing image
                            </span>
                          )}
                          {ambiguousCount > 0 && (
                            <span className="rounded-full bg-red-50 border border-red-200 px-2.5 py-1 font-semibold text-red-800">
                              {ambiguousCount} duplicate file name{ambiguousCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {unusedImages.length > 0 && (
                            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 font-semibold text-amber-800">
                              {unusedImages.length} unused image{unusedImages.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {duplicateAssignments.length > 0 && (
                            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 font-semibold text-amber-800">
                              {duplicateAssignments.length} image{duplicateAssignments.length !== 1 ? "s" : ""} reused by multiple products
                            </span>
                          )}
                        </div>
                      )}

                      {!hasEnoughSeats && rowCount > 0 && (
                        <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 font-medium">
                          Not enough seats — you need {rowCount} but have {seatStats.available} available.{" "}
                          <a href="/dashboard/upgrade" className="underline font-bold">Buy more</a>
                        </p>
                      )}

                      <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                        <table className="min-w-full text-xs">
                          <thead className="bg-surface-container-low border-b border-outline-variant/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Image</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Name</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Category</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Size</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Price</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Stock</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">File Name</th>
                              <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/10">
                            {matches.slice(0, 50).map((m) => (
                              <tr key={m.row.rowNum} className="hover:bg-surface-container/40">
                                <td className="px-3 py-2">
                                  {m.image ? (
                                    <img src={m.image.previewUrl} alt="" className="h-9 w-9 rounded-lg object-cover border border-outline-variant/30" />
                                  ) : (
                                    <div className="h-9 w-9 rounded-lg bg-surface-container flex items-center justify-center">
                                      <ImageIcon className="h-4 w-4 text-on-surface-variant/40" />
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-medium text-on-surface max-w-[180px] truncate">{m.row.name}</td>
                                <td className="px-3 py-2 text-on-surface-variant">{m.row.category}</td>
                                <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">{m.row.packageSize} {m.row.unitType}</td>
                                <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">₹{m.row.price}</td>
                                <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">
                                  {m.row.stockQuantity}
                                  {m.row.stockQuantity === DEFAULT_STOCK && (
                                    <span className="ml-1 text-[10px] text-on-surface-variant/60">(default)</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-on-surface-variant max-w-[140px] truncate" title={m.row.imageFileName}>
                                  {m.row.imageFileName}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {m.status === "matched" && (
                                    <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Matched
                                    </span>
                                  )}
                                  {m.status === "missing" && (
                                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                                      <AlertCircle className="h-3.5 w-3.5" /> No image
                                    </span>
                                  )}
                                  {m.status === "ambiguous" && (
                                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                                      <AlertCircle className="h-3.5 w-3.5" /> Duplicate file
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {matches.length > 50 && (
                              <tr>
                                <td colSpan={8} className="px-3 py-2 text-center text-on-surface-variant">
                                  …and {matches.length - 50} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {(missingCount > 0 || ambiguousCount > 0) && images.length > 0 && (
                        <p className="text-xs text-red-700">
                          Fix the <span className="font-semibold">imageFileName</span> values (or add the missing images) and re-select — import is blocked until every product matches exactly one image.
                        </p>
                      )}

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleUpload}
                          disabled={!canImport}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all"
                        >
                          <Upload className="h-4 w-4" />
                          Import {rowCount} Product{rowCount !== 1 ? "s" : ""}
                        </button>
                        <button type="button" onClick={reset} className="text-sm text-on-surface-variant hover:text-on-surface">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Upload progress ───────────────────────────────────────── */}
              {uploadRows && (
                <div className="space-y-4">
                  {/* Summary */}
                  {allDone && (
                    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
                      errorCount === 0
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-amber-50 border border-amber-200 text-amber-800"
                    }`}>
                      {errorCount === 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      {uploadedCount} of {uploadRows.length} product{uploadRows.length !== 1 ? "s" : ""} imported
                      {errorCount > 0 ? ` — ${errorCount} failed` : " successfully"}
                    </div>
                  )}

                  {uploading && (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      Importing {uploadedCount + 1} of {uploadRows.length}… please keep this tab open.
                    </div>
                  )}

                  {/* Row-level progress */}
                  <div className="overflow-x-auto rounded-xl border border-outline-variant/30 max-h-80 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-container-low border-b border-outline-variant/20 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Image</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Product</th>
                          <th className="px-3 py-2 text-left font-semibold text-on-surface-variant">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {uploadRows.map((r, i) => (
                          <tr key={i} className="hover:bg-surface-container/40">
                            <td className="px-3 py-2">
                              <img src={r.image.previewUrl} alt="" className="h-8 w-8 rounded object-cover border border-outline-variant/30" />
                            </td>
                            <td className="px-3 py-2 font-medium text-on-surface max-w-[220px] truncate">{r.parsed.name}</td>
                            <td className="px-3 py-2">
                              {r.status === "pending" && (
                                <span className="text-on-surface-variant">Waiting…</span>
                              )}
                              {r.status === "uploading" && (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                                </span>
                              )}
                              {r.status === "done" && (
                                <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                                  <CheckCircle2 className="h-3 w-3" /> Done
                                </span>
                              )}
                              {r.status === "error" && (
                                <span className="text-red-600 font-medium" title={r.error}>
                                  ✗ {r.error ?? "Failed"}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {allDone && (
                    <div className="flex items-center gap-3">
                      {errorCount > 0 && (
                        <button
                          type="button"
                          onClick={handleRetryFailed}
                          disabled={uploading}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all"
                        >
                          <RotateCw className="h-4 w-4" />
                          Retry {errorCount} failed
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { reset(); setOpen(false); }}
                        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
