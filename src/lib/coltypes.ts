import type { Dialect } from "./engine/types";

// Common column types offered in the visual builder, per dialect.
export const TYPE_OPTIONS: Record<Dialect, string[]> = {
  postgres: [
    "SERIAL",
    "INTEGER",
    "BIGINT",
    "NUMERIC(10,2)",
    "REAL",
    "BOOLEAN",
    "TEXT",
    "VARCHAR(255)",
    "DATE",
    "TIMESTAMP",
    "JSONB",
    "UUID",
  ],
  sqlite: ["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC", "BOOLEAN", "DATE", "DATETIME"],
  mysql: [
    "INT",
    "BIGINT",
    "DECIMAL(10,2)",
    "FLOAT",
    "BOOLEAN",
    "TEXT",
    "VARCHAR(255)",
    "DATE",
    "DATETIME",
    "JSON",
  ],
};

export function defaultType(dialect: Dialect): string {
  return TYPE_OPTIONS[dialect][0];
}

/** The auto-increment PK snippet for each dialect. */
export function autoPk(dialect: Dialect): { type: string; extra: string } {
  switch (dialect) {
    case "postgres":
      return { type: "SERIAL", extra: "PRIMARY KEY" };
    case "mysql":
      return { type: "INT", extra: "AUTO_INCREMENT PRIMARY KEY" };
    default:
      return { type: "INTEGER", extra: "PRIMARY KEY AUTOINCREMENT" };
  }
}
