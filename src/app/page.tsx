import dynamic from "next/dynamic";

// The whole playground is client-side (WASM engines, Monaco, localStorage).
const Playground = dynamic(() => import("@/components/Playground"), { ssr: false });

export default function Page() {
  return (
    <>
      {/* Crawlable content — the interactive app is client-rendered, so this
          gives search engines real text to index. Visually hidden. */}
      <section className="sr-only">
        <h1>SQL Playground — Learn, Run &amp; Visualize SQL Online</h1>
        <p>
          A free, interactive SQL playground that runs entirely in your browser — no signup, no
          setup. Write and run real PostgreSQL, SQLite and MySQL queries, build tables visually,
          seed data, and see exactly how your query works.
        </p>
        <h2>Features</h2>
        <ul>
          <li>Run real SQL in the browser via WebAssembly (PostgreSQL, SQLite, MySQL)</li>
          <li>Monaco code editor with schema-aware autocomplete and inline SQL linting</li>
          <li>Visual table builder with column types, constraints and JSON/grid seed data</li>
          <li>Animated JOIN visualizer and step-by-step query execution pipeline</li>
          <li>Interactive JOIN guide (INNER, LEFT, RIGHT, FULL, CROSS)</li>
          <li>Built-in AI tutor (Claude, ChatGPT or Google Gemini) to explain and optimize queries</li>
          <li>Dark and light themes, autosaved to your browser</li>
        </ul>
        <p>
          Perfect for learning SQL, practicing JOINs and aggregation, prototyping schemas, and
          teaching database concepts.
        </p>
      </section>
      <Playground />
    </>
  );
}
