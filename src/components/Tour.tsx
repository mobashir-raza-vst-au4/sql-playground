"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

interface Step {
  sel: string;
  title: string;
  body: string;
  /** On mobile, open the sidebar drawer for this step (it's hidden by default). */
  openSidebar?: boolean;
}

const STEPS: Step[] = [
  {
    sel: '[data-tour="schema"]',
    title: "Your tables",
    body: "Every table lives here. Click one to expand it — run SELECT *, clear rows, or drop it. Your tables and data are saved in the browser and survive a refresh.",
    openSidebar: true,
  },
  {
    sel: '[data-tour="sort"]',
    title: "Sort your tables",
    body: "Order the table list by name (A–Z / Z–A) or by when it was created — newest or oldest first.",
    openSidebar: true,
  },
  {
    sel: '[data-tour="import-export"]',
    title: "Import & export data",
    body: "Import one or more CSV files to auto-create tables (or drag files anywhere onto the page). Export the whole database as a .sql file.",
    openSidebar: true,
  },
  {
    sel: '[data-tour="editor"]',
    title: "Write SQL",
    body: "Type queries here with autocomplete and inline hints. Put your cursor in a statement and press ⌘/Ctrl+Enter to run just that one.",
  },
  {
    sel: '[data-tour="tabs"]',
    title: "Multiple query tabs",
    body: "Open several tabs with + (or ⇧⌘N) and drag to reorder them — each keeps its own SQL. SELECT * and examples open in a new tab so your work isn't lost.",
  },
  {
    sel: '[data-tour="run"]',
    title: "Run everything",
    body: "Runs the whole script at once — results (or row counts) appear below.",
  },
  {
    sel: '[data-tour="examples"]',
    title: "Example queries",
    body: "Load ready-made queries, including ones that show how PostgreSQL, SQLite and MySQL differ.",
  },
  {
    sel: '[data-tour="visualize"]',
    title: "Visualize",
    body: "Switch here to see JOINs animated and a step-by-step execution pipeline with real row counts.",
  },
  {
    sel: '[data-tour="export-results"]',
    title: "Export results",
    body: "Download the current query's results as CSV or JSON. Large results scroll smoothly — every row is available.",
  },
  {
    sel: '[data-tour="newtable"]',
    title: "Build a table",
    body: "Create tables visually — columns, types, constraints, and seed data (grid or pasted JSON).",
  },
  {
    sel: '[data-tour="ai"]',
    title: "AI tutor",
    body: "Turn on the AI tutor (Claude, ChatGPT, or the free Google Gemini) to explain, optimize and fix your queries.",
  },
];

const TOOLTIP_W = 300;
const PAD = 6;
const GAP = 12;

export default function Tour({
  onClose,
  onSidebar,
}: {
  onClose: () => void;
  onSidebar?: (open: boolean) => void;
}) {
  // Keep steps whose target exists and is either on-screen now or can be
  // revealed (openSidebar steps open the mobile drawer when reached).
  const steps = useMemo(() => {
    if (typeof document === "undefined") return [];
    return STEPS.filter((s) => {
      const el = document.querySelector(s.sel);
      if (!el) return false;
      if (s.openSidebar) return true;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.top < window.innerHeight;
    });
  }, []);

  const [i, setI] = useState(0);
  const [, setTick] = useState(0); // re-measure on resize / drawer open

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (steps.length === 0) onClose();
  }, [steps.length, onClose]);

  // Open/close the mobile sidebar drawer as the tour moves on/off its step.
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const current = steps[Math.min(i, Math.max(0, steps.length - 1))];
  useEffect(() => {
    if (!isMobile || !onSidebar) return;
    if (current?.openSidebar) {
      onSidebar(true);
      const t = setTimeout(() => setTick((x) => x + 1), 260); // re-measure after slide-in
      return () => clearTimeout(t);
    }
    onSidebar(false);
  }, [current, isMobile, onSidebar]);

  // Ensure the drawer is closed when the tour ends.
  useEffect(() => () => onSidebar?.(false), [onSidebar]);

  if (steps.length === 0) return null;
  const step = steps[Math.min(i, steps.length - 1)];
  const el = document.querySelector(step.sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // Tooltip below the target if there's room, otherwise above.
  const below = r.bottom + 160 < vh;
  const top = below ? r.bottom + GAP : Math.max(GAP, r.top - GAP - 150);
  const left = Math.min(Math.max(r.left, 8), vw - TOOLTIP_W - 8);

  const last = i >= steps.length - 1;
  const next = () => (last ? onClose() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  return (
    <div className="fixed inset-0 z-[60]">
      {/* click-blocker */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* spotlight: dark surround + highlight ring around the target */}
      <div
        className="absolute rounded-lg pointer-events-none"
        style={{
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
          border: "2px solid var(--accent)",
          transition: "all 0.2s ease",
        }}
      />

      {/* tooltip card */}
      <div
        className="absolute rounded-lg border bg-panel shadow-2xl p-4"
        style={{ top, left, width: TOOLTIP_W, borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm text-app">{step.title}</div>
          <button className="text-muted hover:text-app" onClick={onClose} title="Skip tour">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <div className="text-[11px] text-muted">
            {i + 1} / {steps.length}
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs text-muted hover:text-app" onClick={onClose}>
              Skip
            </button>
            {i > 0 && (
              <button className="btn !py-1 !px-2 text-xs" onClick={back}>
                Back
              </button>
            )}
            <button className="btn btn-primary !py-1 !px-3 text-xs" onClick={next}>
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
