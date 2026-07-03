import type { Database, SqlJsStatic } from "sql.js";
import type { Dialect, DbEngine, QueryOutcome, QueryResult, TableMeta } from "./types";
import { returnsRows, splitStatements, statementKind } from "./split";

let sqlPromise: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const initSqlJs = (await import("sql.js")).default;
      // The wasm binary is copied into /public by scripts/copy-sqljs-wasm.mjs.
      return initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
    })();
  }
  return sqlPromise;
}

/** SQLite in the browser via sql.js. Also backs the (emulated) MySQL dialect. */
export class SqlJsEngine implements DbEngine {
  readonly dialect: Dialect;
  private db: Database | null = null;

  constructor(dialect: Dialect = "sqlite") {
    this.dialect = dialect;
  }

  async init(): Promise<void> {
    if (this.db) return;
    const SQL = await loadSqlJs();
    this.db = new SQL.Database();
  }

  private get instance(): Database {
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
        const kind = statementKind(stmt);
        if (returnsRows(stmt)) {
          const res = this.instance.exec(stmt);
          if (res.length === 0) {
            results.push({ columns: [], rows: [], rowCount: 0, command: kind });
          } else {
            for (const r of res) {
              results.push({
                columns: r.columns,
                rows: r.values,
                rowCount: r.values.length,
                command: kind,
              });
            }
          }
        } else {
          this.instance.run(stmt);
          const affected = this.instance.getRowsModified();
          results.push({
            columns: [],
            rows: [],
            rowCount: affected,
            affectedRows: affected,
            command: kind,
          });
        }
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
    const res = this.instance.exec(
      `select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name`
    );
    if (res.length === 0) return [];
    const names = res[0].values.map((v) => String(v[0]));
    const tables: TableMeta[] = [];
    for (const name of names) {
      const info = this.instance.exec(`PRAGMA table_info("${name}")`);
      const columns =
        info.length === 0
          ? []
          : info[0].values.map((row) => {
              // table_info columns: cid, name, type, notnull, dflt_value, pk
              const [, cname, ctype, notnull, , pk] = row;
              return {
                name: String(cname),
                type: String(ctype || "").toUpperCase() || "ANY",
                notNull: Number(notnull) === 1,
                pk: Number(pk) > 0,
              };
            });
      const countRes = this.instance.exec(`select count(*) as c from "${name}"`);
      const rowCount = countRes.length ? Number(countRes[0].values[0][0]) : 0;
      tables.push({ name, columns, rowCount });
    }
    return tables;
  }

  async reset(): Promise<void> {
    this.db?.close();
    this.db = null;
    await this.init();
  }

  async snapshot(): Promise<Uint8Array | null> {
    try {
      return this.instance.export();
    } catch {
      return null;
    }
  }

  async restore(data: Uint8Array): Promise<void> {
    const SQL = await loadSqlJs();
    this.db?.close();
    this.db = new SQL.Database(data);
  }
}
