import type { Dialect, DbEngine } from "./types";
import { PgliteEngine } from "./pglite-engine";
import { SqlJsEngine } from "./sqljs-engine";

export * from "./types";
export { splitStatements, statementKind, statementRanges, statementAtOffset, returnsRows } from "./split";
export type { StatementRange } from "./split";

/** Create a fresh engine for the given dialect. */
export function createEngine(dialect: Dialect): DbEngine {
  switch (dialect) {
    case "postgres":
      return new PgliteEngine();
    case "sqlite":
      return new SqlJsEngine("sqlite");
    case "mysql":
      return new SqlJsEngine("mysql");
    default:
      throw new Error(`Unknown dialect: ${dialect}`);
  }
}
