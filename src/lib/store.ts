"use client";

import { create } from "zustand";
import {
  createEngine,
  returnsRows,
  splitStatements,
  type Dialect,
  type DbEngine,
  type QueryOutcome,
  type TableMeta,
} from "./engine";
import { getSample, sampleSql, SAMPLES } from "./samples";
import { defaultModel, type AiProvider } from "./ai";
import { idbGet, idbSet, idbDel } from "./idb";
import { DIALECTS } from "./engine";

// ---------------------------------------------------------------------------
// Projects — each is a named workspace with its own tables/data. Everything
// that used to be a single global key is now namespaced by project id:
//   workspace metadata → sqlpg:workspace:v1:<projectId>   (localStorage)
//   database snapshot   → db:<projectId>:<dialect>        (IndexedDB)
// ---------------------------------------------------------------------------
const PROJECTS_KEY = "sqlpg:projects";
const wsKey = (projectId: string) => `sqlpg:workspace:v1:${projectId}`;
const dbKey = (projectId: string, dialect: string) => `db:${projectId}:${dialect}`;

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
}
interface ProjectsFile {
  activeId: string;
  list: ProjectMeta[];
}

function newProjectId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `p-${crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function loadProjectsFile(): ProjectsFile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as ProjectsFile) : null;
  } catch {
    return null;
  }
}

function saveProjectsFile(f: ProjectsFile) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota errors */
  }
}

/** Persist the full database (schema + data) so a refresh keeps everything. */
async function saveSnapshot(projectId: string, dialect: Dialect, engine: DbEngine): Promise<void> {
  try {
    const snap = await engine.snapshot();
    if (snap) await idbSet(dbKey(projectId, dialect), snap);
  } catch {
    /* best-effort */
  }
}

/** True if running this SQL could change the database (INSERT/UPDATE/DELETE/DDL…). */
function isMutating(sql: string): boolean {
  return splitStatements(sql).some((s) => !returnsRows(s));
}

/** One editor tab (VS Code style) — its own SQL and title. */
export interface EditorTab {
  id: string;
  title: string;
  sql: string;
}

let tabCounter = 0;
function newTabId(): string {
  tabCounter += 1;
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `tab-${tabCounter}-${typeof performance !== "undefined" ? Math.floor(performance.now()) : tabCounter}`;
}

interface PersistedWorkspace {
  dialect: Dialect;
  editorSql: string;
  setupSql: string; // schema + seed applied to a fresh DB
  activeSampleId: string | null; // set when the workspace is an unmodified built-in sample
  tabs?: EditorTab[];
  activeTabId?: string;
  tabSeq?: number;
  tableOrder?: Record<string, number>;
  tableSort?: TableSort;
}

export type Theme = "dark" | "light";
export type TableSort = "name-asc" | "name-desc" | "created-desc" | "created-asc";

interface PlaygroundState {
  dialect: Dialect;
  engine: DbEngine | null;
  ready: boolean;
  running: boolean;
  /** SQL of the ACTIVE editor tab (mirror of tabs[activeTabId]). */
  editorSql: string;
  /** Open editor tabs and which one is active. */
  tabs: EditorTab[];
  activeTabId: string;
  tabSeq: number;
  /** Cumulative DDL/DML that defines the current database (from the table builder + Run-as-setup). */
  setupSql: string;
  /** When the workspace is an unmodified built-in sample, its id — lets us re-seed
   *  the correct dialect flavor when the engine changes. Null once customized. */
  activeSampleId: string | null;
  outcome: QueryOutcome | null;
  /** The exact SQL of the last run (used by the visualizer). */
  lastRunSql: string;
  schema: TableMeta[];
  /** Creation sequence per table (assigned when first seen) → sort by newest/oldest. */
  tableOrder: Record<string, number>;
  tableSort: TableSort;
  theme: Theme;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiKey: string;
  aiModel: string;
  /** A prompt handed to the AI panel from elsewhere (e.g. "explain this JOIN"). */
  aiPrompt: { text: string; id: number } | null;
  statusMessage: string | null;
  /** Named workspaces. Each has its own tables/data + editor state, persisted independently. */
  projects: ProjectMeta[];
  activeProjectId: string;

  init: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => Promise<void>;
  switchProject: (id: string) => Promise<void>;
  setDialect: (d: Dialect) => Promise<void>;
  setEditorSql: (sql: string) => void;
  newTab: (opts?: { sql?: string; title?: string; run?: boolean }) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTab: (fromId: string, toId: string, after?: boolean) => void;
  run: (sql?: string) => Promise<void>;
  /** Run SQL and also fold it into setupSql so it persists across resets. */
  applySetup: (sql: string) => Promise<QueryOutcome>;
  refreshSchema: () => Promise<void>;
  setTableSort: (s: TableSort) => void;
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

function loadPersisted(projectId: string): PersistedWorkspace | null {
  if (typeof window === "undefined" || !projectId) return null;
  try {
    const raw = localStorage.getItem(wsKey(projectId));
    return raw ? (JSON.parse(raw) as PersistedWorkspace) : null;
  } catch {
    return null;
  }
}

// setupSql accumulates every applied statement (including bulk CSV inserts) and
// can grow to megabytes, filling localStorage. It's only used to re-seed a
// dialect that has no snapshot yet, so cap it — the IndexedDB snapshot is the
// authoritative copy of the current database.
const MAX_SETUP_SQL = 50_000;

function persist(state: PlaygroundState) {
  if (typeof window === "undefined" || !state.activeProjectId) return;
  const data: PersistedWorkspace = {
    dialect: state.dialect,
    editorSql: state.editorSql,
    setupSql: state.setupSql.length > MAX_SETUP_SQL ? "" : state.setupSql,
    activeSampleId: state.activeSampleId,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    tabSeq: state.tabSeq,
    tableOrder: state.tableOrder,
    tableSort: state.tableSort,
  };
  const key = wsKey(state.activeProjectId);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Over quota — the setupSql (accumulated schema + seed inserts) can grow
    // large. Retry without it: tables & data are already safe in the IndexedDB
    // snapshot, so we only lose the cross-dialect re-seed script.
    try {
      localStorage.setItem(key, JSON.stringify({ ...data, setupSql: "" }));
    } catch {
      /* still too big — give up; the IndexedDB snapshot is authoritative */
    }
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

export const usePlayground = create<PlaygroundState>((set, get) => {
  // Boots (or re-boots) the engine + editor state for a project. Used on first
  // load, when switching projects, and when creating/deleting one. Assumes
  // `activeProjectId` is already set on the state.
  const bootProject = async (projectId: string, firstVisit: boolean): Promise<void> => {
    const persisted = loadPersisted(projectId);
    const dialect = persisted?.dialect ?? "postgres";
    set({
      dialect,
      tableOrder: persisted?.tableOrder ?? {},
      tableSort: persisted?.tableSort ?? "name-asc",
    });

    const engine = createEngine(dialect);
    set({ statusMessage: "Booting database engine…" });
    await engine.init();

    let setupSql = persisted?.setupSql ?? "";
    let editorSql = persisted?.editorSql ?? "";
    let activeSampleId = persisted?.activeSampleId ?? null;

    // Restore this project's saved database (schema + data). Survives refreshes.
    const snap = await idbGet(dbKey(projectId, dialect));
    let restored = false;
    if (snap) {
      try {
        await engine.restore(snap);
        restored = true;
      } catch {
        restored = false;
      }
    }
    if (!restored && setupSql.trim()) await engine.exec(setupSql);

    set({ engine, dialect, ready: true, setupSql, editorSql, activeSampleId, statusMessage: null });
    await get().refreshSchema();

    // Seed the starter sample ONLY on a genuine first visit with an empty DB.
    if (firstVisit && !snap && get().schema.length === 0) {
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

    // Restore editor tabs, or create the first one from editorSql (migration).
    let tabs = persisted?.tabs;
    let activeTabId = persisted?.activeTabId ?? "";
    let tabSeq = persisted?.tabSeq ?? 1;
    if (!tabs || tabs.length === 0) {
      const id = newTabId();
      tabs = [{ id, title: "Query 1", sql: editorSql }];
      activeTabId = id;
      tabSeq = 1;
    } else {
      if (!tabs.some((t) => t.id === activeTabId)) activeTabId = tabs[0].id;
      editorSql = tabs.find((t) => t.id === activeTabId)?.sql ?? "";
    }
    set({ tabs, activeTabId, tabSeq, editorSql });

    persist(get());
    await saveSnapshot(projectId, dialect, engine);
  };

  return {
  dialect: "postgres",
  engine: null,
  ready: false,
  running: false,
  editorSql: "",
  tabs: [],
  activeTabId: "",
  tabSeq: 1,
  setupSql: "",
  activeSampleId: null,
  outcome: null,
  lastRunSql: "",
  schema: [],
  tableOrder: {},
  tableSort: "name-asc",
  theme: "dark",
  aiEnabled: false,
  aiProvider: "anthropic",
  aiKey: "",
  aiModel: "claude-opus-4-8",
  aiPrompt: null,
  statusMessage: null,
  projects: [],
  activeProjectId: "",

  init: async () => {
    // Run exactly once, even if called twice by StrictMode's double-mount.
    if (initPromise) return initPromise;
    if (get().ready) return;

    initPromise = (async () => {
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

      // Resolve the project registry. First run (or upgrade from the old
      // single-workspace layout) → create a default project and migrate any
      // existing workspace metadata + DB snapshots into it.
      let pf = loadProjectsFile();
      let firstVisit = false;
      if (!pf) {
        const id = newProjectId();
        pf = { activeId: id, list: [{ id, name: "My Project", createdAt: Date.now() }] };
        const legacy = typeof window !== "undefined" ? localStorage.getItem("sqlpg:workspace:v1") : null;
        if (legacy) {
          // Move (not copy) the old workspace so we don't briefly double its
          // footprint and blow the localStorage quota. The DB snapshot in
          // IndexedDB is the source of truth for tables/data, so even if this
          // metadata write fails the project still restores correctly.
          try {
            localStorage.setItem(wsKey(id), legacy);
          } catch {
            /* quota — skip; snapshot below still carries the data */
          }
          localStorage.removeItem("sqlpg:workspace:v1");
        }
        for (const d of DIALECTS) {
          const s = await idbGet(`db:${d.id}`);
          if (s) {
            await idbSet(dbKey(id, d.id), s);
            await idbDel(`db:${d.id}`);
          }
        }
        saveProjectsFile(pf);
        firstVisit = !legacy; // no prior data at all → seed the starter sample
      }
      set({ projects: pf.list, activeProjectId: pf.activeId });

      await bootProject(pf.activeId, firstVisit);
    })();

    return initPromise;
  },

  createProject: async (name) => {
    // Save the current project before leaving it.
    persist(get());
    const { engine, dialect, activeProjectId } = get();
    if (engine) await saveSnapshot(activeProjectId, dialect, engine);

    // In-memory state is the source of truth; the localStorage file is only a
    // best-effort mirror (it can fail to write when the browser is over quota).
    const id = newProjectId();
    const list = [...get().projects, { id, name: name.trim() || "Untitled", createdAt: Date.now() }];
    saveProjectsFile({ activeId: id, list });

    // Fresh, empty workspace (no snapshot, no setup → blank DB + one empty tab).
    set({
      projects: list,
      activeProjectId: id,
      ready: false,
      statusMessage: "Creating project…",
      outcome: null,
      lastRunSql: "",
      tableOrder: {},
      setupSql: "",
      activeSampleId: null,
    });
    await bootProject(id, false);
  },

  renameProject: (id, name) => {
    const list = get().projects.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
    saveProjectsFile({ activeId: get().activeProjectId, list });
    set({ projects: list });
  },

  deleteProject: async (id) => {
    const current = get().projects;
    if (current.length <= 1) return; // always keep at least one project
    // Purge the deleted project's storage (best-effort).
    if (typeof window !== "undefined") localStorage.removeItem(wsKey(id));
    await Promise.all(DIALECTS.map((d) => idbDel(dbKey(id, d.id))));

    const wasActive = get().activeProjectId === id;
    const list = current.filter((p) => p.id !== id);
    const activeId = wasActive ? list[0].id : get().activeProjectId;
    saveProjectsFile({ activeId, list });
    set({ projects: list, activeProjectId: activeId });

    if (wasActive) {
      set({ ready: false, statusMessage: "Loading project…", outcome: null, lastRunSql: "" });
      await bootProject(activeId, false);
    }
  },

  switchProject: async (id) => {
    if (id === get().activeProjectId) return;
    // Persist the outgoing project first.
    persist(get());
    const { engine, dialect, activeProjectId } = get();
    if (engine) await saveSnapshot(activeProjectId, dialect, engine);

    saveProjectsFile({ activeId: id, list: get().projects });
    set({
      activeProjectId: id,
      ready: false,
      statusMessage: "Loading project…",
      outcome: null,
      lastRunSql: "",
    });
    await bootProject(id, false);
  },

  setDialect: async (d) => {
    if (d === get().dialect) return;
    set({ ready: false, statusMessage: `Switching to ${d}…`, dialect: d });
    const engine = createEngine(d);
    await engine.init();

    let note: string | null = null;

    // Prefer this dialect's own saved snapshot (its persisted tables + data).
    const snap = await idbGet(dbKey(get().activeProjectId, d));
    let restored = false;
    if (snap) {
      try {
        await engine.restore(snap);
        restored = true;
      } catch {
        restored = false;
      }
    }

    if (!restored) {
      const sample = get().activeSampleId ? getSample(get().activeSampleId!) : undefined;
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
    }

    set({ engine, ready: true, statusMessage: note });
    await get().refreshSchema();
    persist(get());
    await saveSnapshot(get().activeProjectId, d, engine);
    if (note) setTimeout(() => set({ statusMessage: null }), 6000);
  },

  setEditorSql: (sql) => {
    // Write to the active tab and keep the editorSql mirror in sync.
    const { tabs, activeTabId } = get();
    const nextTabs = tabs.map((t) => (t.id === activeTabId ? { ...t, sql } : t));
    set({ editorSql: sql, tabs: nextTabs });
    persist(get());
  },

  newTab: ({ sql = "", title, run } = {}) => {
    const { tabs } = get();
    // Reuse the lowest free "Query N" number (so closing Query 2 frees it).
    let finalTitle = title;
    if (!finalTitle) {
      const used = new Set<number>();
      for (const t of tabs) {
        const m = /^Query (\d+)$/.exec(t.title);
        if (m) used.add(Number(m[1]));
      }
      let n = 1;
      while (used.has(n)) n++;
      finalTitle = `Query ${n}`;
    }
    const id = newTabId();
    const tab: EditorTab = { id, title: finalTitle, sql };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id, editorSql: sql }));
    persist(get());
    if (run && sql.trim()) void get().run(sql);
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) {
      // Never remove the last tab — clear it instead.
      const cleared = [{ ...tabs[0], sql: "", title: "Query 1" }];
      set({ tabs: cleared, activeTabId: cleared[0].id, editorSql: "" });
      persist(get());
      return;
    }
    const idx = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) nextActive = (remaining[idx - 1] ?? remaining[0]).id;
    const nextSql = remaining.find((t) => t.id === nextActive)?.sql ?? "";
    set({ tabs: remaining, activeTabId: nextActive, editorSql: nextSql });
    persist(get());
  },

  setActiveTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set({ activeTabId: id, editorSql: tab.sql });
    persist(get());
  },

  reorderTab: (fromId, toId, after = false) => {
    if (fromId === toId) return;
    const tabs = [...get().tabs];
    const from = tabs.findIndex((t) => t.id === fromId);
    if (from < 0) return;
    const [moved] = tabs.splice(from, 1);
    let target = tabs.findIndex((t) => t.id === toId);
    if (target < 0) return;
    if (after) target += 1; // dropped on the right half → place after the target
    tabs.splice(target, 0, moved);
    set({ tabs });
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
    // Persist if the query changed data (INSERT/UPDATE/DELETE/DDL).
    if (outcome.ok && isMutating(toRun)) await saveSnapshot(get().activeProjectId, get().dialect, engine);
  },

  applySetup: async (sql) => {
    const { engine } = get();
    if (!engine) return { ok: false, results: [], elapsedMs: 0, error: { message: "No engine" } };
    const outcome = await engine.exec(sql);
    // Surface the result in the panel so table-builder / sidebar actions give feedback.
    set({ outcome });
    // Always refresh the schema — even on failure a statement may have partly
    // applied (e.g. CREATE succeeded, INSERT failed), and the sidebar must show it.
    await get().refreshSchema();
    if (outcome.ok) {
      const setupSql = [get().setupSql, sql].filter((s) => s.trim()).join("\n\n");
      // The workspace is now customized — no longer a pristine sample.
      set({ setupSql, activeSampleId: null });
      persist(get());
      await saveSnapshot(get().activeProjectId, get().dialect, engine);
    }
    return outcome;
  },

  refreshSchema: async () => {
    const { engine } = get();
    if (!engine) return;
    try {
      const schema = await engine.introspect();
      // Track creation order: assign a sequence to newly-seen tables, prune dropped ones.
      const prev = get().tableOrder;
      const order = { ...prev };
      const names = new Set(schema.map((t) => t.name));
      let changed = false;
      let next = Object.values(order).length ? Math.max(...Object.values(order)) + 1 : 1;
      for (const t of schema) {
        if (!(t.name in order)) {
          order[t.name] = next++;
          changed = true;
        }
      }
      for (const k of Object.keys(order)) {
        if (!names.has(k)) {
          delete order[k];
          changed = true;
        }
      }
      set(changed ? { schema, tableOrder: order } : { schema });
      if (changed) persist(get());
    } catch {
      /* introspection best-effort */
    }
  },

  setTableSort: (s) => {
    set({ tableSort: s });
    persist(get());
  },

  resetDatabase: async () => {
    const { engine, dialect } = get();
    if (!engine) return;
    // Factory reset: drop everything the user built, then restore the default
    // starter sample (schema + data) so the playground is never left empty.
    await engine.reset();
    const sample = SAMPLES[0];
    const seed = sampleSql(sample, dialect);
    await engine.exec(seed);

    const id = newTabId();
    set({
      setupSql: seed,
      editorSql: sample.query,
      tabs: [{ id, title: sample.name, sql: sample.query }],
      activeTabId: id,
      tabSeq: 1,
      outcome: null,
      lastRunSql: "",
      activeSampleId: sample.id,
      tableOrder: {},
    });

    const pid = get().activeProjectId;
    // Drop the OTHER dialects' snapshots so they re-seed the default sample too
    // (the active dialect is re-saved below).
    await Promise.all(
      DIALECTS.filter((d) => d.id !== dialect).map((d) => idbDel(dbKey(pid, d.id)))
    );
    await get().refreshSchema();
    persist(get());
    await saveSnapshot(pid, dialect, engine);
  },

  loadSample: async (id) => {
    const sample = getSample(id);
    const { engine, dialect } = get();
    if (!sample || !engine) return;
    await engine.reset();
    const setup = sampleSql(sample, dialect);
    await engine.exec(setup);
    // Put the sample query into the active tab.
    const { tabs, activeTabId } = get();
    const nextTabs = tabs.map((t) =>
      t.id === activeTabId ? { ...t, sql: sample.query, title: sample.name } : t
    );
    set({
      setupSql: setup,
      editorSql: sample.query,
      tabs: nextTabs,
      outcome: null,
      activeSampleId: sample.id,
    });
    await get().refreshSchema();
    persist(get());
    await saveSnapshot(get().activeProjectId, dialect, engine);
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
  };
});

function applyThemeToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
