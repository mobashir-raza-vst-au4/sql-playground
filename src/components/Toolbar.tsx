"use client";

import { usePlayground } from "@/lib/store";
import { DIALECTS } from "@/lib/engine";
import { SAMPLES, EXAMPLES, exampleSql } from "@/lib/samples";
import {
  Play,
  Plus,
  RotateCcw,
  Moon,
  Sun,
  Sparkles,
  ChevronDown,
  BookOpen,
  Code2,
  Menu,
  HelpCircle,
  X,
} from "lucide-react";
import { useState } from "react";
import Logo from "./Logo";
import ProjectMenu from "./ProjectMenu";

export default function Toolbar({
  onNewTable,
  onOpenGuide,
  onToggleSidebar,
  onStartTour,
}: {
  onNewTable: () => void;
  onOpenGuide: () => void;
  onToggleSidebar: () => void;
  onStartTour: () => void;
}) {
  const {
    dialect,
    setDialect,
    run,
    running,
    ready,
    theme,
    toggleTheme,
    aiEnabled,
    setAiEnabled,
    resetDatabase,
    loadSample,
    newTab,
  } = usePlayground();
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const active = DIALECTS.find((d) => d.id === dialect);

  return (
    <header
      className="flex flex-wrap items-center gap-2 px-3 py-2 min-h-14 border-b bg-panel shrink-0 [&>*]:shrink-0"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Sidebar toggle (mobile only) */}
      <button
        className="md:hidden text-muted hover:text-app p-1"
        onClick={onToggleSidebar}
        title="Toggle schema sidebar"
        aria-label="Toggle schema sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2">
        <Logo size={28} />
        <div className="leading-tight">
          <div className="font-semibold text-sm">SQL Playground</div>
          <div className="text-[10px] text-muted hidden lg:block">learn, run &amp; visualize SQL</div>
        </div>
      </div>

      <div className="w-px h-6 mx-1 hidden sm:block" style={{ background: "var(--border)" }} />

      {/* Project switcher (named workspaces) */}
      <ProjectMenu />

      {/* Dialect */}
      <label className="flex items-center gap-2 text-sm text-muted">
        <span className="hidden sm:inline">Engine</span>
        <select
          className="select"
          value={dialect}
          disabled={!ready}
          onChange={(e) => void setDialect(e.target.value as typeof dialect)}
        >
          {DIALECTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.emulated ? " (beta)" : ""}
            </option>
          ))}
        </select>
      </label>
      {active?.note && (
        <span className="text-xs text-muted hidden lg:inline max-w-[260px] truncate" title={active.note}>
          {active.note}
        </span>
      )}

      <div className="flex-1" />

      {/* Example queries (dialect-aware) */}
      <div className="relative" data-tour="examples">
        <button className="btn" onClick={() => setExamplesOpen((v) => !v)} disabled={!ready}>
          <Code2 className="w-4 h-4" /> Examples <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {examplesOpen && (
          <div
            className="absolute right-0 mt-1 w-80 rounded-md border bg-panel z-20 p-1 shadow-lg"
            style={{ borderColor: "var(--border)" }}
            onMouseLeave={() => setExamplesOpen(false)}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
              Loads into the editor for {active?.label}
            </div>
            {EXAMPLES.map((e) => (
              <button
                key={e.id}
                className="w-full text-left px-2 py-2 rounded hover:bg-hover"
                onClick={() => {
                  newTab({ sql: exampleSql(e, dialect), title: e.name, run: true });
                  setExamplesOpen(false);
                }}
              >
                <div className="text-sm font-medium">{e.name}</div>
                <div className="text-xs text-muted">{e.note}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Samples */}
      <div className="relative">
        <button className="btn" onClick={() => setSamplesOpen((v) => !v)} disabled={!ready}>
          Samples <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {samplesOpen && (
          <div
            className="absolute right-0 mt-1 w-72 rounded-md border bg-panel z-20 p-1 shadow-lg"
            style={{ borderColor: "var(--border)" }}
            onMouseLeave={() => setSamplesOpen(false)}
          >
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                className="w-full text-left px-2 py-2 rounded hover:bg-hover"
                onClick={() => {
                  void loadSample(s.id);
                  setSamplesOpen(false);
                }}
              >
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted">{s.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn" onClick={onOpenGuide} title="Learn SQL JOINs">
        <BookOpen className="w-4 h-4" /> JOIN Guide
      </button>

      <button className="btn" onClick={onNewTable} disabled={!ready} data-tour="newtable">
        <Plus className="w-4 h-4" /> New Table
      </button>

      <button
        className="btn btn-danger"
        onClick={() => setResetOpen(true)}
        disabled={!ready}
        title="Discard changes and restore the default sample tables"
      >
        <RotateCcw className="w-4 h-4" /> Reset
      </button>

      <button
        className={`btn ${aiEnabled ? "" : "opacity-70"}`}
        onClick={() => setAiEnabled(!aiEnabled)}
        title="Toggle the AI tutor"
        data-tour="ai"
      >
        <Sparkles className={`w-4 h-4 ${aiEnabled ? "text-accent" : ""}`} />
        AI {aiEnabled ? "On" : "Off"}
      </button>

      <button className="btn" onClick={onStartTour} title="Take the guided tour">
        <HelpCircle className="w-4 h-4" />
      </button>

      <button className="btn" onClick={toggleTheme} title="Toggle dark / light">
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <button
        className="btn btn-primary"
        onClick={() => void run()}
        disabled={!ready || running}
        title="Run the entire script (all statements)"
        data-tour="run"
      >
        <Play className="w-4 h-4" /> {running ? "Running…" : "Run all"}
      </button>

      {/* In-app reset confirmation (window.confirm is unreliable in embedded views). */}
      {resetOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => e.target === e.currentTarget && !resetting && setResetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-panel p-4 shadow-2xl"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">Reset this project?</div>
              <button className="text-muted hover:text-app" onClick={() => !resetting && setResetOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted mt-1.5 mb-4 leading-relaxed">
              This <b>drops every table</b> (including ones you added), clears your query tabs, and
              restores the default sample tables and query. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setResetOpen(false)} disabled={resetting}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  await resetDatabase();
                  setResetting(false);
                  setResetOpen(false);
                }}
              >
                {resetting ? "Resetting…" : "Reset to default"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
