"use client";

import { create } from "zustand";
import {
  createEngine,
  type Dialect,
  type DbEngine,
  type QueryOutcome,
  type TableMeta,
} from "./engine";
import { getSample, sampleSql, SAMPLES } from "./samples";
import { defaultModel, type AiProvider } from "./ai";

const LS_KEY = "sqlpg:workspace:v1";

interface PersistedWorkspace {
  dialect: Dialect;
  editorSql: string;
  setupSql: string; // schema + seed applied to a fresh DB
  activeSampleId: string | null; // set when the workspace is an unmodified built-in sample
}

export type Theme = "dark" | "light";

interface PlaygroundState {
  dialect: Dialect;
  engine: DbEngine | null;
  ready: boolean;
  running: boolean;
  editorSql: string;
  /** Cumulative DDL/DML that defines the current database (from the table builder + Run-as-setup). */
  setupSql: string;
  /** When the workspace is an unmodified built-in sample, its id — lets us re-seed
   *  the correct dialect flavor when the engine changes. Null once customized. */
  activeSampleId: string | null;
  outcome: QueryOutcome | null;
  /** The exact SQL of the last run (used by the visualizer). */
  lastRunSql: string;
  schema: TableMeta[];
  theme: Theme;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiKey: string;
  aiModel: string;
  /** A prompt handed to the AI panel from elsewhere (e.g. "explain this JOIN"). */
  aiPrompt: { text: string; id: number } | null;
  statusMessage: string | null;

  init: () => Promise<void>;
  setDialect: (d: Dialect) => Promise<void>;
  setEditorSql: (sql: string) => void;
  run: (sql?: string) => Promise<void>;
  /** Run SQL and also fold it into setupSql so it persists across resets. */
  applySetup: (sql: string) => Promise<QueryOutcome>;
  refreshSchema: () => Promise<void>;
  resetDatabase: () => Promise<void>;
  loadSample: (id: string) => Promise<void>;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setAiEnabled: (v: boolean) => void;
  setAiProvider: (p: AiProvider) => void;
  setAiKey: (k: string) => void;
  setAiModel: (m: string) => void;
  askAi: (text: string) => void;
  clearAiPrompt: () => void;
}

function loadPersisted(): PersistedWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PersistedWorkspace) : null;
  } catch {
    return null;
  }
}

function persist(state: PlaygroundState) {
  if (typeof window === "undefined") return;
  const data: PersistedWorkspace = {
    dialect: state.dialect,
    editorSql: state.editorSql,
    setupSql: state.setupSql,
    activeSampleId: state.activeSampleId,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("sqlpg:theme") as Theme) || "dark";
}

// Guards against double initialization. React StrictMode (dev) mounts twice and
// would otherwise boot the WASM engine twice — PGlite then fails with
// "Cannot compile WebAssembly.Module from an already read Response".
let initPromise: Promise<void> | null = null;

export const usePlayground = create<PlaygroundState>((set, get) => ({
  dialect: "postgres",
  engine: null,
  ready: false,
  running: false,
  editorSql: "",
  setupSql: "",
  activeSampleId: null,
  outcome: null,
  lastRunSql: "",
  schema: [],
  theme: "dark",
  aiEnabled: false,
  aiProvider: "anthropic",
  aiKey: "",
  aiModel: "claude-opus-4-8",
  aiPrompt: null,
  statusMessage: null,

  init: async () => {
    // Run exactly once, even if called twice by StrictMode's double-mount.
    if (initPromise) return initPromise;
    if (get().ready) return;

    initPromise = (async () => {
      const persisted = loadPersisted();
      const dialect = persisted?.dialect ?? "postgres";
      const theme = loadTheme();
      set({ theme });
      applyThemeToDom(theme);

      // Restore AI settings (stored separately from the workspace, per provider).
      if (typeof window !== "undefined") {
        const provider = (localStorage.getItem("sqlpg:ai-provider") as AiProvider) || "anthropic";
        set({
          aiProvider: provider,
          aiKey: localStorage.getItem(`sqlpg:ai-key:${provider}`) || "",
          aiModel: localStorage.getItem(`sqlpg:ai-model:${provider}`) || defaultModel(provider),
          aiEnabled: localStorage.getItem("sqlpg:ai-enabled") === "1",
        });
      }

      const engine = createEngine(dialect);
      set({ statusMessage: "Booting database engine…" });
      await engine.init();

      let setupSql = persisted?.setupSql ?? "";
      let editorSql = persisted?.editorSql ?? "";
      let activeSampleId = persisted?.activeSampleId ?? null;

      if (setupSql.trim()) {
        await engine.exec(setupSql);
      }

      set({ engine, dialect, ready: true, setupSql, editorSql, activeSampleId, statusMessage: null });
      await get().refreshSchema();

      // If the database came up empty (first visit, a prior Reset, or a setup
      // that failed to apply), seed the default sample so there's always
      // something to explore. A user's own tables (non-empty schema) are kept.
      if (get().schema.length === 0) {
        const sample = SAMPLES[0];
        const seed = sampleSql(sample, dialect);
        const res = await engine.exec(seed);
        if (res.ok) {
          setupSql = seed;
          activeSampleId = sample.id;
          if (!editorSql.trim()) editorSql = sample.query;
          set({ setupSql, editorSql, activeSampleId });
          await get().refreshSchema();
        }
      }

      persist(get());
    })();

    return initPromise;
  },

  setDialect: async (d) => {
    if (d === get().dialect) return;
    set({ ready: false, statusMessage: `Switching to ${d}…`, dialect: d });
    const engine = createEngine(d);
    await engine.init();

    const sample = get().activeSampleId ? getSample(get().activeSampleId!) : undefined;
    let note: string | null = null;

    if (sample) {
      // Built-in sample → re-seed the flavor written for the new dialect.
      const seed = sampleSql(sample, d);
      await engine.exec(seed);
      set({ setupSql: seed });
    } else if (get().setupSql.trim()) {
      // Custom schema → try to re-apply. Dialect-specific SQL may not port.
      const res = await engine.exec(get().setupSql);
      if (!res.ok) {
        note = `Your custom schema uses SQL that doesn't run on ${d.toUpperCase()}. Started an empty ${d} database — use Reset or rebuild your tables.`;
        await engine.reset();
        set({ setupSql: "" });
      }
    }

    set({ engine, ready: true, statusMessage: note });
    await get().refreshSchema();
    persist(get());
    if (note) setTimeout(() => set({ statusMessage: null }), 6000);
  },

  setEditorSql: (sql) => {
    set({ editorSql: sql });
    persist(get());
  },

  run: async (sql) => {
    const { engine } = get();
    const toRun = sql ?? get().editorSql;
    if (!engine || !toRun.trim()) return;
    set({ running: true });
    const outcome = await engine.exec(toRun);
    set({ outcome, running: false, lastRunSql: toRun });
    await get().refreshSchema();
  },

  applySetup: async (sql) => {
    const { engine } = get();
    if (!engine) return { ok: false, results: [], elapsedMs: 0, error: { message: "No engine" } };
    const outcome = await engine.exec(sql);
    // Surface the result in the panel so table-builder / sidebar actions give feedback.
    set({ outcome });
    if (outcome.ok) {
      const setupSql = [get().setupSql, sql].filter((s) => s.trim()).join("\n\n");
      // The workspace is now customized — no longer a pristine sample.
      set({ setupSql, activeSampleId: null });
      await get().refreshSchema();
      persist(get());
    }
    return outcome;
  },

  refreshSchema: async () => {
    const { engine } = get();
    if (!engine) return;
    try {
      const schema = await engine.introspect();
      set({ schema });
    } catch {
      /* introspection best-effort */
    }
  },

  resetDatabase: async () => {
    const { engine } = get();
    if (!engine) return;
    await engine.reset();
    set({ setupSql: "", outcome: null, activeSampleId: null });
    await get().refreshSchema();
    persist(get());
  },

  loadSample: async (id) => {
    const sample = getSample(id);
    const { engine, dialect } = get();
    if (!sample || !engine) return;
    await engine.reset();
    const setup = sampleSql(sample, dialect);
    await engine.exec(setup);
    set({ setupSql: setup, editorSql: sample.query, outcome: null, activeSampleId: sample.id });
    await get().refreshSchema();
    persist(get());
  },

  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    get().setTheme(theme);
  },

  setTheme: (theme) => {
    set({ theme });
    applyThemeToDom(theme);
    if (typeof window !== "undefined") localStorage.setItem("sqlpg:theme", theme);
  },

  setAiEnabled: (v) => {
    set({ aiEnabled: v });
    if (typeof window !== "undefined") localStorage.setItem("sqlpg:ai-enabled", v ? "1" : "0");
  },

  setAiProvider: (p) => {
    // Switching provider loads that provider's saved key + model.
    const key = typeof window !== "undefined" ? localStorage.getItem(`sqlpg:ai-key:${p}`) || "" : "";
    const model =
      typeof window !== "undefined"
        ? localStorage.getItem(`sqlpg:ai-model:${p}`) || defaultModel(p)
        : defaultModel(p);
    set({ aiProvider: p, aiKey: key, aiModel: model });
    if (typeof window !== "undefined") localStorage.setItem("sqlpg:ai-provider", p);
  },

  setAiKey: (k) => {
    set({ aiKey: k });
    if (typeof window !== "undefined") localStorage.setItem(`sqlpg:ai-key:${get().aiProvider}`, k);
  },

  setAiModel: (m) => {
    set({ aiModel: m });
    if (typeof window !== "undefined") localStorage.setItem(`sqlpg:ai-model:${get().aiProvider}`, m);
  },

  askAi: (text) => {
    get().setAiEnabled(true);
    set({ aiPrompt: { text, id: (get().aiPrompt?.id ?? 0) + 1 } });
  },

  clearAiPrompt: () => set({ aiPrompt: null }),
}));

function applyThemeToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
