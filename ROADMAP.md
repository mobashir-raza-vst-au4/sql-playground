# SQL Playground — Roadmap & Feature Ideas

Ideas for future phases, grouped by theme and tagged by impact/effort. All build
on the current app (multi-dialect WASM engines, tabbed editor, table builder,
JOIN/pipeline visualizer, JOIN guide, AI tutor, IndexedDB persistence).

## ✅ Already shipped

- Real in-browser engines (PostgreSQL via PGlite, SQLite via sql.js, MySQL beta)
- Monaco editor: run-at-cursor, schema-aware autocomplete + auto-quoting, inline linter
- Multi-tab editor (new/close/switch, `⇧⌘N`, drag-to-reorder, smart `Query N` numbering)
- Visual table builder (columns, types, constraints, grid + JSON seed data)
- Live schema sidebar (SELECT \*, clear rows, drop — with confirm dialog)
- Query visualizer: animated JOIN row-matching + Venn diagrams, real-row-count execution pipeline, write/DDL views
- JOIN learning guide (INNER / LEFT / RIGHT / FULL / CROSS)
- Dialect-aware example queries (`ILIKE`, `CONCAT` vs `||`)
- AI tutor — BYO key, streaming (Claude, ChatGPT, Google Gemini free tier), "Explain this JOIN"
- Full DB persistence to IndexedDB (survives refresh); full-wipe Reset
- Sortable table list (name A–Z / Z–A, newest, oldest created)
- First-run guided tour / coach marks (spotlight + tooltips), replayable via the help button
- Dark/light theme, responsive layout, SEO (metadata, OG image, sitemap, JSON-LD)
- Deployed on Vercel with auto-deploy from GitHub

---

## 🎓 Learning depth *(best fit for the mission)*

| Feature | Description | Impact | Effort |
|---|---|---|---|
| **Challenges with auto-grading** | "Write a query that returns X" — compare the user's result set to the expected one, ✅/❌ with hints. Turns the sandbox into a course. | High | Medium |
| **Interactive lessons** | Step-by-step tutorials (JOINs, GROUP BY, subqueries) that load a dataset and walk through queries. | High | Medium |
| **`EXPLAIN` / query-plan view** | Visualize Postgres `EXPLAIN` (seq scan vs index, cost). Teaches performance; complements the pipeline view. | Medium | Medium |
| **More sample datasets** | Employees, movies, library, Chinook-style music store. | Medium | Low |

## 🔗 Sharing & data I/O *(drives growth / SEO)*

| Feature | Description | Impact | Effort |
|---|---|---|---|
| **Shareable links** | Encode schema + query into a URL (or short link) so people can share a playground state. Great for virality and teaching. | High | Low |
| **CSV import → table** | Drag a CSV in; auto-create + populate a table. | High | Medium |
| **Export results** | Download query results as CSV/JSON; export/import the whole workspace as `.sql`. | Medium | Low |

## 🎨 Results & editor UX

| Feature | Description | Impact | Effort |
|---|---|---|---|
| **Chart the results** | Turn any `SELECT` into a bar / line / pie chart. | High | Medium |
| **Sortable/filterable results grid** | Column sort, filter, pagination, copy cell. | Medium | Medium |
| **Format SQL** | Prettify button (sql-formatter) + snippet library. | Medium | Low |
| **Query history panel** | Every run recorded; click to restore. | Medium | Low |

## 🗺️ Schema visualization

| Feature | Description | Impact | Effort |
|---|---|---|---|
| **ER diagram** | Tables as boxes with foreign-key lines between them (auto-layout). Natural extension of the visualizer. | High | Medium |

## 🤖 AI upgrades

| Feature | Description | Impact | Effort |
|---|---|---|---|
| **Natural language → SQL** | "Top 5 customers by spend" → generates and runs the query. | High | Low |
| **AI-generated practice problems** | AI creates exercises and grades answers. | Medium | Medium |

## ⚙️ Engine

| Feature | Description | Impact | Effort |
|---|---|---|---|
| **Real MySQL in WASM** | Upgrade from the current SQLite-emulated MySQL for true fidelity. | Medium | High |

---

## ⭐ Recommended next 3 (impact ÷ effort)

1. **Shareable links** — low effort, big reach (ideal for a public/SEO project).
2. **Challenges with auto-grading** — turns it into a learning product; strong differentiator.
3. **Chart the results** — quick win, visually impressive.
