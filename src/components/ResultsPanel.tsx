"use client";

import { useState } from "react";
import { usePlayground } from "@/lib/store";
import type { QueryResult } from "@/lib/engine";
import { AlertTriangle, CheckCircle2, Clock, Table, Workflow } from "lucide-react";
import Visualizer from "./Visualizer";

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (v instanceof Uint8Array) return `[blob ${v.length}b]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ResultTable({ result, index }: { result: QueryResult; index: number }) {
  const isWrite = result.columns.length === 0;
  if (isWrite) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted border-b" style={{ borderColor: "var(--border)" }}>
        <CheckCircle2 className="w-4 h-4 text-good" />
        <span className="text-good">{result.command ?? "OK"}</span>
        <span>· {result.affectedRows ?? result.rowCount} row(s) affected</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-1.5 text-xs text-muted border-b sticky top-0 bg-panel z-10" style={{ borderColor: "var(--border)" }}>
        Result set {index + 1} · {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-1.5 text-muted font-medium border-b sticky top-0 bg-panel2 w-10" style={{ borderColor: "var(--border)" }}>
                #
              </th>
              {result.columns.map((c, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-1.5 font-semibold border-b bg-panel2 whitespace-nowrap"
                  style={{ borderColor: "var(--border)" }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 ? "var(--row-alt)" : "transparent" }}>
                <td className="px-3 py-1.5 text-muted border-b" style={{ borderColor: "var(--border)" }}>
                  {ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 border-b font-mono whitespace-nowrap"
                    style={{ borderColor: "var(--border)", color: cell == null ? "var(--muted)" : undefined }}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={result.columns.length + 1} className="px-3 py-3 text-muted italic">
                  (no rows)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResultsPanel() {
  const outcome = usePlayground((s) => s.outcome);
  const [tab, setTab] = useState<"results" | "visualize">("results");

  const TabButton = ({ id, icon, label }: { id: typeof tab; icon: React.ReactNode; label: string }) => (
    <button
      className="flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 -mb-px transition-colors"
      style={{
        borderColor: tab === id ? "var(--accent)" : "transparent",
        color: tab === id ? "var(--text)" : "var(--muted)",
      }}
      onClick={() => setTab(id)}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-panel">
      <div
        className="flex items-center justify-between px-1 h-9 border-b border-t shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center h-full">
          <TabButton id="results" icon={<Table className="w-3.5 h-3.5" />} label="Results" />
          <TabButton id="visualize" icon={<Workflow className="w-3.5 h-3.5" />} label="Visualize" />
        </div>
        {tab === "results" && outcome && (
          <span className="flex items-center gap-1 text-muted text-xs pr-3">
            <Clock className="w-3.5 h-3.5" />
            {outcome.elapsedMs.toFixed(1)} ms
          </span>
        )}
      </div>

      {tab === "visualize" ? (
        <div className="flex-1 min-h-0">
          <Visualizer />
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0">
        {!outcome && (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            Run a query to see results here — output for SELECT, and row counts for INSERT/UPDATE/DELETE/DDL.
          </div>
        )}

        {outcome?.error && (
          <div className="m-3 p-3 rounded-md border text-sm" style={{ borderColor: "var(--bad)", background: "color-mix(in srgb, var(--bad) 12%, transparent)" }}>
            <div className="flex items-center gap-2 text-bad font-medium mb-1">
              <AlertTriangle className="w-4 h-4" /> Error
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs">{outcome.error.message}</pre>
          </div>
        )}

        {outcome?.results.map((r, i) => (
          <ResultTable key={i} result={r} index={i} />
        ))}

        {outcome?.ok && outcome.results.length === 0 && !outcome.error && (
          <div className="p-3 text-sm text-good">Statement executed successfully.</div>
        )}
        </div>
      )}
    </div>
  );
}
