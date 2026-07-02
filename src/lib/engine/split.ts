// Split a SQL batch into individual statements on top-level semicolons,
// respecting single/double quotes, dollar-quoted strings (Postgres),
// and line/block comments. Good enough for a teaching playground.
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // line comment
    if (ch === "-" && next === "-") {
      const eol = sql.indexOf("\n", i);
      const end = eol === -1 ? n : eol;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    // block comment
    if (ch === "/" && next === "*") {
      const close = sql.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    // single or double quoted string
    if (ch === "'" || ch === '"') {
      const quote = ch;
      cur += ch;
      i++;
      while (i < n) {
        cur += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            // escaped quote by doubling
            cur += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // dollar-quoted string ($$ ... $$ or $tag$ ... $tag$)
    if (ch === "$") {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        cur += sql.slice(i, end);
        i = end;
        continue;
      }
    }
    // statement terminator
    if (ch === ";") {
      out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

export interface StatementRange {
  /** Trimmed statement text. */
  text: string;
  /** Offset of the first non-space char of the statement in the original SQL. */
  start: number;
  /** Offset just past the last non-space char (exclusive). */
  end: number;
  /** Raw span [rawStart, rawEnd) used for cursor hit-testing (includes the terminating `;`). */
  rawStart: number;
  rawEnd: number;
}

/**
 * Like splitStatements, but returns each statement with its offsets in the
 * original text — quote/comment/dollar-quote aware — so we can find the
 * statement under the cursor.
 */
export function statementRanges(sql: string): StatementRange[] {
  const ranges: StatementRange[] = [];
  let segStart = 0;
  let i = 0;
  const n = sql.length;

  const push = (rawStart: number, rawEnd: number) => {
    const raw = sql.slice(rawStart, rawEnd);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const start = rawStart + leading;
    ranges.push({ text: trimmed, start, end: start + trimmed.length, rawStart, rawEnd });
  };

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 ? n : eol;
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        i = close === -1 ? n : close + tag.length;
        continue;
      }
    }
    if (ch === ";") {
      push(segStart, i + 1); // include the semicolon in the raw span
      segStart = i + 1;
      i++;
      continue;
    }
    i++;
  }
  push(segStart, n);
  return ranges;
}

/**
 * Find the statement the cursor sits in.
 * A statement owns from its own text start up to where the NEXT statement's text
 * begins — so the terminating `;` and the blank lines after it belong to the
 * statement above them (the one you just finished typing), not the one below.
 */
export function statementAtOffset(sql: string, offset: number): StatementRange | null {
  const ranges = statementRanges(sql);
  if (ranges.length === 0) return null;
  // ranges are ordered by start; pick the last statement that begins at/before the cursor.
  let chosen = ranges[0];
  for (const r of ranges) {
    if (r.start <= offset) chosen = r;
    else break;
  }
  return chosen;
}

/** Strip leading whitespace and -- / block comments so the first keyword is visible. */
function skipLeadingComments(sql: string): string {
  let s = sql;
  for (;;) {
    const before = s;
    s = s.replace(/^\s+/, "");
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = nl === -1 ? "" : s.slice(nl + 1);
    } else if (s.startsWith("/*")) {
      const close = s.indexOf("*/");
      s = close === -1 ? "" : s.slice(close + 2);
    }
    if (s === before) break;
  }
  return s;
}

/** Classify a statement so the UI can label results ("SELECT", "INSERT", …).
 *  Leading comments are skipped so `-- note\nSELECT …` is still a SELECT. */
export function statementKind(stmt: string): string {
  const m = /^([a-zA-Z]+)/.exec(skipLeadingComments(stmt));
  return m ? m[1].toUpperCase() : "SQL";
}

const RETURNING_KINDS = new Set(["SELECT", "WITH", "PRAGMA", "EXPLAIN", "SHOW", "VALUES"]);
export function returnsRows(stmt: string): boolean {
  return RETURNING_KINDS.has(statementKind(stmt));
}
