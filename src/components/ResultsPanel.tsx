"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayground } from "@/lib/store";
import type { QueryResult } from "@/lib/engine";
import { AlertTriangle, CheckCircle2, Clock, Table, Workflow, Download, Loader2 } from "lucide-react";
import Visualizer from "./Visualizer";
import { toCsv, toJson, downloadFile } from "@/lib/csv";

const ROW_H = 30; // fixed row height (px) for virtualization
const OVERSCAN = 10;

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (v instanceof Uint8Array) return `[blob ${v.length}b]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Estimate a stable pixel width per column from the header + a sample of rows. */
function estimateWidths(columns: string[], rows: unknown[][]): number[] {
  const sample = rows.slice(0, 200);
  return columns.map((c, i) => {
    let maxLen = c.length;
    for (const r of sample) {
      const cell = r[i];
      const len = cell == null ? 1 : String(cell).length;
      if (len > maxLen) maxLen = len;
    }
    return Math.min(Math.max(maxLen * 8 + 26, 64), 460);
  });
}

/** Virtualized table — renders only the visible rows so millions stay smooth. */
function VirtualTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(320);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const widths = useMemo(() => estimateWidths(columns, rows), [columns, rows]);
  const tableW = 56 + widths.reduce((a, b) => a + b, 0);

  const total = rows.length * ROW_H;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const topPad = start * ROW_H;
  const bottomPad = Math.max(0, total - end * ROW_H);
  const visible = rows.slice(start, end);

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-auto"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table
        className="text-sm border-collapse"
        style={{ tableLayout: "fixed", width: "100%", minWidth: tableW }}
      >
        <colgroup>
          <col style={{ width: 56 }} />
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              className="text-left px-3 text-muted font-medium border-b sticky top-0 bg-panel2 z-10"
              style={{ borderColor: "var(--border)", height: ROW_H }}
            >
              #
            </th>
            {columns.map((c, i) => (
              <th
                key={i}
                className="text-left px-3 font-semibold border-b bg-panel2 whitespace-nowrap overflow-hidden text-ellipsis sticky top-0 z-10"
                style={{ borderColor: "var(--border)", height: ROW_H }}
                title={c}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topPad > 0 && (
            <tr style={{ height: topPad }}>
              <td colSpan={columns.length + 1} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
          {visible.map((row, k) => {
            const ri = start + k;
            return (
              <tr key={ri} style={{ height: ROW_H, background: ri % 2 ? "var(--row-alt)" : "transparent" }}>
                <td className="px-3 text-muted border-b" style={{ borderColor: "var(--border)" }}>
                  {ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 border-b font-mono whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ borderColor: "var(--border)", color: cell == null ? "var(--muted)" : undefined }}
                    title={formatCell(cell)}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            );
          })}
          {bottomPad > 0 && (
            <tr style={{ height: bottomPad }}>
              <td colSpan={columns.length + 1} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultTable({
  result,
  index,
  showSetLabel,
}: {
  result: QueryResult;
  index: number;
  showSetLabel: boolean;
}) {
  const isWrite = result.columns.length === 0;
  if (isWrite) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <CheckCircle2 className="w-4 h-4 text-good" />
        <span className="text-good">{result.command ?? "OK"}</span>
        <span>· {result.affectedRows ?? result.rowCount} row(s) affected</span>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-1.5 text-xs text-muted border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        {showSetLabel && `Result set ${index + 1} · `}
        {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? "" : "s"}
      </div>
      {result.rows.length === 0 ? (
        <div className="px-3 py-3 text-muted italic text-sm">(no rows)</div>
      ) : (
        <VirtualTable columns={result.columns} rows={result.rows} />
      )}
    </div>
  );
}

export default function ResultsPanel() {
  const outcome = usePlayground((s) => s.outcome);
  const running = usePlayground((s) => s.running);
  const [tab, setTab] = useState<"results" | "visualize">("results");

  // The first result set with columns (a SELECT) — what we let the user export.
  const exportable = outcome?.results.find((r) => r.columns.length > 0);
  const doExport = (fmt: "csv" | "json") => {
    if (!exportable) return;
    const { columns, rows } = exportable;
    if (fmt === "csv") downloadFile("query-results.csv", toCsv(columns, rows), "text/csv");
    else downloadFile("query-results.json", toJson(columns, rows), "application/json");
  };

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
        <div className="flex items-center h-full" data-tour="visualize">
          <TabButton id="results" icon={<Table className="w-3.5 h-3.5" />} label="Results" />
          <TabButton id="visualize" icon={<Workflow className="w-3.5 h-3.5" />} label="Visualize" />
        </div>
        {tab === "results" && outcome && (
          <div className="flex items-center gap-3 pr-3">
            {exportable && (
              <div className="flex items-center gap-1 text-xs" data-tour="export-results">
                <Download className="w-3.5 h-3.5 text-muted" />
                <button className="text-muted hover:text-app" onClick={() => doExport("csv")} title="Download results as CSV">
                  CSV
                </button>
                <span className="text-muted">·</span>
                <button className="text-muted hover:text-app" onClick={() => doExport("json")} title="Download results as JSON">
                  JSON
                </button>
              </div>
            )}
            <span className="flex items-center gap-1 text-muted text-xs">
              <Clock className="w-3.5 h-3.5" />
              {outcome.elapsedMs.toFixed(1)} ms
            </span>
          </div>
        )}
      </div>

      {tab === "visualize" ? (
        <div className="flex-1 min-h-0">
          <Visualizer />
        </div>
      ) : running ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted min-h-0">
          <Loader2 className="w-6 h-6 spin text-accent" />
          <div className="text-sm">Running query…</div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {!outcome && (
            <div className="flex-1 flex items-center justify-center text-muted text-sm px-4 text-center">
              Run a query to see results here — output for SELECT, and row counts for INSERT/UPDATE/DELETE/DDL.
            </div>
          )}

          {outcome?.error && (
            <div className="m-3 p-3 rounded-md border text-sm shrink-0 overflow-auto" style={{ borderColor: "var(--bad)", background: "color-mix(in srgb, var(--bad) 12%, transparent)" }}>
              <div className="flex items-center gap-2 text-bad font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> Error
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs">{outcome.error.message}</pre>
            </div>
          )}

          {outcome?.results.map((r, i) => (
            <ResultTable key={i} result={r} index={i} showSetLabel={(outcome?.results.length ?? 0) > 1} />
          ))}

          {outcome?.ok && outcome.results.length === 0 && !outcome.error && (
            <div className="p-3 text-sm text-good">Statement executed successfully.</div>
          )}
        </div>
      )}
    </div>
  );
}
