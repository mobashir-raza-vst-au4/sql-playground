import type { Dialect } from "./engine";
import { maybeQuote } from "./sql-intel";

/** Parse CSV text into headers + rows (handles quoted fields, commas, newlines). */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const s = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows.
  const clean = rows.filter((r) => r.some((v) => v.trim() !== ""));
  return { headers: clean[0] ?? [], rows: clean.slice(1) };
}

export type ColKind = "integer" | "bigint" | "real" | "boolean" | "text";

const INT4_MAX = 2147483647n;
const INT8_MAX = 9223372036854775807n;

/** Guess a column's kind from its values. */
export function inferKind(values: string[]): ColKind {
  const vals = values.map((v) => v.trim()).filter((v) => v !== "");
  if (vals.length === 0) return "text";
  if (vals.every((v) => /^-?\d+$/.test(v))) {
    // Integer family — pick the width by the largest magnitude so we don't
    // overflow (e.g. IDs / phone numbers larger than a 32-bit INTEGER).
    let max = 0n;
    for (const v of vals) {
      const n = BigInt(v);
      const a = n < 0n ? -n : n;
      if (a > max) max = a;
    }
    if (max <= INT4_MAX) return "integer";
    if (max <= INT8_MAX) return "bigint";
    return "text"; // too large for a numeric column — keep the exact digits
  }
  if (vals.every((v) => /^-?(\d+\.?\d*|\.\d+)$/.test(v))) return "real";
  if (vals.every((v) => /^(true|false)$/i.test(v))) return "boolean";
  return "text";
}

/** Map a column kind to a concrete SQL type for the dialect. */
export function kindToType(kind: ColKind, dialect: Dialect): string {
  const map: Record<Dialect, Record<ColKind, string>> = {
    postgres: { integer: "INTEGER", bigint: "BIGINT", real: "NUMERIC", boolean: "BOOLEAN", text: "TEXT" },
    sqlite: { integer: "INTEGER", bigint: "INTEGER", real: "REAL", boolean: "INTEGER", text: "TEXT" },
    mysql: { integer: "INT", bigint: "BIGINT", real: "DOUBLE", boolean: "BOOLEAN", text: "TEXT" },
  };
  return map[dialect][kind];
}

/** Turn a filename into a safe base table name. */
export function tableNameFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  const cleaned = base.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "imported";
}

function literalFor(value: string, kind: ColKind): string {
  const v = value.trim();
  if (v === "") return "NULL";
  if (kind === "integer" || kind === "bigint" || kind === "real")
    return /^-?(\d+\.?\d*|\.\d+)$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`;
  if (kind === "boolean") return /^true$/i.test(v) ? "TRUE" : /^false$/i.test(v) ? "FALSE" : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

export interface ImportColumn {
  name: string;
  kind: ColKind;
}

/** Build CREATE TABLE + chunked INSERTs for an imported CSV. */
export function buildImportSql(
  table: string,
  columns: ImportColumn[],
  rows: string[][],
  dialect: Dialect
): string {
  const q = (id: string) => maybeQuote(id, dialect);
  const parts: string[] = [];

  // Replace any existing table of the same name (makes re-import idempotent and
  // clears orphan tables left by a previously-failed import).
  const cascade = dialect === "postgres" ? " CASCADE" : "";
  parts.push(`DROP TABLE IF EXISTS ${q(table)}${cascade};`);

  const defs = columns.map((c) => `  ${q(c.name)} ${kindToType(c.kind, dialect)}`);
  parts.push(`CREATE TABLE ${q(table)} (\n${defs.join(",\n")}\n);`);

  const colList = columns.map((c) => q(c.name)).join(", ");
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map((r) => `  (${columns.map((c, ci) => literalFor(r[ci] ?? "", c.kind)).join(", ")})`)
      .join(",\n");
    if (values) parts.push(`INSERT INTO ${q(table)} (${colList}) VALUES\n${values};`);
  }
  return parts.join("\n\n");
}

// ---- Result export ----

function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  const head = columns.map(csvField).join(",");
  const body = rows.map((r) => r.map(csvField).join(",")).join("\n");
  return body ? `${head}\n${body}` : head;
}

export function toJson(columns: string[], rows: unknown[][]): string {
  const objs = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null])));
  return JSON.stringify(objs, null, 2);
}

/** Trigger a browser download of text content. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
