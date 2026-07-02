import type { DbEngine, Dialect } from "./engine";
import { maybeQuote } from "./sql-intel";
import { analyzeQuery, fromJoinFragment, type AnalyzedQuery, type JoinType } from "./query-analyze";

const MAX_ROWS = 12;

export interface SideData {
  table: string;
  alias: string;
  columns: string[];
  rows: unknown[][];
  keyCol: string;
  keyIndex: number;
  truncated: boolean;
}

export interface JoinViz {
  type: JoinType;
  left: SideData;
  right: SideData;
  /** Pairs of row indices (into left.rows / right.rows) that match on the key. */
  matches: { l: number; r: number }[];
  leftUnmatched: number[];
  rightUnmatched: number[];
}

export interface PipelineStep {
  label: string;
  detail: string;
  count: number | null; // rows/groups after this step; null if not applicable/failed
}

export interface TableStateViz {
  table: string;
  exists: boolean;
  columns: string[];
  types: string[];
  rows: unknown[][];
  truncated: boolean;
  totalRows: number;
  /** Headline describing the effect of the statement (e.g. "3 rows deleted"). */
  summary: string;
  /** "added" | "removed" | "changed" | "created" | "dropped" — drives styling. */
  effect: "added" | "removed" | "changed" | "created" | "dropped" | "none";
}

export interface Visualization {
  analysis: AnalyzedQuery;
  join: JoinViz | null;
  pipeline: PipelineStep[];
  tableState: TableStateViz | null;
  message?: string;
}

function eqLoose(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

async function probeCount(engine: DbEngine, sql: string): Promise<number | null> {
  try {
    const out = await engine.exec(sql);
    if (!out.ok || out.results.length === 0) return null;
    const last = out.results[out.results.length - 1];
    const v = last.rows[0]?.[0];
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

async function fetchSide(
  engine: DbEngine,
  dialect: Dialect,
  table: string,
  alias: string,
  keyCol: string
): Promise<SideData | null> {
  const out = await engine.exec(`SELECT * FROM ${maybeQuote(table, dialect)} LIMIT ${MAX_ROWS + 1}`);
  if (!out.ok || out.results.length === 0) return null;
  const res = out.results[0];
  const truncated = res.rows.length > MAX_ROWS;
  const rows = res.rows.slice(0, MAX_ROWS);
  const keyIndex = res.columns.findIndex((c) => c.toLowerCase() === keyCol.toLowerCase());
  return { table, alias, columns: res.columns, rows, keyCol, keyIndex, truncated };
}

function aliasToTable(q: AnalyzedQuery): Map<string, string> {
  const m = new Map<string, string>();
  if (q.from) m.set(q.from.alias.toLowerCase(), q.from.table);
  for (const j of q.joins) m.set(j.right.alias.toLowerCase(), j.right.table);
  return m;
}

async function buildTableState(
  engine: DbEngine,
  dialect: Dialect,
  analysis: AnalyzedQuery,
  affectedRows: number
): Promise<{ tableState: TableStateViz | null; pipeline: PipelineStep[] }> {
  const target = analysis.targetTable;
  if (!target) return { tableState: null, pipeline: [] };

  const schema = await engine.introspect();
  const meta = schema.find((t) => t.name.toLowerCase() === target.toLowerCase());
  const exists = !!meta;
  const total = meta?.rowCount ?? 0;

  let rows: unknown[][] = [];
  let columns: string[] = meta?.columns.map((c) => c.name) ?? [];
  const types: string[] = meta?.columns.map((c) => c.type) ?? [];
  let truncated = false;
  if (exists) {
    const out = await engine.exec(`SELECT * FROM ${maybeQuote(target, dialect)} LIMIT ${MAX_ROWS + 1}`);
    if (out.ok && out.results[0]) {
      columns = out.results[0].columns;
      truncated = out.results[0].rows.length > MAX_ROWS;
      rows = out.results[0].rows.slice(0, MAX_ROWS);
    }
  }

  const whereNote = analysis.where ? ` matching WHERE ${analysis.where}` : "";
  let summary = "";
  let effect: TableStateViz["effect"] = "none";
  const pipeline: PipelineStep[] = [];

  switch (analysis.kind) {
    case "INSERT":
      effect = "added";
      summary = `${affectedRows} row${affectedRows === 1 ? "" : "s"} inserted into "${target}". It now holds ${total} row${total === 1 ? "" : "s"}.`;
      pipeline.push(
        { label: "INSERT INTO", detail: `Add new rows to ${target}`, count: affectedRows },
        { label: "RESULT", detail: `${target} now contains`, count: total }
      );
      break;
    case "UPDATE":
      effect = "changed";
      summary = `${affectedRows} row${affectedRows === 1 ? "" : "s"} updated in "${target}"${whereNote}.`;
      pipeline.push(
        { label: "FROM", detail: `Scan all rows of ${target}`, count: total },
        { label: "WHERE", detail: analysis.where ? `Match rows where ${analysis.where}` : "All rows (no filter)", count: affectedRows },
        { label: "SET", detail: `Update matched rows`, count: affectedRows }
      );
      break;
    case "DELETE":
      effect = "removed";
      summary = `${affectedRows} row${affectedRows === 1 ? "" : "s"} deleted from "${target}"${whereNote}. ${total} remain.`;
      pipeline.push(
        { label: "FROM", detail: `Scan ${target} (${total} remain after delete)`, count: total },
        { label: "WHERE", detail: analysis.where ? `Match rows where ${analysis.where}` : "All rows (no filter!)", count: affectedRows },
        { label: "DELETE", detail: `Remove matched rows`, count: affectedRows }
      );
      break;
    case "CREATE":
      effect = "created";
      summary = exists
        ? `Table "${target}" created with ${columns.length} column${columns.length === 1 ? "" : "s"}.`
        : `Statement ran, but "${target}" wasn't found (it may have failed or used a different name).`;
      break;
    case "ALTER":
      effect = "changed";
      summary = `Table "${target}" altered — it now has ${columns.length} column${columns.length === 1 ? "" : "s"}.`;
      break;
    case "DROP":
      effect = "dropped";
      summary = exists ? `Drop requested, but "${target}" still exists.` : `Table "${target}" was dropped.`;
      break;
    default:
      summary = `Statement executed against "${target}".`;
  }

  return {
    tableState: { table: target, exists, columns, types, rows, truncated, totalRows: total, summary, effect },
    pipeline,
  };
}

export async function buildVisualization(
  sql: string,
  engine: DbEngine,
  dialect: Dialect,
  affectedRows = 0
): Promise<Visualization> {
  const analysis = analyzeQuery(sql);
  const quote = (id: string) => maybeQuote(id, dialect);

  // --- Non-SELECT statements: show the affected table + effect ---
  if (analysis.kind !== "SELECT") {
    if (analysis.kind === "OTHER") {
      return { analysis, join: null, pipeline: [], tableState: null, message: "This statement type isn't visualized yet." };
    }
    const { tableState, pipeline } = await buildTableState(engine, dialect, analysis, affectedRows);
    return { analysis, join: null, pipeline, tableState };
  }

  // --- JOIN view (first join with a parseable ON key) ---
  let join: JoinViz | null = null;
  const firstJoin = analysis.joins.find((j) => j.on !== null);
  if (firstJoin && firstJoin.on) {
    const map = aliasToTable(analysis);
    const on = firstJoin.on;
    // The "right" side is the newly JOINed table; the "left" side is whatever it
    // is joined onto. This matters for LEFT/RIGHT semantics — the ON operands can
    // be written in either order, so we can't rely on on.left/on.right.
    const joinedAlias = firstJoin.right.alias.toLowerCase();
    const onLeftIsJoined = on.leftAlias.toLowerCase() === joinedAlias;
    const rightAlias = firstJoin.right.alias;
    const rightCol = onLeftIsJoined ? on.leftCol : on.rightCol;
    const leftAlias = onLeftIsJoined ? on.rightAlias : on.leftAlias;
    const leftCol = onLeftIsJoined ? on.rightCol : on.leftCol;
    const leftTable = map.get(leftAlias.toLowerCase());
    const rightTable = firstJoin.right.table;
    if (leftTable && rightTable) {
      const left = await fetchSide(engine, dialect, leftTable, leftAlias, leftCol);
      const right = await fetchSide(engine, dialect, rightTable, rightAlias, rightCol);
      if (left && right && left.keyIndex >= 0 && right.keyIndex >= 0) {
        const matches: { l: number; r: number }[] = [];
        const leftMatched = new Set<number>();
        const rightMatched = new Set<number>();
        for (let li = 0; li < left.rows.length; li++) {
          const lv = left.rows[li][left.keyIndex];
          for (let ri = 0; ri < right.rows.length; ri++) {
            if (eqLoose(lv, right.rows[ri][right.keyIndex])) {
              matches.push({ l: li, r: ri });
              leftMatched.add(li);
              rightMatched.add(ri);
            }
          }
        }
        join = {
          type: firstJoin.type,
          left,
          right,
          matches,
          leftUnmatched: left.rows.map((_, i) => i).filter((i) => !leftMatched.has(i)),
          rightUnmatched: right.rows.map((_, i) => i).filter((i) => !rightMatched.has(i)),
        };
      }
    }
  }

  // --- Execution pipeline (real row counts via COUNT probes) ---
  const pipeline: PipelineStep[] = [];
  const fragment = fromJoinFragment(analysis, quote);
  if (fragment) {
    const baseTable = analysis.from?.table ?? "";
    const baseCount = await probeCount(engine, `SELECT COUNT(*) FROM ${quote(baseTable)}`);
    pipeline.push({
      label: "FROM",
      detail: `Read every row from ${baseTable}`,
      count: baseCount,
    });

    if (analysis.joins.length > 0) {
      const joinCount = await probeCount(engine, `SELECT COUNT(*) FROM ${fragment}`);
      pipeline.push({
        label: analysis.joins.map((j) => (j.type === "INNER" ? "JOIN" : `${j.type} JOIN`)).join(" + "),
        detail: `Combine matching rows across ${analysis.joins.length + 1} tables`,
        count: joinCount,
      });
    }

    if (analysis.where) {
      const whereCount = await probeCount(engine, `SELECT COUNT(*) FROM ${fragment} WHERE ${analysis.where}`);
      pipeline.push({
        label: "WHERE",
        detail: `Keep only rows where ${analysis.where}`,
        count: whereCount,
      });
    }

    if (analysis.groupBy.length > 0) {
      const whereClause = analysis.where ? ` WHERE ${analysis.where}` : "";
      const groups = await probeCount(
        engine,
        `SELECT COUNT(*) FROM (SELECT 1 AS x FROM ${fragment}${whereClause} GROUP BY ${analysis.groupBy.join(", ")}) t`
      );
      pipeline.push({
        label: "GROUP BY",
        detail: `Collapse rows into groups by ${analysis.groupBy.join(", ")}`,
        count: groups,
      });
    }

    pipeline.push({
      label: "SELECT",
      detail: `Project columns: ${analysis.selectList.length > 60 ? analysis.selectList.slice(0, 57) + "…" : analysis.selectList}`,
      count: null,
    });

    if (analysis.orderBy) {
      pipeline.push({ label: "ORDER BY", detail: `Sort by ${analysis.orderBy}`, count: null });
    }
    if (analysis.limit != null) {
      pipeline.push({ label: "LIMIT", detail: `Return at most ${analysis.limit} rows`, count: analysis.limit });
    }
  }

  let message: string | undefined;
  if (!join && pipeline.length === 0) message = "Nothing to visualize for this query yet.";

  return { analysis, join, pipeline, tableState: null, message };
}
