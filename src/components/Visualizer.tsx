"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePlayground } from "@/lib/store";
import { buildVisualization, type Visualization, type JoinViz, type TableStateViz } from "@/lib/visual-data";
import type { JoinType } from "@/lib/query-analyze";
import { Workflow, Loader2, Info, Plus, Minus, Pencil, Table2, Trash2, Sparkles } from "lucide-react";

/** A small "explain with AI" button used across the visualizer views. */
function NarrateButton({ prompt, label = "Explain with AI" }: { prompt: string; label?: string }) {
  const askAi = usePlayground((s) => s.askAi);
  return (
    <button className="btn !py-1 !px-2 text-xs" onClick={() => askAi(prompt)} title="Ask the AI Tutor to explain this">
      <Sparkles className="w-3.5 h-3.5 text-accent" /> {label}
    </button>
  );
}

const JOIN_EXPLAIN: Record<JoinType, string> = {
  INNER: "Keeps only rows that have a match on BOTH sides. Unmatched rows are dropped.",
  LEFT: "Keeps ALL left-table rows. Where there's no match, right-side columns become NULL.",
  RIGHT: "Keeps ALL right-table rows. Where there's no match, left-side columns become NULL.",
  FULL: "Keeps ALL rows from both tables, filling the missing side with NULL.",
  CROSS: "Pairs every left row with every right row (Cartesian product).",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  const s = String(v);
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}

/** Two overlapping circles shaded to match the join type. */
function VennDiagram({ type }: { type: JoinType }) {
  const includeLeft = type === "LEFT" || type === "FULL";
  const includeRight = type === "RIGHT" || type === "FULL";
  const showInner = type !== "CROSS";
  return (
    <svg width="120" height="70" viewBox="0 0 120 70">
      <defs>
        <clipPath id="venn-a">
          <circle cx="46" cy="35" r="28" />
        </clipPath>
      </defs>
      {includeLeft && <circle cx="46" cy="35" r="28" fill="var(--accent)" opacity="0.3" />}
      {includeRight && <circle cx="74" cy="35" r="28" fill="var(--accent)" opacity="0.3" />}
      {showInner && (
        <g clipPath="url(#venn-a)">
          <circle cx="74" cy="35" r="28" fill="var(--accent)" opacity="0.65" />
        </g>
      )}
      <circle cx="46" cy="35" r="28" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <circle cx="74" cy="35" r="28" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
    </svg>
  );
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function JoinView({ join }: { join: JoinViz }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rightRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const leftKeptUnmatched = join.type === "LEFT" || join.type === "FULL";
  const rightKeptUnmatched = join.type === "RIGHT" || join.type === "FULL";
  const leftUn = new Set(join.leftUnmatched);
  const rightUn = new Set(join.rightUnmatched);

  useLayoutEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      if (!c) return;
      const cb = c.getBoundingClientRect();
      setSize({ w: cb.width, h: cb.height });
      const next: Line[] = [];
      for (const m of join.matches) {
        const le = leftRefs.current[m.l];
        const re = rightRefs.current[m.r];
        if (!le || !re) continue;
        const lb = le.getBoundingClientRect();
        const rb = re.getBoundingClientRect();
        next.push({
          x1: lb.right - cb.left,
          y1: lb.top + lb.height / 2 - cb.top,
          x2: rb.left - cb.left,
          y2: rb.top + rb.height / 2 - cb.top,
        });
      }
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [join]);

  const Row = ({
    row,
    cols,
    keyIndex,
    dim,
    tag,
    refCb,
  }: {
    row: unknown[];
    cols: string[];
    keyIndex: number;
    dim: boolean;
    tag?: string;
    refCb: (el: HTMLDivElement | null) => void;
  }) => (
    <div
      ref={refCb}
      className="rounded-md border px-2 py-1.5 text-xs transition-opacity"
      style={{
        borderColor: "var(--border)",
        background: "var(--panel2)",
        opacity: dim ? 0.4 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>
          {cols[keyIndex]}={fmt(row[keyIndex])}
        </span>
        {tag && (
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--warn) 22%, transparent)", color: "var(--warn)" }}
          >
            {tag}
          </span>
        )}
      </div>
      <div className="text-muted truncate mt-0.5 font-mono">
        {cols.map((c, i) => (i === keyIndex ? null : `${c}:${fmt(row[i])}`)).filter(Boolean).join("  ")}
      </div>
    </div>
  );

  return (
    <div className="p-4">
      {/* Header: join type + venn + explanation */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <VennDiagram type={join.type} />
        <div className="min-w-0">
          <div className="font-semibold text-sm">
            {join.type} JOIN · {join.left.table} ↔ {join.right.table}
          </div>
          <div className="text-xs text-muted max-w-xl">{JOIN_EXPLAIN[join.type]}</div>
          <div className="text-xs mt-1">
            <span style={{ color: "var(--accent)" }}>{join.matches.length}</span> matching pair
            {join.matches.length === 1 ? "" : "s"} on{" "}
            <code className="font-mono">
              {join.left.alias}.{join.left.keyCol} = {join.right.alias}.{join.right.keyCol}
            </code>
          </div>
        </div>
        <div className="ml-auto">
          <NarrateButton
            label="Explain this JOIN"
            prompt={`Explain the ${join.type} JOIN shown in the visualizer between "${join.left.table}" (left) and "${join.right.table}" (right), matched on ${join.left.alias}.${join.left.keyCol} = ${join.right.alias}.${join.right.keyCol}. There are ${join.matches.length} matching pair(s); ${join.leftUnmatched.length} left row(s) and ${join.rightUnmatched.length} right row(s) are unmatched. In plain language, explain which rows get combined, why the unmatched rows are ${join.type === "INNER" ? "dropped" : "kept with NULLs"}, and when you'd use a ${join.type} JOIN.`}
          />
        </div>
      </div>

      {/* Two columns + connecting lines */}
      <div ref={containerRef} className="relative grid grid-cols-2 gap-24">
        <svg
          className="absolute inset-0 pointer-events-none"
          width={size.w}
          height={size.h}
          style={{ zIndex: 1, overflow: "visible" }}
        >
          {lines.map((l, i) => (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              opacity="0.7"
              strokeDasharray="200"
              strokeDashoffset="200"
            >
              <animate attributeName="stroke-dashoffset" from="200" to="0" dur="0.5s" fill="freeze" />
            </path>
          ))}
        </svg>

        <div className="space-y-2 relative" style={{ zIndex: 2 }}>
          <div className="text-xs font-medium text-muted sticky top-0">
            {join.left.alias} · {join.left.table}
          </div>
          {join.left.rows.map((row, i) => {
            const unmatched = leftUn.has(i);
            return (
              <Row
                key={i}
                row={row}
                cols={join.left.columns}
                keyIndex={join.left.keyIndex}
                dim={unmatched && !leftKeptUnmatched}
                tag={unmatched ? (leftKeptUnmatched ? "kept → NULL" : "dropped") : undefined}
                refCb={(el) => (leftRefs.current[i] = el)}
              />
            );
          })}
          {join.left.truncated && <div className="text-[11px] text-muted italic">…more rows</div>}
        </div>

        <div className="space-y-2 relative" style={{ zIndex: 2 }}>
          <div className="text-xs font-medium text-muted sticky top-0 text-right">
            {join.right.alias} · {join.right.table}
          </div>
          {join.right.rows.map((row, i) => {
            const unmatched = rightUn.has(i);
            return (
              <Row
                key={i}
                row={row}
                cols={join.right.columns}
                keyIndex={join.right.keyIndex}
                dim={unmatched && !rightKeptUnmatched}
                tag={unmatched ? (rightKeptUnmatched ? "kept → NULL" : "dropped") : undefined}
                refCb={(el) => (rightRefs.current[i] = el)}
              />
            );
          })}
          {join.right.truncated && <div className="text-[11px] text-muted italic text-right">…more rows</div>}
        </div>
      </div>
    </div>
  );
}

function Pipeline({ viz }: { viz: Visualization }) {
  if (viz.pipeline.length === 0) return null;
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-muted flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> How SQL runs this query, step by step (real row counts):
        </div>
        <NarrateButton prompt="Walk me through how this query executes step by step — what each stage of the pipeline (FROM, JOIN, WHERE, GROUP BY, SELECT, ORDER BY, LIMIT) does and how the row count changes." />
      </div>
      <div className="space-y-2">
        {viz.pipeline.map((s, i) => (
          <div key={i} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {i + 1}
              </div>
              {i < viz.pipeline.length - 1 && <div className="w-px flex-1 my-1" style={{ background: "var(--border)" }} />}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-sm">{s.label}</span>
                {s.count != null && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: "var(--panel2)", color: "var(--accent)" }}
                  >
                    {s.count.toLocaleString()} {s.label === "GROUP BY" ? "groups" : "rows"}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted mt-0.5">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const EFFECT_STYLE: Record<
  TableStateViz["effect"],
  { color: string; icon: React.ReactNode; label: string }
> = {
  added: { color: "var(--good)", icon: <Plus className="w-4 h-4" />, label: "INSERT" },
  removed: { color: "var(--bad)", icon: <Minus className="w-4 h-4" />, label: "DELETE" },
  changed: { color: "var(--warn)", icon: <Pencil className="w-4 h-4" />, label: "UPDATE" },
  created: { color: "var(--good)", icon: <Table2 className="w-4 h-4" />, label: "CREATE" },
  dropped: { color: "var(--bad)", icon: <Trash2 className="w-4 h-4" />, label: "DROP" },
  none: { color: "var(--muted)", icon: <Info className="w-4 h-4" />, label: "" },
};

function TableStateView({ ts }: { ts: TableStateViz }) {
  const style = EFFECT_STYLE[ts.effect];
  return (
    <div className="p-4">
      <div
        className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md"
        style={{ background: `color-mix(in srgb, ${style.color} 14%, transparent)`, color: style.color }}
      >
        {style.icon}
        <span className="text-sm font-medium flex-1">{ts.summary}</span>
      </div>
      <div className="mb-3">
        <NarrateButton
          prompt={`Explain what this ${ts.effect === "removed" ? "DELETE" : ts.effect === "added" ? "INSERT" : ts.effect === "changed" ? "UPDATE/ALTER" : ts.effect} statement did to the "${ts.table}" table, and any concepts a learner should understand about it.`}
        />
      </div>

      {!ts.exists ? (
        <div className="text-sm text-muted italic">
          Table <code>{ts.table}</code> no longer exists.
        </div>
      ) : (
        <>
          <div className="text-xs text-muted mb-2">
            Current state of <b>{ts.table}</b> · {ts.totalRows} row{ts.totalRows === 1 ? "" : "s"}
          </div>
          <div className="overflow-auto border rounded" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {ts.columns.map((c, i) => (
                    <th key={i} className="text-left px-3 py-1.5 font-semibold bg-panel2 whitespace-nowrap">
                      {c}
                      {ts.types[i] && <span className="text-muted font-normal lowercase text-xs ml-1">{ts.types[i]}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ts.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 ? "var(--row-alt)" : "transparent" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 font-mono whitespace-nowrap">
                        {fmt(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
                {ts.rows.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(1, ts.columns.length)} className="px-3 py-3 text-muted italic">
                      (table is empty)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {ts.truncated && <div className="text-[11px] text-muted italic mt-1">…more rows</div>}
        </>
      )}
    </div>
  );
}

export default function Visualizer() {
  const lastRunSql = usePlayground((s) => s.lastRunSql);
  const dialect = usePlayground((s) => s.dialect);
  const outcome = usePlayground((s) => s.outcome);
  const [viz, setViz] = useState<Visualization | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const engine = usePlayground.getState().engine;
    if (!engine || !lastRunSql.trim()) {
      setViz(null);
      return;
    }
    // Affected-row count from the last run (for INSERT/UPDATE/DELETE views).
    const last = outcome?.results[outcome.results.length - 1];
    const affected = last?.affectedRows ?? last?.rowCount ?? 0;
    setLoading(true);
    buildVisualization(lastRunSql, engine, dialect, affected)
      .then((v) => !cancelled && setViz(v))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lastRunSql, dialect, outcome]);

  if (!lastRunSql.trim()) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted text-sm">
        <Workflow className="w-7 h-7" />
        Run any query to see how it works — JOIN matching, the execution pipeline, or how a write changes the table.
      </div>
    );
  }

  if (loading && !viz) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-muted text-sm">
        <Loader2 className="w-5 h-5 spin" /> Analyzing query…
      </div>
    );
  }

  // Non-SELECT (INSERT/UPDATE/DELETE/DDL) → table-state view.
  if (viz?.tableState) {
    return (
      <div className="h-full overflow-auto">
        <TableStateView ts={viz.tableState} />
        {viz.pipeline.length > 0 && (
          <>
            <div className="border-t" style={{ borderColor: "var(--border)" }} />
            <Pipeline viz={viz} />
          </>
        )}
      </div>
    );
  }

  if (viz?.message && !viz.join) {
    return (
      <div className="h-full flex flex-col">
        {viz.pipeline.length > 0 ? (
          <Pipeline viz={viz} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm px-6 text-center">
            {viz.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {viz?.join && <JoinView join={viz.join} />}
      {viz && viz.join && <div className="border-t" style={{ borderColor: "var(--border)" }} />}
      {viz && <Pipeline viz={viz} />}
    </div>
  );
}
