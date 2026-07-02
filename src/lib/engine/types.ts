// Dialects the playground can run. `mysql` is emulated on top of SQLite for now
// (real MySQL WASM lands in a later phase) — hence the `emulated` flag.
export type Dialect = "postgres" | "sqlite" | "mysql";

export interface DialectInfo {
  id: Dialect;
  label: string;
  engine: "pglite" | "sqljs";
  emulated?: boolean;
  note?: string;
}

export const DIALECTS: DialectInfo[] = [
  { id: "postgres", label: "PostgreSQL", engine: "pglite" },
  { id: "sqlite", label: "SQLite", engine: "sqljs" },
  {
    id: "mysql",
    label: "MySQL",
    engine: "sqljs",
    emulated: true,
    note: "MySQL is emulated on the SQLite engine for now. Most standard SQL works; MySQL-only syntax may differ.",
  },
];

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  /** Statement kind of the LAST statement executed (for messaging). */
  command?: string;
  /** Rows affected for write statements when the engine reports it. */
  affectedRows?: number;
}

export interface QueryOutcome {
  ok: boolean;
  /** One entry per statement executed in the batch. */
  results: QueryResult[];
  error?: { message: string; position?: number };
  /** Wall-clock execution time in milliseconds. */
  elapsedMs: number;
}

export interface ColumnMeta {
  name: string;
  type: string;
  notNull: boolean;
  pk: boolean;
}

export interface TableMeta {
  name: string;
  columns: ColumnMeta[];
  rowCount: number;
}

/** A database engine that runs entirely in the browser. */
export interface DbEngine {
  readonly dialect: Dialect;
  init(): Promise<void>;
  /** Run one or more SQL statements. Never throws for SQL errors — returns them in the outcome. */
  exec(sql: string): Promise<QueryOutcome>;
  /** Introspect the current schema for the sidebar. */
  introspect(): Promise<TableMeta[]>;
  /** Drop everything and start fresh. */
  reset(): Promise<void>;
}
