# SQL Playground

An interactive, in-browser SQL playground to **learn, run, and (soon) visualize** SQL.
Everything runs client-side — no backend, no signup, no cost. Your work is saved in your browser.

## Features (Phase 1 — MVP)

- **Real database engines in the browser (WASM)**
  - **PostgreSQL** via [PGlite](https://github.com/electric-sql/pglite) — actual Postgres.
  - **SQLite** via [sql.js](https://sql.js.org).
  - **MySQL** (beta) — emulated on the SQLite engine for now; real MySQL WASM is planned.
- **Run any statement** — SELECT, INSERT, UPDATE, DELETE, and full DDL (CREATE/ALTER/DROP…). Multiple statements per run.
- **Monaco editor** with SQL highlighting. `⌘/Ctrl + Enter` runs the selection, or the whole buffer.
- **Results grid** — rows for reads, "N rows affected" for writes, execution time, and clear error messages.
- **Visual schema sidebar** — live introspection of tables, columns, types, primary keys, row counts. Click to `SELECT *`.
- **Visual table builder** — create tables with columns, types (per-dialect), PK & NOT NULL constraints, and seed data via a grid — no SQL required. Preview the generated SQL before applying.
- **Sample datasets** — load a ready-made schema (e.g. e-commerce) to start practicing JOINs immediately.
- **Dark / light theme** toggle (defaults to dark), persisted.
- **Autosave** — dialect, editor contents, and your schema persist in `localStorage`.

## Roadmap

- **Phase 2 — Query visualizer:** animate how JOINs match rows across tables, GROUP BY buckets, filters, etc.
- **Phase 3 — AI assistant (toggleable, BYO Claude API key):** explain a query step by step, suggest fixes, and narrate the visualization.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Requires **Node 18.18+** (developed on Node 24 LTS).

## How it works

- `src/lib/engine/` — a `DbEngine` interface with `PgliteEngine` and `SqlJsEngine` implementations, a dialect-aware statement splitter, and a factory. This abstraction is what lets new dialects (and the future AI layer) slot in cleanly.
- `src/lib/store.ts` — Zustand store: engine lifecycle, running queries, schema introspection, persistence, and theming.
- `src/components/` — `Playground`, `Toolbar`, `SqlEditor` (Monaco), `ResultsPanel`, `SchemaSidebar`, `TableBuilder`.

The sql.js wasm binary is copied into `public/sql-wasm.wasm` automatically before `dev`/`build` (see `scripts/copy-sqljs-wasm.mjs`).
