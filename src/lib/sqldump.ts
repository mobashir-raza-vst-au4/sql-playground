import type { DbEngine, Dialect } from "./engine";
import { maybeQuote } from "./sql-intel";

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Dump the whole database (CREATE TABLE + INSERT per table) to portable SQL. */
export async function dumpDatabase(engine: DbEngine, dialect: Dialect): Promise<string> {
  const q = (id: string) => maybeQuote(id, dialect);
  const tables = await engine.introspect();
  if (tables.length === 0) return "-- (no tables)\n";

  const out: string[] = [`-- SQL Playground export (${dialect})`, ""];
  for (const t of tables) {
    const defs = t.columns.map((c) => {
      let d = `  ${q(c.name)} ${c.type}`;
      if (c.pk) d += " PRIMARY KEY";
      else if (c.notNull) d += " NOT NULL";
      return d;
    });
    out.push(`CREATE TABLE ${q(t.name)} (\n${defs.join(",\n")}\n);`);

    const res = await engine.exec(`SELECT * FROM ${q(t.name)}`);
    const r = res.ok ? res.results[0] : undefined;
    if (r && r.rows.length) {
      const cols = r.columns.map(q).join(", ");
      const CHUNK = 500;
      for (let i = 0; i < r.rows.length; i += CHUNK) {
        const values = r.rows
          .slice(i, i + CHUNK)
          .map((row) => `  (${row.map(literal).join(", ")})`)
          .join(",\n");
        out.push(`INSERT INTO ${q(t.name)} (${cols}) VALUES\n${values};`);
      }
    }
    out.push("");
  }
  return out.join("\n");
}
