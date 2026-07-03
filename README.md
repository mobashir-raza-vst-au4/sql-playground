# SQL Playground

**Learn, run & visualize SQL — entirely in your browser.**

🔗 **Live:** https://sql-playground-xi.vercel.app

A free, interactive SQL playground with no signup and no backend. Real database
engines run in your browser via WebAssembly, so queries are instant and private.

## Features

- **Real engines in-browser (WASM)** — PostgreSQL ([PGlite](https://github.com/electric-sql/pglite)), SQLite ([sql.js](https://sql.js.org)); MySQL emulated (beta).
- **Every statement type** — SELECT / INSERT / UPDATE / DELETE / DDL, multiple statements per run.
- **Monaco editor** — run-at-cursor (`⌘/Ctrl+Enter`), schema-aware autocomplete with auto-quoting, and an inline linter (bare `OUTER JOIN`, `= NULL`, unquoted `LIKE`).
- **Visual table builder** — columns, types, constraints, and seed data via a grid **or** pasted JSON.
- **Live schema sidebar** — introspection, `SELECT *`, clear-rows, and drop actions.
- **Query visualizer** — animated JOIN row-matching with Venn diagrams, and a real-row-count execution pipeline (FROM → JOIN → WHERE → GROUP BY → …). Also visualizes writes/DDL.
- **JOIN guide** — INNER / LEFT / RIGHT / FULL / CROSS explained with diagrams and examples.
- **Dialect-aware examples** — see where Postgres/SQLite/MySQL diverge (`ILIKE`, `CONCAT` vs `||`).
- **AI Tutor (bring your own key)** — Claude, ChatGPT, or **Google Gemini (free tier)** — explain, optimize, fix queries, and narrate the visualizer.
- **Dark/light theme**, autosaved to your browser.

## Tech stack

Next.js 14 · React 18 · TypeScript · Tailwind CSS · Zustand · Monaco · PGlite · sql.js · Anthropic/OpenAI/Gemini APIs · deployed on Vercel.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires Node 18.18+ (developed on Node 24 LTS). The sql.js WASM binary is copied
into `public/` automatically before `dev`/`build`.

## How it works

Your SQL never leaves the browser. `PGlite` (real Postgres) and `sql.js` (real
SQLite) are compiled to WebAssembly and run in-memory in the tab. A common
`DbEngine` interface normalizes results; the visualizer runs extra real queries
against the same engine to compute JOIN matches and per-stage row counts. The
only server code is `/api/ai`, a serverless function that proxies the AI
provider so your key avoids CORS and stays out of the bundle.

## License

MIT
