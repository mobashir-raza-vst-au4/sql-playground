"use client";

import type { JoinType } from "@/lib/query-analyze";
import { usePlayground } from "@/lib/store";
import { X, Play } from "lucide-react";

/** A larger, labelled Venn used in the guide cards. */
function GuideVenn({ type }: { type: JoinType }) {
  const includeLeft = type === "LEFT" || type === "FULL";
  const includeRight = type === "RIGHT" || type === "FULL";
  const showInner = type !== "CROSS";
  const clip = `guide-a-${type}`;
  return (
    <svg width="150" height="88" viewBox="0 0 150 88" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx="58" cy="44" r="34" />
        </clipPath>
      </defs>
      {includeLeft && <circle cx="58" cy="44" r="34" fill="var(--accent)" opacity="0.28" />}
      {includeRight && <circle cx="92" cy="44" r="34" fill="var(--accent)" opacity="0.28" />}
      {showInner && (
        <g clipPath={`url(#${clip})`}>
          <circle cx="92" cy="44" r="34" fill="var(--accent)" opacity="0.6" />
        </g>
      )}
      {type === "CROSS" && (
        <>
          <circle cx="58" cy="44" r="34" fill="var(--accent)" opacity="0.28" />
          <circle cx="92" cy="44" r="34" fill="var(--accent)" opacity="0.28" />
        </>
      )}
      <circle cx="58" cy="44" r="34" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <circle cx="92" cy="44" r="34" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <text x="34" y="20" fontSize="11" fill="var(--muted)">A</text>
      <text x="112" y="20" fontSize="11" fill="var(--muted)">B</text>
    </svg>
  );
}

interface GuideItem {
  type: JoinType;
  title: string;
  what: string;
  when: string;
  example: string;
  result: string;
}

const GUIDE: GuideItem[] = [
  {
    type: "INNER",
    title: "INNER JOIN",
    what: "Returns only rows that have a match in BOTH tables. Rows without a partner on either side are dropped.",
    when: "Use when you only care about records that exist on both sides — e.g. customers who have actually placed an order.",
    example: `SELECT c.name, o.id
FROM customers c
JOIN orders o ON o.customer_id = c.id;`,
    result: "Customers who have at least one order (customers with no orders are excluded).",
  },
  {
    type: "LEFT",
    title: "LEFT JOIN  (LEFT OUTER JOIN)",
    what: "Returns ALL rows from the left table, plus matching rows from the right. Where there's no match, the right-side columns are NULL.",
    when: "Use to keep every left-table record regardless of a match — e.g. list all customers and show their orders if they have any.",
    example: `SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id;`,
    result: "Every customer appears. Those without orders show NULL for the order columns.",
  },
  {
    type: "RIGHT",
    title: "RIGHT JOIN  (RIGHT OUTER JOIN)",
    what: "The mirror of LEFT JOIN: ALL rows from the right table, plus matches from the left. Unmatched left-side columns become NULL.",
    when: "Use when the right table is the one you must keep in full. (Many people just flip the tables and use LEFT JOIN instead.)",
    example: `SELECT c.name, o.id
FROM customers c
RIGHT JOIN orders o ON o.customer_id = c.id;`,
    result: "Every order appears, even if its customer record is missing.",
  },
  {
    type: "FULL",
    title: "FULL JOIN  (FULL OUTER JOIN)",
    what: "Returns ALL rows from BOTH tables. Wherever a side has no match, its columns are filled with NULL.",
    when: "Use to see everything and spot mismatches on either side — e.g. reconciling two lists to find records missing from one.",
    example: `SELECT c.name, o.id
FROM customers c
FULL JOIN orders o ON o.customer_id = c.id;`,
    result: "All customers and all orders; NULLs mark the gaps on either side. (Note: SQLite/MySQL support may be limited.)",
  },
  {
    type: "CROSS",
    title: "CROSS JOIN",
    what: "Returns the Cartesian product — every row of the left table paired with every row of the right. No ON condition.",
    when: "Use to generate all combinations — e.g. every size × every colour for product variants. Beware: rows multiply fast (m × n).",
    example: `SELECT s.size, c.color
FROM sizes s
CROSS JOIN colors c;`,
    result: "If sizes has 3 rows and colors has 4, you get 3 × 4 = 12 combinations.",
  },
];

export default function JoinGuide({ onClose }: { onClose: () => void }) {
  const setEditorSql = usePlayground((s) => s.setEditorSql);
  const run = usePlayground((s) => s.run);

  const tryIt = (sql: string) => {
    setEditorSql(sql);
    void run(sql);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] rounded-lg border bg-panel flex flex-col shadow-2xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold">Understanding SQL JOINs</h2>
          <button className="text-muted hover:text-app" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <p className="text-sm text-muted mb-4">
            A JOIN combines rows from two tables using a matching condition (the <code>ON</code> clause). The
            difference between join types is simply <b>which unmatched rows they keep</b>. The shaded area shows what
            each returns (A = left table, B = right table).
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {GUIDE.map((g) => (
              <div
                key={g.type}
                className="rounded-lg border p-3 flex flex-col"
                style={{ borderColor: "var(--border)", background: "var(--panel2)" }}
              >
                <div className="flex items-center gap-3">
                  <GuideVenn type={g.type} />
                  <div className="font-semibold text-sm">{g.title}</div>
                </div>
                <p className="text-xs mt-2">{g.what}</p>
                <p className="text-xs mt-2 text-muted">
                  <b style={{ color: "var(--text)" }}>When:</b> {g.when}
                </p>
                <pre
                  className="mt-2 p-2 rounded text-[11px] font-mono overflow-auto whitespace-pre"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  {g.example}
                </pre>
                <p className="text-[11px] mt-1.5 text-muted">
                  <b style={{ color: "var(--text)" }}>Result:</b> {g.result}
                </p>
                <button className="btn !py-1 !px-2 text-xs mt-2 self-start" onClick={() => tryIt(g.example)}>
                  <Play className="w-3 h-3" /> Try it &amp; visualize
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 text-xs text-muted rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <b style={{ color: "var(--text)" }}>Quick tips:</b> “OUTER” is optional — <code>LEFT JOIN</code> and{" "}
            <code>LEFT OUTER JOIN</code> mean the same thing. A table can also join to itself (a <i>self-join</i>) using
            two aliases. To find rows with <i>no</i> match, use a <code>LEFT JOIN … WHERE right.key IS NULL</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
