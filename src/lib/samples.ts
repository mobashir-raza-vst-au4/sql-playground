import type { Dialect } from "./engine/types";

export interface Sample {
  id: string;
  name: string;
  description: string;
  /** Schema + seed data, keyed by dialect (with a shared fallback). */
  sql: Partial<Record<Dialect, string>> & { default: string };
  /** A starter query to drop into the editor. */
  query: string;
}

const ECOMMERCE_PG = `
-- E-commerce: customers, orders, products (PostgreSQL)
CREATE TABLE customers (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  city   TEXT,
  joined DATE
);

CREATE TABLE products (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  product_id  INTEGER REFERENCES products(id),
  qty         INTEGER NOT NULL,
  ordered_at  DATE
);

INSERT INTO customers (name, city, joined) VALUES
  ('Aisha',  'Mumbai',    '2023-01-15'),
  ('Ben',    'London',    '2023-03-02'),
  ('Chen',   'Singapore', '2023-05-20'),
  ('Diego',  'Madrid',    '2024-02-11');

INSERT INTO products (name, price) VALUES
  ('Keyboard', 45.00),
  ('Mouse',    25.50),
  ('Monitor',  199.99),
  ('Desk',     320.00);

INSERT INTO orders (customer_id, product_id, qty, ordered_at) VALUES
  (1, 1, 2, '2024-03-01'),
  (1, 3, 1, '2024-03-04'),
  (2, 2, 3, '2024-03-05'),
  (3, 4, 1, '2024-03-07'),
  (3, 1, 1, '2024-03-09');
`.trim();

const ECOMMERCE_SQLITE = ECOMMERCE_PG
  .replace(/SERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT")
  .replace(/NUMERIC\(10,2\)/g, "REAL")
  .replace(/ REFERENCES \w+\(id\)/g, "");

export const SAMPLES: Sample[] = [
  {
    id: "ecommerce",
    name: "E-commerce",
    description: "customers · products · orders — great for practicing JOINs and aggregation",
    sql: { default: ECOMMERCE_SQLITE, postgres: ECOMMERCE_PG, mysql: ECOMMERCE_SQLITE },
    query: `-- Total spend per customer (INNER JOIN + GROUP BY)
SELECT c.name,
       SUM(p.price * o.qty) AS total_spend,
       COUNT(*)             AS orders
FROM customers c
JOIN orders   o ON o.customer_id = c.id
JOIN products p ON p.id = o.product_id
GROUP BY c.name
ORDER BY total_spend DESC;`,
  },
];

// Example queries against the e-commerce sample. Some are portable; others show
// where the dialects diverge (ILIKE, string concatenation, etc.).
export interface QueryExample {
  id: string;
  name: string;
  note: string;
  sql: Partial<Record<Dialect, string>> & { default: string };
}

export const EXAMPLES: QueryExample[] = [
  {
    id: "spend",
    name: "Total spend per customer",
    note: "Portable · JOIN + GROUP BY + aggregates",
    sql: {
      default: `SELECT c.name,
       SUM(p.price * o.qty) AS total_spend,
       COUNT(*)             AS orders
FROM customers c
JOIN orders   o ON o.customer_id = c.id
JOIN products p ON p.id = o.product_id
GROUP BY c.name
ORDER BY total_spend DESC;`,
    },
  },
  {
    id: "no-orders",
    name: "Customers with no orders",
    note: "Portable · LEFT JOIN … WHERE key IS NULL",
    sql: {
      default: `-- Keep every customer, then keep only those with no matching order
SELECT c.name, c.city
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`,
    },
  },
  {
    id: "ilike",
    name: "Case-insensitive search",
    note: "Differs · ILIKE (Postgres) vs LIKE",
    sql: {
      postgres: `-- ILIKE is case-insensitive — PostgreSQL only
SELECT name, city FROM customers
WHERE name ILIKE 'a%';`,
      default: `-- SQLite & MySQL: LIKE is already case-insensitive for ASCII
-- (there is no ILIKE keyword here)
SELECT name, city FROM customers
WHERE name LIKE 'a%';`,
    },
  },
  {
    id: "concat",
    name: "Concatenate text",
    note: "Differs · || (Postgres/SQLite) vs CONCAT (MySQL)",
    sql: {
      mysql: `-- MySQL: use CONCAT() — here || means logical OR, not concatenation
SELECT CONCAT(name, ' from ', city) AS label
FROM customers;`,
      default: `-- Postgres & SQLite: || concatenates strings
SELECT name || ' from ' || city AS label
FROM customers;`,
    },
  },
  {
    id: "top-products",
    name: "Best-selling products",
    note: "Portable · JOIN + GROUP BY + ORDER BY",
    sql: {
      default: `SELECT p.name,
       COUNT(*)     AS times_ordered,
       SUM(o.qty)   AS units_sold
FROM products p
JOIN orders o ON o.product_id = p.id
GROUP BY p.name
ORDER BY units_sold DESC;`,
    },
  },
];

export function exampleSql(e: QueryExample, dialect: Dialect): string {
  return e.sql[dialect] ?? e.sql.default;
}

export function getSample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}

export function sampleSql(sample: Sample, dialect: Dialect): string {
  return sample.sql[dialect] ?? sample.sql.default;
}
