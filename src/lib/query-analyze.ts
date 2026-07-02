// A pragmatic SQL analyzer for the visualizer. It is NOT a full parser — it
// recognizes the common teaching shapes: SELECT … FROM t [alias]
// [JOIN t2 [alias] ON a.x = b.y] … [WHERE …] [GROUP BY …] [ORDER BY …] [LIMIT n].
// Anything it can't classify is reported as unsupported (the UI degrades gracefully).

export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS";

export interface TableRef {
  table: string;
  alias: string; // defaults to table name when no alias given
}

export interface OnKey {
  leftAlias: string;
  leftCol: string;
  rightAlias: string;
  rightCol: string;
}

export interface JoinClause {
  type: JoinType;
  right: TableRef;
  on: OnKey | null; // null for CROSS JOIN or an ON we couldn't parse
  rawOn?: string;
}

export type StatementKind =
  | "SELECT"
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "CREATE"
  | "ALTER"
  | "DROP"
  | "OTHER";

export interface AnalyzedQuery {
  kind: StatementKind;
  isSelect: boolean;
  /** For DML/DDL: the table the statement acts on. */
  targetTable: string | null;
  from: TableRef | null;
  joins: JoinClause[];
  where: string | null;
  groupBy: string[];
  orderBy: string | null;
  limit: number | null;
  selectList: string;
  /** True when there is at least one JOIN with a parseable equi-key. */
  visualizableJoin: boolean;
  note?: string;
}

const CLAUSE = /\b(where|group\s+by|order\s+by|having|limit|union|offset)\b/i;

/** Remove -- line comments and block comments so the analyzer sees the real SQL.
 *  (Leading comments were making kind detection fall back to "OTHER".) */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " ") // line comments
    .trim();
}

function stripIdent(s: string): string {
  return s.trim().replace(/^["`]/, "").replace(/["`]$/, "");
}

function parseTableRef(seg: string): TableRef | null {
  // e.g.  orders o   |   "Orders" AS o   |   customers
  const m = /^\s*(["`]?[A-Za-z_][\w]*["`]?)(?:\s+(?:as\s+)?(["`]?[A-Za-z_][\w]*["`]?))?/i.exec(seg);
  if (!m) return null;
  const table = stripIdent(m[1]);
  const alias = m[2] ? stripIdent(m[2]) : table;
  return { table, alias };
}

function parseOn(cond: string): OnKey | null {
  // First simple equality between two qualified columns: a.x = b.y
  const m =
    /(["`]?[A-Za-z_][\w]*["`]?)\.(["`]?[A-Za-z_][\w]*["`]?)\s*=\s*(["`]?[A-Za-z_][\w]*["`]?)\.(["`]?[A-Za-z_][\w]*["`]?)/.exec(
      cond
    );
  if (!m) return null;
  return {
    leftAlias: stripIdent(m[1]),
    leftCol: stripIdent(m[2]),
    rightAlias: stripIdent(m[3]),
    rightCol: stripIdent(m[4]),
  };
}

function detectKind(sql: string): StatementKind {
  const m = /^\s*([a-z]+)/i.exec(sql);
  const w = (m?.[1] ?? "").toUpperCase();
  if (w === "SELECT" || w === "WITH") return "SELECT";
  if (w === "INSERT" || w === "UPDATE" || w === "DELETE") return w as StatementKind;
  if (w === "CREATE" || w === "ALTER" || w === "DROP") return w as StatementKind;
  return "OTHER";
}

function extractWhere(sql: string): string | null {
  const m = /\bwhere\b([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\breturning\b|\blimit\b|$)/i.exec(sql);
  return m ? m[1].trim() : null;
}

export function analyzeQuery(sqlRaw: string): AnalyzedQuery {
  const sql = stripComments(sqlRaw).replace(/;\s*$/, "").trim();
  const kind = detectKind(sql);
  const empty: AnalyzedQuery = {
    kind,
    isSelect: kind === "SELECT",
    targetTable: null,
    from: null,
    joins: [],
    where: null,
    groupBy: [],
    orderBy: null,
    limit: null,
    selectList: "",
    visualizableJoin: false,
  };

  // --- Non-SELECT statements: pull out the target table (+ WHERE for UPDATE/DELETE) ---
  if (kind !== "SELECT") {
    const patterns: Partial<Record<StatementKind, RegExp>> = {
      INSERT: /\binsert\s+into\s+(["`]?[A-Za-z_][\w]*["`]?)/i,
      UPDATE: /\bupdate\s+(["`]?[A-Za-z_][\w]*["`]?)/i,
      DELETE: /\bdelete\s+from\s+(["`]?[A-Za-z_][\w]*["`]?)/i,
      CREATE: /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(["`]?[A-Za-z_][\w]*["`]?)/i,
      ALTER: /\balter\s+table\s+(["`]?[A-Za-z_][\w]*["`]?)/i,
      DROP: /\bdrop\s+table\s+(?:if\s+exists\s+)?(["`]?[A-Za-z_][\w]*["`]?)/i,
    };
    const re = patterns[kind];
    const m = re ? re.exec(sql) : null;
    return {
      ...empty,
      targetTable: m ? stripIdent(m[1]) : null,
      where: kind === "UPDATE" || kind === "DELETE" ? extractWhere(sql) : null,
    };
  }

  const fromIdx = sql.search(/\bfrom\b/i);
  if (fromIdx === -1) return { ...empty, isSelect: true, note: "No FROM clause found." };

  const selectList = sql.slice(6, fromIdx).trim();
  const afterFrom = sql.slice(fromIdx + 4);

  // Split off the JOINs from trailing clauses.
  // Find where the FROM/JOIN section ends (first WHERE/GROUP/ORDER/…).
  const clauseMatch = CLAUSE.exec(afterFrom);
  const fromJoinPart = clauseMatch ? afterFrom.slice(0, clauseMatch.index) : afterFrom;
  const tail = clauseMatch ? afterFrom.slice(clauseMatch.index) : "";

  // Base table = text up to the first JOIN (or end).
  const joinSplit = fromJoinPart.split(/\b((?:inner|left|right|full|cross)\s+)?(?:outer\s+)?join\b/i);
  const from = parseTableRef(joinSplit[0]);

  const joins: JoinClause[] = [];
  // joinSplit alternates: [base, kw1, segment1, kw2, segment2, ...]
  for (let i = 1; i < joinSplit.length; i += 2) {
    const kw = (joinSplit[i] || "").trim().toUpperCase();
    const type: JoinType =
      kw === "LEFT" ? "LEFT" : kw === "RIGHT" ? "RIGHT" : kw === "FULL" ? "FULL" : kw === "CROSS" ? "CROSS" : "INNER";
    const seg = joinSplit[i + 1] ?? "";
    // seg = "table alias ON cond"
    const onIdx = seg.search(/\bon\b/i);
    const tableSeg = onIdx === -1 ? seg : seg.slice(0, onIdx);
    const onCond = onIdx === -1 ? "" : seg.slice(onIdx + 2);
    const right = parseTableRef(tableSeg);
    if (!right) continue;
    joins.push({ type, right, on: parseOn(onCond), rawOn: onCond.trim() || undefined });
  }

  // Trailing clauses
  const whereM = /\bwhere\b([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|\boffset\b|$)/i.exec(tail);
  const groupM = /\bgroup\s+by\b([\s\S]*?)(?=\border\s+by\b|\bhaving\b|\blimit\b|\boffset\b|$)/i.exec(tail);
  const orderM = /\border\s+by\b([\s\S]*?)(?=\blimit\b|\boffset\b|$)/i.exec(tail);
  const limitM = /\blimit\b\s+(\d+)/i.exec(tail);

  const groupBy = groupM
    ? groupM[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const visualizableJoin = joins.some((j) => j.on !== null);

  return {
    kind: "SELECT",
    isSelect: true,
    targetTable: from?.table ?? null,
    from,
    joins,
    where: whereM ? whereM[1].trim() : null,
    groupBy,
    orderBy: orderM ? orderM[1].trim() : null,
    limit: limitM ? Number(limitM[1]) : null,
    selectList,
    visualizableJoin,
  };
}

/** Build the "FROM … JOIN …" fragment (without SELECT/WHERE) for COUNT probes. */
export function fromJoinFragment(q: AnalyzedQuery, quote: (id: string) => string): string {
  if (!q.from) return "";
  const ref = (r: TableRef) =>
    r.alias === r.table ? quote(r.table) : `${quote(r.table)} ${quote(r.alias)}`;
  let s = ref(q.from);
  for (const j of q.joins) {
    const kw = j.type === "INNER" ? "JOIN" : `${j.type} JOIN`;
    s += ` ${kw} ${ref(j.right)}`;
    if (j.on) {
      s += ` ON ${quote(j.on.leftAlias)}.${quote(j.on.leftCol)} = ${quote(j.on.rightAlias)}.${quote(j.on.rightCol)}`;
    } else if (j.rawOn) {
      s += ` ON ${j.rawOn}`;
    }
  }
  return s;
}
