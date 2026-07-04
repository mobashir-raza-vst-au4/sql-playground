"use client";

import { useMemo, useState } from "react";
import { usePlayground } from "@/lib/store";
import {
  buildImportSql,
  inferKind,
  tableNameFromFile,
  type ColKind,
  type ImportColumn,
} from "@/lib/csv";
import { X, FileSpreadsheet, Play } from "lucide-react";

export interface CsvData {
  fileName: string;
  headers: string[];
  rows: string[][];
}

const KINDS: ColKind[] = ["integer", "bigint", "real", "boolean", "text"];

export default function CsvImport({
  data,
  onClose,
  more = 0,
}: {
  data: CsvData;
  onClose: () => void;
  /** How many more files are queued after this one. */
  more?: number;
}) {
  const dialect = usePlayground((s) => s.dialect);
  const applySetup = usePlayground((s) => s.applySetup);
  const schema = usePlayground((s) => s.schema);

  const [table, setTable] = useState(() => tableNameFromFile(data.fileName));
  const [columns, setColumns] = useState<ImportColumn[]>(() =>
    data.headers.map((h, i) => ({
      name: h.trim() || `col_${i + 1}`,
      kind: inferKind(data.rows.map((r) => r[i] ?? "")),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const preview = useMemo(() => data.rows.slice(0, 5), [data.rows]);
  // Only true when a table with this exact name really exists right now.
  const nameExists = useMemo(
    () => schema.some((t) => t.name.toLowerCase() === table.trim().toLowerCase()),
    [schema, table]
  );

  const setKind = (i: number, kind: ColKind) =>
    setColumns((c) => c.map((col, idx) => (idx === i ? { ...col, kind } : col)));
  const setName = (i: number, name: string) =>
    setColumns((c) => c.map((col, idx) => (idx === i ? { ...col, name } : col)));

  const doImport = async () => {
    setError(null);
    if (!table.trim()) return setError("Give the table a name.");
    if (columns.some((c) => !c.name.trim())) return setError("Every column needs a name.");
    setWorking(true);
    const sql = buildImportSql(table.trim(), columns, data.rows, dialect);
    const outcome = await applySetup(sql);
    setWorking(false);
    if (!outcome.ok) return setError(outcome.error?.message ?? "Import failed.");
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
        <div className="flex items-center justify-between px-4 h-12 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">Import CSV · {data.fileName}</span>
            {more > 0 && (
              <span className="text-xs font-normal text-muted shrink-0">({more} more queued)</span>
            )}
          </h2>
          <button className="text-muted hover:text-app" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-muted block mb-1">Table name</label>
              <input className="input max-w-xs" value={table} onChange={(e) => setTable(e.target.value)} />
            </div>
            <div className="text-xs text-muted pb-2">
              {data.rows.length} row{data.rows.length === 1 ? "" : "s"} · {columns.length} columns · types auto-detected (adjust below)
            </div>
          </div>

          {nameExists && (
            <div
              className="p-2 rounded text-xs flex items-center gap-1.5"
              style={{ border: "1px solid var(--warn)", color: "var(--warn)" }}
            >
              A table named <code>{table.trim()}</code> already exists — importing will <b>replace</b> it. Rename above to keep both.
            </div>
          )}

          {/* Column types */}
          <div>
            <div className="text-xs text-muted mb-2">Columns</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {columns.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1 !py-1 text-sm"
                    value={c.name}
                    onChange={(e) => setName(i, e.target.value)}
                  />
                  <select
                    className="select !py-1 text-sm w-28"
                    value={c.kind}
                    onChange={(e) => setKind(i, e.target.value as ColKind)}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <div className="text-xs text-muted mb-1">Preview (first {preview.length})</div>
              <div className="overflow-auto border rounded" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {columns.map((c, i) => (
                        <th key={i} className="text-left px-2 py-1 bg-panel2 font-medium whitespace-nowrap">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, ri) => (
                      <tr key={ri} style={{ background: ri % 2 ? "var(--row-alt)" : "transparent" }}>
                        {columns.map((_, ci) => (
                          <td key={ci} className="px-2 py-1 font-mono whitespace-nowrap">
                            {r[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="p-2 rounded text-xs text-bad border" style={{ borderColor: "var(--bad)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 h-14 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
          <button className="btn" onClick={onClose}>
            {more > 0 ? "Skip" : "Cancel"}
          </button>
          <button className="btn btn-primary" onClick={() => void doImport()} disabled={working}>
            <Play className="w-4 h-4" />{" "}
            {working ? "Importing…" : `Create & import ${data.rows.length.toLocaleString()} rows`}
          </button>
        </div>
      </div>
    </div>
  );
}
