/**
 * Small shared helpers for the Excel *import* routes (menu, game library —
 * see src/app/api/menu/import and src/app/api/games/import). Mirrors
 * src/server/reports/build.ts's role for exports: keeps the actual cell
 * parsing in one place so both import routes behave identically.
 */
import type ExcelJS from "exceljs";

/** Reads a cell's value as plain text, handling rich text / formula cells. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const anyV = v as unknown as Record<string, unknown>;
    if (typeof anyV.text === "string") return anyV.text.trim();
    if (Array.isArray(anyV.richText)) {
      return anyV.richText
        .map((r) => (r as { text?: string }).text ?? "")
        .join("")
        .trim();
    }
    if ("result" in anyV) return String(anyV.result ?? "").trim();
  }
  return String(v).trim();
}

/** Parses a cell as a number, tolerating thousands separators; null if blank/invalid. */
export function cellNumber(v: ExcelJS.CellValue): number | null {
  const t = cellText(v);
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parses a cell as a loose boolean (TRUE/yes/1/active all count) with a fallback for blank cells. */
export function cellBoolean(v: ExcelJS.CellValue, fallback: boolean): boolean {
  const t = cellText(v).toLowerCase();
  if (!t) return fallback;
  return ["true", "yes", "y", "1", "active"].includes(t);
}

/**
 * Header name (lowercased) -> 1-based column index, read from the sheet's
 * first row — so the importer works regardless of column order, as long as
 * the header text matches (case-insensitive).
 */
export function headerColumnMap(sheet: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const name = cellText(cell.value).toLowerCase();
    if (name) map.set(name, colNumber);
  });
  return map;
}

export interface RowIssue {
  row: number;
  message: string;
}
