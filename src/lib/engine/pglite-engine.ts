import type { PGlite } from "@electric-sql/pglite";
import type { DbEngine, QueryOutcome, QueryResult, TableMeta } from "./types";
import { splitStatements } from "./split";

/** Real PostgreSQL, compiled to WASM, running in the browser via PGlite. */
export class PgliteEngine implements DbEngine {
  readonly dialect = "postgres" as const;
  private db: PGlite | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    // Dynamic import keeps the ~3MB wasm out of the initial bundle.
    const { PGlite } = await import("@electric-sql/pglite");
    this.db = new PGlite(); // in-memory
    await this.db.waitReady;
  }

  private get instance(): PGlite {
    if (!this.db) throw new Error("Engine not initialized");
    return this.db;
  }

  async exec(sql: string): Promise<QueryOutcome> {
    const start = performance.now();
    const statements = splitStatements(sql);
    const results: QueryResult[] = [];
    try {
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        const res = await this.instance.query(stmt);
        const fields = (res.fields ?? []) as { name: string }[];
        const columns = fields.map((f) => f.name);
        const rows = (res.rows as Record<string, unknown>[]).map((r) =>
          columns.map((c) => r[c])
        );
        results.push({
          columns,
          rows,
          rowCount: res.affectedRows ?? rows.length,
          affectedRows: res.affectedRows,
        });
      }
      return { ok: true, results, elapsedMs: performance.now() - start };
    } catch (e) {
      const err = e as { message?: string };
      return {
        ok: false,
        results,
        error: { message: err.message ?? String(e) },
        elapsedMs: performance.now() - start,
      };
    }
  }

  async introspect(): Promise<TableMeta[]> {
    const tablesRes = await this.instance.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`
    );
    const tables: TableMeta[] = [];
    for (const { table_name } of tablesRes.rows) {
      const cols = await this.instance.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `select column_name, data_type, is_nullable
         from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position`,
        [table_name]
      );
      const pks = await this.instance.query<{ column_name: string }>(
        `select kcu.column_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name
         where tc.table_schema = 'public'
           and tc.table_name = $1
           and tc.constraint_type = 'PRIMARY KEY'`,
        [table_name]
      );
      const pkSet = new Set(pks.rows.map((r) => r.column_name));
      const countRes = await this.instance.query<{ c: number }>(
        `select count(*)::int as c from "${table_name}"`
      );
      tables.push({
        name: table_name,
        rowCount: countRes.rows[0]?.c ?? 0,
        columns: cols.rows.map((r) => ({
          name: r.column_name,
          type: r.data_type,
          notNull: r.is_nullable === "NO",
          pk: pkSet.has(r.column_name),
        })),
      });
    }
    return tables;
  }

  async reset(): Promise<void> {
    this.db = null;
    await this.init();
  }
}
