"use client";

import { useMemo, useState } from "react";
import { usePlayground } from "@/lib/store";
import { autoPk, defaultType, TYPE_OPTIONS } from "@/lib/coltypes";
import { X, Plus, Trash2, Key, Wand2, Play, Link2 } from "lucide-react";

type OnDelete = "" | "cascade" | "setnull";

interface Col {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  refTable?: string;
  refColumn?: string;
  onDelete?: OnDelete;
}

/** Build the `REFERENCES ...` clause for a column with a foreign key. */
function fkClause(c: Col): string {
  if (!c.refTable || !c.refColumn) return "";
  let s = ` REFERENCES "${c.refTable}"("${c.refColumn}")`;
  if (c.onDelete === "cascade") s += " ON DELETE CASCADE";
  else if (c.onDelete === "setnull") s += " ON DELETE SET NULL";
  return s;
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
    if (isEdit) return []; // in edit mode `cols` holds only NEW columns to add
    const pk = autoPk(dialect);
    return [
      { name: "id", type: pk.type, pk: true, notNull: true },
      { name: "name", type: "TEXT", pk: false, notNull: false },
    ];
  });

  // Editable snapshot of the table's current columns (edit mode): rename + retype.
  const [existingCols, setExistingCols] = useState<
    { origName: string; name: string; origType: string; newType: string }[]
  >(() =>
    isEdit && existing
      ? existing.columns.map((c) => ({ origName: c.name, name: c.name, origType: c.type, newType: "" }))
      : []
  );
  const updateExisting = (
    i: number,
    patch: Partial<{ name: string; newType: string }>
  ) => setExistingCols((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  // Seed rows: a grid of string values, one array per row, aligned to seed columns.
  const seedCols = isEdit ? existingCols.map((c) => c.name.trim() || c.origName) : cols.map((c) => c.name);
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
          def += fkClause(c);
          return def;
        });
      parts.push(`CREATE TABLE "${name}" (\n${defs.join(",\n")}\n);`);
    } else {
      // Rename / retype existing columns (type change is Postgres-only).
      for (const c of existingCols) {
        const cur = c.name.trim() || c.origName;
        if (c.name.trim() && c.name.trim() !== c.origName) {
          parts.push(`ALTER TABLE "${name}" RENAME COLUMN "${c.origName}" TO "${c.name.trim()}";`);
        }
        if (c.newType && dialect === "postgres") {
          parts.push(`ALTER TABLE "${name}" ALTER COLUMN "${cur}" TYPE ${c.newType} USING "${cur}"::${c.newType};`);
        }
      }
      // ALTER TABLE ADD COLUMN for each new column
      for (const c of cols.filter((c) => c.name.trim())) {
        parts.push(
          `ALTER TABLE "${name}" ADD COLUMN "${c.name.trim()}" ${c.type}${c.notNull ? " NOT NULL" : ""}${fkClause(c)};`
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
  }, [tableName, cols, existingCols, rows, isEdit, dialect, seedCols.join(","), seedMode, parsedJson]);

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
            {/* Existing columns — editable (rename always; retype on Postgres) */}
            {isEdit && existingCols.length > 0 && (
              <div className="mb-4">
                <label className="text-xs text-muted block mb-2">Existing columns</label>
                <div className="space-y-2">
                  {existingCols.map((c, i) => (
                    <div key={c.origName} className="flex items-center gap-2">
                      {existing?.columns.find((x) => x.name === c.origName)?.pk && (
                        <span title="Primary key" className="shrink-0">
                          <Key className="w-3.5 h-3.5 text-warn" />
                        </span>
                      )}
                      <input
                        className="input flex-1 !py-1 text-sm"
                        value={c.name}
                        onChange={(e) => updateExisting(i, { name: e.target.value })}
                        title="Rename column"
                      />
                      {dialect === "postgres" ? (
                        <select
                          className="select w-44 !py-1 text-sm"
                          value={c.newType}
                          onChange={(e) => updateExisting(i, { newType: e.target.value })}
                          title="Change type"
                        >
                          <option value="">{c.origType} (keep)</option>
                          {TYPE_OPTIONS[dialect].map((t) => (
                            <option key={t} value={t}>
                              → {t}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted lowercase w-44 truncate" title="Type changes need PostgreSQL">
                          {c.origType}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {dialect !== "postgres" && (
                  <p className="text-[11px] text-muted mt-1.5">
                    Renaming works on all engines. Changing an existing column&apos;s <b>type</b> isn&apos;t supported on{" "}
                    {dialect === "mysql" ? "MySQL (beta)" : "SQLite"} — switch to PostgreSQL, or recreate the table.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted">{isEdit ? "Add new columns" : "Columns"}</label>
              <button className="btn !py-1 !px-2 text-xs" onClick={addCol}>
                <Plus className="w-3.5 h-3.5" /> Add column
              </button>
            </div>

            <div className="space-y-2">
              {cols.map((c, i) => {
                const refMeta = c.refTable ? schema.find((t) => t.name === c.refTable) : undefined;
                return (
                <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
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
                {/* Foreign key (references an existing table) */}
                {schema.length > 0 &&
                  (c.refTable ? (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs pl-1 text-muted">
                      <Link2 className="w-3 h-3" /> references
                      <select
                        className="select !py-0.5 text-xs"
                        value={c.refTable}
                        onChange={(e) => {
                          const t = schema.find((x) => x.name === e.target.value);
                          updateCol(i, {
                            refTable: e.target.value,
                            refColumn: t ? t.columns.find((cc) => cc.pk)?.name ?? t.columns[0]?.name : undefined,
                          });
                        }}
                      >
                        {schema.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select !py-0.5 text-xs"
                        value={c.refColumn ?? ""}
                        onChange={(e) => updateCol(i, { refColumn: e.target.value })}
                      >
                        {(refMeta?.columns ?? []).map((cc) => (
                          <option key={cc.name} value={cc.name}>
                            {cc.name}
                          </option>
                        ))}
                      </select>
                      on delete
                      <select
                        className="select !py-0.5 text-xs"
                        value={c.onDelete ?? ""}
                        onChange={(e) => updateCol(i, { onDelete: e.target.value as OnDelete })}
                      >
                        <option value="">No action</option>
                        <option value="cascade">Cascade</option>
                        <option value="setnull">Set null</option>
                      </select>
                      <button
                        className="hover:text-bad"
                        onClick={() => updateCol(i, { refTable: undefined, refColumn: undefined, onDelete: undefined })}
                        title="Remove foreign key"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-xs text-accent hover:underline pl-1 flex items-center gap-1"
                      onClick={() => {
                        const t = schema[0];
                        updateCol(i, {
                          refTable: t.name,
                          refColumn: t.columns.find((cc) => cc.pk)?.name ?? t.columns[0]?.name,
                          onDelete: "cascade",
                        });
                      }}
                    >
                      <Link2 className="w-3 h-3" /> add foreign key
                    </button>
                  ))}
                </div>
                );
              })}
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
