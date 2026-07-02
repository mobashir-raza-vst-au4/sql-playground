"use client";

import { useMemo, useState } from "react";
import { usePlayground } from "@/lib/store";
import { autoPk, defaultType, TYPE_OPTIONS } from "@/lib/coltypes";
import { X, Plus, Trash2, Key, Wand2, Play } from "lucide-react";

interface Col {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
}

function quoteVal(v: string): string {
  const t = v.trim();
  if (t === "") return "NULL";
  if (/^-?\d+(\.\d+)?$/.test(t)) return t; // number
  if (/^(true|false|null)$/i.test(t)) return t.toUpperCase();
  return `'${t.replace(/'/g, "''")}'`; // string, escape quotes
}

/** Convert a JSON value to a SQL literal (for bulk JSON seeding). */
function jsonValToSql(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`; // JSON/JSONB columns
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Look up a key in an object, case-insensitively. */
function pick(obj: Record<string, unknown>, col: string): unknown {
  if (col in obj) return obj[col];
  const lower = col.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return undefined;
}

interface ParsedJson {
  rows: Record<string, unknown>[];
  error: string | null;
}

function parseSeedJson(text: string): ParsedJson {
  if (!text.trim()) return { rows: [], error: null };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { rows: [], error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(data)) return { rows: [], error: "Expected an array of objects, e.g. [{ ... }, { ... }]" };
  const rows = data.filter((o) => o && typeof o === "object" && !Array.isArray(o)) as Record<string, unknown>[];
  if (rows.length !== data.length) return { rows, error: "Some items were skipped (each item must be an object)." };
  return { rows, error: null };
}

export default function TableBuilder({
  editTable,
  onClose,
}: {
  editTable: string | null;
  onClose: () => void;
}) {
  const dialect = usePlayground((s) => s.dialect);
  const schema = usePlayground((s) => s.schema);
  const applySetup = usePlayground((s) => s.applySetup);

  const existing = editTable ? schema.find((t) => t.name === editTable) : undefined;
  const isEdit = !!existing;

  const [tableName, setTableName] = useState(editTable ?? "");
  const [cols, setCols] = useState<Col[]>(() => {
    if (isEdit) return []; // in edit mode we only ADD new columns
    const pk = autoPk(dialect);
    return [
      { name: "id", type: pk.type, pk: true, notNull: true },
      { name: "name", type: "TEXT", pk: false, notNull: false },
    ];
  });

  // Seed rows: a grid of string values, one array per row, aligned to seed columns.
  const seedCols = isEdit ? (existing?.columns.map((c) => c.name) ?? []) : cols.map((c) => c.name);
  const [rows, setRows] = useState<string[][]>([]);
  const [seedMode, setSeedMode] = useState<"grid" | "json">("grid");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  const parsedJson = useMemo(() => parseSeedJson(jsonText), [jsonText]);

  const addCol = () =>
    setCols((c) => [...c, { name: `col_${c.length + 1}`, type: defaultType(dialect), pk: false, notNull: false }]);
  const removeCol = (i: number) => setCols((c) => c.filter((_, idx) => idx !== i));
  const updateCol = (i: number, patch: Partial<Col>) =>
    setCols((c) => c.map((col, idx) => (idx === i ? { ...col, ...patch } : col)));

  const addRow = () => setRows((r) => [...r, seedCols.map(() => "")]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateCell = (ri: number, ci: number, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === ri ? row.map((c, cIdx) => (cIdx === ci ? v : c)) : row)));

  const sql = useMemo(() => {
    const parts: string[] = [];
    const name = tableName.trim();
    if (!name) return "";

    if (!isEdit) {
      const defs = cols
        .filter((c) => c.name.trim())
        .map((c) => {
          let def = `  "${c.name.trim()}" ${c.type}`;
          const isSerial = /SERIAL|AUTO_INCREMENT|AUTOINCREMENT/i.test(c.type);
          if (c.pk && !isSerial) def += " PRIMARY KEY";
          if (c.notNull && !c.pk) def += " NOT NULL";
          return def;
        });
      parts.push(`CREATE TABLE "${name}" (\n${defs.join(",\n")}\n);`);
    } else {
      // ALTER TABLE ADD COLUMN for each new column
      for (const c of cols.filter((c) => c.name.trim())) {
        parts.push(
          `ALTER TABLE "${name}" ADD COLUMN "${c.name.trim()}" ${c.type}${c.notNull ? " NOT NULL" : ""};`
        );
      }
    }

    // Seed inserts — from the JSON blob or the grid, depending on the mode.
    const insertCols = isEdit ? seedCols : cols.filter((c) => c.name.trim()).map((c) => c.name.trim());
    const seedTargets = insertCols; // for edit mode, seed against existing columns

    let valueRows: string[] = [];
    if (seedMode === "json") {
      valueRows = parsedJson.rows.map(
        (o) => `  (${seedTargets.map((c) => jsonValToSql(pick(o, c))).join(", ")})`
      );
    } else {
      valueRows = rows
        .filter((r) => r.some((v) => v.trim() !== ""))
        .map((r) => `  (${seedTargets.map((_, ci) => quoteVal(r[ci] ?? "")).join(", ")})`);
    }

    if (valueRows.length && seedTargets.length) {
      const colList = seedTargets.map((c) => `"${c}"`).join(", ");
      parts.push(`INSERT INTO "${name}" (${colList}) VALUES\n${valueRows.join(",\n")};`);
    }

    return parts.join("\n\n");
    // seedCols is derived from cols/existing, so listing those covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, cols, rows, isEdit, seedCols.join(","), seedMode, parsedJson]);

  const apply = async () => {
    setError(null);
    if (!sql.trim()) {
      setError("Nothing to run — give the table a name and at least one column.");
      return;
    }
    const outcome = await applySetup(sql);
    if (!outcome.ok) {
      setError(outcome.error?.message ?? "Failed to apply.");
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] rounded-lg border bg-panel flex flex-col shadow-2xl"
        style={{ borderColor: "var(--border)" }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 h-12 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold">{isEdit ? `Edit table · ${editTable}` : "Create a new table"}</h2>
          <button className="text-muted hover:text-app" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-5">
          {/* table name */}
          <div>
            <label className="text-xs text-muted block mb-1">Table name</label>
            <input
              className="input max-w-xs"
              value={tableName}
              disabled={isEdit}
              placeholder="e.g. customers"
              onChange={(e) => setTableName(e.target.value)}
            />
          </div>

          {/* columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted">
                {isEdit ? "Add new columns (existing columns are kept)" : "Columns"}
              </label>
              <button className="btn !py-1 !px-2 text-xs" onClick={addCol}>
                <Plus className="w-3.5 h-3.5" /> Add column
              </button>
            </div>

            {isEdit && existing && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {existing.columns.map((c) => (
                  <span
                    key={c.name}
                    className="text-xs px-2 py-1 rounded border flex items-center gap-1"
                    style={{ borderColor: "var(--border)", background: "var(--panel2)" }}
                  >
                    {c.pk && <Key className="w-3 h-3 text-warn" />}
                    {c.name} <span className="text-muted lowercase">{c.type}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {cols.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={c.name}
                    placeholder="column name"
                    onChange={(e) => updateCol(i, { name: e.target.value })}
                  />
                  <select
                    className="select w-44"
                    value={c.type}
                    onChange={(e) => updateCol(i, { type: e.target.value })}
                  >
                    {TYPE_OPTIONS[dialect].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {!isEdit && (
                    <label className="flex items-center gap-1 text-xs text-muted cursor-pointer select-none" title="Primary key">
                      <input type="checkbox" checked={c.pk} onChange={(e) => updateCol(i, { pk: e.target.checked })} />
                      PK
                    </label>
                  )}
                  <label className="flex items-center gap-1 text-xs text-muted cursor-pointer select-none" title="NOT NULL">
                    <input type="checkbox" checked={c.notNull} onChange={(e) => updateCol(i, { notNull: e.target.checked })} />
                    NN
                  </label>
                  <button className="text-muted hover:text-bad p-1" onClick={() => removeCol(i)} title="Remove column">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {cols.length === 0 && (
                <div className="text-sm text-muted italic">No new columns. Add one, or just seed data below.</div>
              )}
            </div>
          </div>

          {/* seed data */}
          {seedCols.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted">Seed data (optional)</label>
                <div className="flex items-center gap-2">
                  {/* Grid / JSON mode toggle */}
                  <div className="flex rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                    {(["grid", "json"] as const).map((m) => (
                      <button
                        key={m}
                        className="px-2 py-1 text-xs"
                        style={{
                          background: seedMode === m ? "var(--accent)" : "var(--panel2)",
                          color: seedMode === m ? "#fff" : "var(--muted)",
                        }}
                        onClick={() => setSeedMode(m)}
                      >
                        {m === "grid" ? "Grid" : "JSON"}
                      </button>
                    ))}
                  </div>
                  {seedMode === "grid" && (
                    <button className="btn !py-1 !px-2 text-xs" onClick={addRow}>
                      <Plus className="w-3.5 h-3.5" /> Add row
                    </button>
                  )}
                  {seedMode === "json" && (
                    <button
                      className="btn !py-1 !px-2 text-xs"
                      onClick={() => {
                        const tmpl = seedCols.reduce((o, c) => ({ ...o, [c]: "" }), {} as Record<string, string>);
                        setJsonText(JSON.stringify([tmpl, tmpl], null, 2));
                      }}
                      title="Insert a template with two example rows"
                    >
                      <Wand2 className="w-3.5 h-3.5" /> Template
                    </button>
                  )}
                </div>
              </div>

              {seedMode === "json" ? (
                <div>
                  <textarea
                    className="input font-mono text-xs"
                    rows={8}
                    spellCheck={false}
                    value={jsonText}
                    placeholder={`[\n  { ${seedCols.map((c) => `"${c}": ...`).join(", ")} },\n  { ${seedCols.map((c) => `"${c}": ...`).join(", ")} }\n]`}
                    onChange={(e) => setJsonText(e.target.value)}
                  />
                  <p className="text-[11px] mt-1" style={{ color: parsedJson.error ? "var(--bad)" : "var(--muted)" }}>
                    {parsedJson.error
                      ? parsedJson.error
                      : `Paste an array of objects. Keys are matched to columns (case-insensitive); missing keys become NULL. ${parsedJson.rows.length} row${parsedJson.rows.length === 1 ? "" : "s"} ready.`}
                  </p>
                </div>
              ) : (
                <>
              {rows.length > 0 && (
                <div className="overflow-auto border rounded" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {seedCols.map((c) => (
                          <th key={c} className="text-left px-2 py-1 bg-panel2 text-xs font-medium whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                        <th className="bg-panel2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => (
                        <tr key={ri}>
                          {seedCols.map((_, ci) => (
                            <td key={ci} className="p-0.5">
                              <input
                                className="input !py-1 !px-1.5 font-mono text-xs"
                                value={row[ci] ?? ""}
                                onChange={(e) => updateCell(ri, ci, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="text-center">
                            <button className="text-muted hover:text-bad" onClick={() => removeRow(ri)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted mt-1">
                Values are auto-quoted: numbers &amp; <code>true/false/null</code> stay unquoted, everything else becomes a string. Leave a cell empty for <code>NULL</code>.
              </p>
                </>
              )}
            </div>
          )}

          {/* SQL preview */}
          <div>
            <button className="text-xs text-accent hover:underline flex items-center gap-1" onClick={() => setShowSql((v) => !v)}>
              <Wand2 className="w-3.5 h-3.5" /> {showSql ? "Hide" : "Preview"} generated SQL
            </button>
            {showSql && (
              <pre
                className="mt-2 p-3 rounded border text-xs font-mono overflow-auto whitespace-pre-wrap"
                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              >
                {sql || "-- give the table a name and a column"}
              </pre>
            )}
          </div>

          {error && (
            <div className="p-2 rounded text-xs text-bad border" style={{ borderColor: "var(--bad)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 h-14 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void apply()}>
            <Play className="w-4 h-4" /> {isEdit ? "Apply changes" : "Create table"}
          </button>
        </div>
      </div>
    </div>
  );
}
