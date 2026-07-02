// Lightweight, pre-execution SQL hints shown as inline squiggles in the editor.
// These catch common beginner mistakes; they are NOT a full validator — the real
// database is still the source of truth when you run.

export type LintSeverity = "error" | "warning" | "info";

export interface LintIssue {
  start: number; // char offset in the original text
  end: number;
  message: string;
  severity: LintSeverity;
}

/** Replace comment and string contents with spaces (preserving length/offsets)
 *  so rules don't fire inside comments or string literals. */
function maskCommentsAndStrings(sql: string): string {
  const out = sql.split("");
  let i = 0;
  const n = sql.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const eol = sql.indexOf("\n", i);
      const end = eol === -1 ? n : eol;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = sql.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      blank(i + 1, j); // keep the quotes, blank the contents
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

export function lintSql(sql: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const masked = maskCommentsAndStrings(sql);

  // Rule 1: bare "OUTER JOIN" (not preceded by LEFT/RIGHT/FULL).
  {
    const re = /\bouter\s+join\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const before = masked.slice(0, m.index);
      const prev = (/(\w+)\s*$/.exec(before)?.[1] ?? "").toLowerCase();
      if (prev !== "left" && prev !== "right" && prev !== "full") {
        issues.push({
          start: m.index,
          end: m.index + m[0].length,
          severity: "error",
          message:
            '"OUTER JOIN" is not valid on its own. Use LEFT / RIGHT / FULL OUTER JOIN — or just "JOIN" for an inner join.',
        });
      }
    }
  }

  // Rule 2: LIKE/ILIKE with an unquoted pattern, e.g. `LIKE md%`.
  // Only fires when the token after LIKE is unquoted AND contains a `%` wildcard,
  // so valid column comparisons (a LIKE b) and quoted patterns aren't flagged.
  {
    const re = /\b(?:not\s+)?i?like\b\s*([^\s'"();]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const token = m[1];
      if (token && token.includes("%")) {
        const tokenStart = m.index + m[0].length - token.length;
        issues.push({
          start: tokenStart,
          end: tokenStart + token.length,
          severity: "error",
          message: `The pattern after LIKE must be a quoted string. Wrap it in single quotes — e.g. LIKE '${token}'. (% = any characters, _ = one character.)`,
        });
      }
    }
  }

  // Rule 3: "= NULL" / "!= NULL" / "<> NULL" — never matches; should be IS [NOT] NULL.
  {
    const re = /(=|!=|<>)\s*null\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const isNot = m[1] !== "=";
      issues.push({
        start: m.index,
        end: m.index + m[0].length,
        severity: "warning",
        message: `Comparing with "${m[1]} NULL" never matches any row. Use "IS ${isNot ? "NOT " : ""}NULL" instead.`,
      });
    }
  }

  return issues;
}
