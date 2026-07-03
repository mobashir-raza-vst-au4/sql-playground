"use client";

import { usePlayground } from "@/lib/store";
import { Table2, Key, Plus, Pencil, ChevronRight, RefreshCw, Eraser, Trash2, X } from "lucide-react";
import { useState } from "react";

export default function SchemaSidebar({
  onNewTable,
  onEditTable,
}: {
  onNewTable: () => void;
  onEditTable: (table: string) => void;
}) {
  const schema = usePlayground((s) => s.schema);
  const dialect = usePlayground((s) => s.dialect);
  const refreshSchema = usePlayground((s) => s.refreshSchema);
  const newTab = usePlayground((s) => s.newTab);
  const applySetup = usePlayground((s) => s.applySetup);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // In-app confirmation (window.confirm is unreliable in embedded/iframe views).
  const [pending, setPending] = useState<{ type: "clear" | "drop"; table: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const toggle = (t: string) => setOpen((o) => ({ ...o, [t]: !o[t] }));

  // Open the SELECT in a NEW tab so the user's current query isn't lost.
  const peek = (table: string) => {
    newTab({ sql: `SELECT * FROM "${table}" LIMIT 100;`, title: table, run: true });
  };

  // Clear rows / drop go through applySetup so the change persists across
  // reloads and dialect switches (otherwise the original seeds would re-apply).
  const runPending = async () => {
    if (!pending) return;
    const { type, table } = pending;
    const cascade = dialect === "postgres" ? " CASCADE" : "";
    const sql =
      type === "clear" ? `DELETE FROM "${table}";` : `DROP TABLE "${table}"${cascade};`;
    setWorking(true);
    newTab({ sql, title: type === "clear" ? "Clear rows" : "Drop table" });
    const outcome = await applySetup(sql);
    setWorking(false);
    if (!outcome.ok) {
      setActionError(
        `Couldn't ${type === "clear" ? "clear" : "drop"} "${table}": ${outcome.error?.message}` +
          (type === "clear" ? " (rows in another table may reference these — clear the child table first.)" : "")
      );
    } else {
      setActionError(null);
    }
    setPending(null);
  };

  return (
    <aside
      className="w-64 shrink-0 border-r bg-panel flex flex-col min-h-0"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-3 h-9 border-b text-xs text-muted font-medium shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span>SCHEMA · {schema.length} table{schema.length === 1 ? "" : "s"}</span>
        <button className="hover:text-app" onClick={() => void refreshSchema()} title="Refresh schema">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {schema.length === 0 && (
          <div className="text-sm text-muted px-1 py-3 leading-relaxed">
            No tables yet. Click <b>New Table</b> to build one visually, or write{" "}
            <code>CREATE TABLE …</code> in the editor.
          </div>
        )}

        {schema.map((t) => (
          <div key={t.name} className="mb-1">
            <div className="flex items-center gap-1 group rounded hover:bg-hover">
              <button
                className="flex items-center gap-1.5 flex-1 px-1.5 py-1.5 text-left text-sm min-w-0"
                onClick={() => toggle(t.name)}
              >
                <ChevronRight
                  className="w-3.5 h-3.5 text-muted transition-transform shrink-0"
                  style={{ transform: open[t.name] ? "rotate(90deg)" : "none" }}
                />
                <Table2 className="w-4 h-4 text-accent shrink-0" />
                <span className="truncate font-medium">{t.name}</span>
                <span className="text-xs text-muted ml-auto shrink-0">{t.rowCount}</span>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 px-1 text-muted hover:text-app"
                title="Edit / add columns"
                onClick={() => onEditTable(t.name)}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            {open[t.name] && (
              <div className="ml-6 border-l pl-2 py-1" style={{ borderColor: "var(--border)" }}>
                {t.columns.map((c) => (
                  <div key={c.name} className="flex items-center gap-1.5 py-0.5 text-xs">
                    {c.pk ? (
                      <Key className="w-3 h-3 text-warn shrink-0" />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <span className="truncate">{c.name}</span>
                    <span className="text-muted ml-auto shrink-0 lowercase">{c.type}</span>
                    {c.notNull && <span className="text-bad text-[10px] shrink-0">NN</span>}
                  </div>
                ))}
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <button className="text-xs text-accent hover:underline" onClick={() => peek(t.name)}>
                    SELECT * →
                  </button>
                  <button
                    className="text-xs text-muted hover:text-warn flex items-center gap-1"
                    onClick={() => setPending({ type: "clear", table: t.name })}
                    title={`DELETE FROM ${t.name}`}
                  >
                    <Eraser className="w-3 h-3" /> Clear rows
                  </button>
                  <button
                    className="text-xs text-muted hover:text-bad flex items-center gap-1"
                    onClick={() => setPending({ type: "drop", table: t.name })}
                    title={`DROP TABLE ${t.name}`}
                  >
                    <Trash2 className="w-3 h-3" /> Drop
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {actionError && (
        <div
          className="mx-2 mb-2 p-2 rounded text-xs flex items-start gap-1.5"
          style={{ border: "1px solid var(--bad)", color: "var(--bad)" }}
        >
          <span className="flex-1">{actionError}</span>
          <button className="hover:opacity-70" onClick={() => setActionError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="p-2 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <button className="btn w-full justify-center" onClick={onNewTable}>
          <Plus className="w-4 h-4" /> New Table
        </button>
      </div>

      {/* In-app confirmation dialog (replaces window.confirm) */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => e.target === e.currentTarget && setPending(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-panel p-4 shadow-2xl"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="font-semibold mb-1">
              {pending.type === "clear" ? "Clear all rows?" : "Drop table?"}
            </div>
            <p className="text-sm text-muted mb-4">
              {pending.type === "clear" ? (
                <>
                  Delete <b>all rows</b> from <code>{pending.table}</code>? The table structure is kept.
                </>
              ) : (
                <>
                  Permanently drop <code>{pending.table}</code> — its structure and all data.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setPending(null)} disabled={working}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void runPending()} disabled={working}>
                {working ? "Working…" : pending.type === "clear" ? "Clear rows" : "Drop table"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
