import type { Dialect, TableMeta } from "./engine";

// Reserved words that must be quoted if used as an identifier.
const RESERVED = new Set([
  "select", "from", "where", "join", "inner", "left", "right", "full", "outer",
  "on", "group", "by", "order", "having", "limit", "offset", "insert", "into",
  "values", "update", "set", "delete", "create", "table", "drop", "alter",
  "and", "or", "not", "null", "as", "distinct", "union", "all", "in", "like",
  "between", "is", "case", "when", "then", "else", "end", "asc", "desc",
  "primary", "key", "foreign", "references", "default", "check", "unique",
  "count", "sum", "avg", "min", "max", "user", "order", "desc", "asc", "index",
]);

// Keywords that can appear right after a table name and must NOT be read as an alias.
const ALIAS_STOP = new Set([
  "on", "where", "join", "inner", "left", "right", "full", "outer", "cross",
  "group", "order", "having", "limit", "offset", "union", "using", "as",
  "and", "or", "set", "values", "natural", "for", "returning",
]);

/** A safe lowercase identifier needs no quoting; anything else (camelCase,
 *  spaces, reserved words, leading digit…) does. */
export function needsQuote(id: string): boolean {
  return !/^[a-z_][a-z0-9_]*$/.test(id) || RESERVED.has(id.toLowerCase());
}

export function quoteId(id: string, dialect: Dialect): string {
  const q = dialect === "mysql" ? "`" : '"';
  return q + id.split(q).join(q + q) + q;
}

/** Quote an identifier only if the dialect requires it to preserve the name. */
export function maybeQuote(id: string, dialect: Dialect): string {
  return needsQuote(id) ? quoteId(id, dialect) : id;
}

function stripQuotes(s: string): string {
  return s.replace(/^["`]/, "").replace(/["`]$/, "");
}

/**
 * Map table aliases (and bare table names) to their real table names, by
 * scanning FROM/JOIN clauses. `FROM orders o` → {o: orders, orders: orders}.
 */
export function parseAliases(sql: string, tableNames: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const known = new Set(tableNames.map((t) => t.toLowerCase()));
  const re =
    /\b(?:from|join)\s+(["`]?[A-Za-z_][\w]*["`]?)(?:\s+(?:as\s+)?(["`]?[A-Za-z_][\w]*["`]?))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = stripQuotes(m[1]);
    // A table name is itself usable as a qualifier.
    const real = tableNames.find((t) => t.toLowerCase() === table.toLowerCase());
    if (real) map.set(real.toLowerCase(), real);
    const aliasRaw = m[2] ? stripQuotes(m[2]) : undefined;
    if (aliasRaw && !ALIAS_STOP.has(aliasRaw.toLowerCase())) {
      // alias → the real (schema-cased) table name when we recognise it.
      map.set(aliasRaw.toLowerCase(), real ?? table);
    }
    void known;
  }
  return map;
}

/** The qualifier immediately before a trailing dot, e.g. "o" in "... o.cust". */
export function qualifierBeforeDot(textUntilCursor: string): string | null {
  const m = /([A-Za-z_][\w]*|"[^"]+"|`[^`]+`)\s*\.\s*[\w]*$/.exec(textUntilCursor);
  return m ? stripQuotes(m[1]) : null;
}

export interface ColumnSuggestion {
  column: string;
  type: string;
  pk: boolean;
  table: string;
}

/** Resolve a qualifier (alias or table) to its columns. */
export function columnsForQualifier(
  qualifier: string,
  schema: TableMeta[],
  aliases: Map<string, string>
): ColumnSuggestion[] {
  const tableName = aliases.get(qualifier.toLowerCase()) ?? qualifier;
  const table = schema.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
  if (!table) return [];
  return table.columns.map((c) => ({
    column: c.name,
    type: c.type,
    pk: c.pk,
    table: table.name,
  }));
}

export const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "ON", "AS",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE",
  "ALTER TABLE", "DROP TABLE", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX",
  "AND", "OR", "NOT", "NULL", "IS NULL", "IS NOT NULL", "LIKE", "IN", "BETWEEN",
  "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC",
];
