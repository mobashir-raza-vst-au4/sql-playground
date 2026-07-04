"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayground } from "@/lib/store";
import Toolbar from "./Toolbar";
import SqlEditor from "./SqlEditor";
import ResultsPanel from "./ResultsPanel";
import SchemaSidebar from "./SchemaSidebar";
import TableBuilder from "./TableBuilder";
import JoinGuide from "./JoinGuide";
import AiPanel from "./AiPanel";
import Tour from "./Tour";
import CsvImport, { type CsvData } from "./CsvImport";
import ResizeHandle, { usePersistedSize } from "./ResizeHandle";
import { parseCsv } from "@/lib/csv";
import { Database, FileUp } from "lucide-react";

const TOUR_KEY = "sqlpg:tour-done";

export default function Playground() {
  const init = usePlayground((s) => s.init);
  const ready = usePlayground((s) => s.ready);
  const statusMessage = usePlayground((s) => s.statusMessage);
  const aiEnabled = usePlayground((s) => s.aiEnabled);
  const applySetup = usePlayground((s) => s.applySetup);
  const newTab = usePlayground((s) => s.newTab);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editTable, setEditTable] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [tourOpen, setTourOpen] = useState(false);
  const [csvQueue, setCsvQueue] = useState<CsvData[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Resizable panels (desktop only). Sizes are remembered across sessions.
  const [isDesktop, setIsDesktop] = useState(true);
  const [sidebarW, setSidebarW] = usePersistedSize("sqlpg:panel:sidebarW", 256);
  const [resultsH, setResultsH] = usePersistedSize("sqlpg:panel:resultsH", 300);
  const [aiW, setAiW] = usePersistedSize("sqlpg:panel:aiW", 360);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  // Track whether we're at the md+ breakpoint (Tailwind's 768px). Below it, the
  // sidebar/AI become overlays and the fixed mobile layout is used instead.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Clamp the results height so the editor always keeps at least ~140px.
  const clampResults = (n: number) => {
    const h = mainRef.current?.clientHeight ?? 600;
    setResultsH(Math.max(120, Math.min(n, h - 140)));
  };

  // Handle one or more dropped/selected files: each CSV → a queued import
  // (reviewed one at a time); each .sql → run + shown in a tab.
  const handleFiles = async (files: File[]) => {
    const parsed: CsvData[] = [];
    for (const file of files) {
      const text = await file.text();
      if (/\.sql$/i.test(file.name)) {
        newTab({ sql: text, title: file.name });
        await applySetup(text);
      } else {
        const { headers, rows } = parseCsv(text);
        if (headers.length > 0) parsed.push({ fileName: file.name, headers, rows });
      }
    }
    if (parsed.length) setCsvQueue((q) => [...q, ...parsed]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void handleFiles(files);
  };

  // First-run guided tour once the app is ready.
  useEffect(() => {
    if (!ready) return;
    if (typeof window !== "undefined" && localStorage.getItem(TOUR_KEY) !== "1") {
      const t = setTimeout(() => setTourOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, [ready]);

  const closeTour = () => {
    setTourOpen(false);
    setSidebarOpen(false);
    if (typeof window !== "undefined") localStorage.setItem(TOUR_KEY, "1");
  };

  const openBuilder = (table?: string) => {
    setEditTable(table ?? null);
    setBuilderOpen(true);
  };

  // Shared sidebar element (reused by both the desktop and mobile layouts).
  const sidebar = (
    <SchemaSidebar
      onNewTable={() => {
        openBuilder();
        setSidebarOpen(false);
      }}
      onEditTable={(t) => {
        openBuilder(t);
        setSidebarOpen(false);
      }}
      onImportFile={(files) => void handleFiles(files)}
    />
  );

  return (
    <div
      className="h-screen flex flex-col bg-bg text-app overflow-hidden relative"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          dragDepth.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <Toolbar
        onNewTable={() => openBuilder()}
        onOpenGuide={() => setGuideOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onStartTour={() => setTourOpen(true)}
      />

      <div className="flex-1 flex min-h-0 relative">
        {/* Schema sidebar — resizable on md+, slide-in drawer on mobile */}
        {isDesktop ? (
          <>
            <div style={{ width: sidebarW }} className="shrink-0 h-full">
              {sidebar}
            </div>
            <ResizeHandle
              axis="x"
              value={sidebarW}
              min={200}
              max={560}
              onChange={setSidebarW}
              label="Resize schema sidebar"
            />
          </>
        ) : (
          <>
            <div
              className={`absolute inset-y-0 left-0 z-40 h-full w-64 transition-transform ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              {sidebar}
            </div>
            {sidebarOpen && (
              <div className="absolute inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)} />
            )}
          </>
        )}

        <main ref={mainRef} className="flex-1 flex flex-col min-w-0">
          {!ready ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted">
              <Database className="w-8 h-8 spin text-accent" />
              <div>{statusMessage ?? "Loading playground…"}</div>
            </div>
          ) : (
            <>
              <div
                className="flex-1 min-h-0"
                style={isDesktop ? undefined : { borderBottom: "1px solid var(--border)" }}
              >
                <SqlEditor />
              </div>
              {isDesktop ? (
                <>
                  <ResizeHandle
                    axis="y"
                    value={resultsH}
                    min={120}
                    max={9999}
                    invert
                    onChange={clampResults}
                    label="Resize results panel"
                  />
                  <div style={{ height: resultsH, maxHeight: "calc(100% - 140px)" }} className="shrink-0">
                    <ResultsPanel />
                  </div>
                </>
              ) : (
                <div className="h-[42%] min-h-[180px]">
                  <ResultsPanel />
                </div>
              )}
            </>
          )}
        </main>

        {/* AI panel — resizable side panel on md+, full-screen overlay on mobile */}
        {ready &&
          aiEnabled &&
          (isDesktop ? (
            <>
              <ResizeHandle
                axis="x"
                value={aiW}
                min={280}
                max={680}
                invert
                onChange={setAiW}
                label="Resize AI panel"
              />
              <div style={{ width: aiW }} className="shrink-0 h-full">
                <AiPanel />
              </div>
            </>
          ) : (
            <div className="absolute inset-0 z-40 h-full">
              <AiPanel />
            </div>
          ))}
      </div>

      {builderOpen && (
        <TableBuilder editTable={editTable} onClose={() => setBuilderOpen(false)} />
      )}
      {guideOpen && <JoinGuide onClose={() => setGuideOpen(false)} />}
      {ready && tourOpen && <Tour onClose={closeTour} onSidebar={setSidebarOpen} />}
      {csvQueue.length > 0 && (
        <CsvImport
          key={`${csvQueue.length}:${csvQueue[0].fileName}`}
          data={csvQueue[0]}
          more={csvQueue.length - 1}
          onClose={() => setCsvQueue((q) => q.slice(1))}
        />
      )}

      {/* Drag-to-import overlay */}
      {dragging && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center pointer-events-none" style={{ background: "rgba(13,17,23,0.8)" }}>
          <div
            className="flex flex-col items-center gap-3 px-10 py-8 rounded-xl border-2 border-dashed"
            style={{ borderColor: "var(--accent)" }}
          >
            <FileUp className="w-10 h-10 text-accent" />
            <div className="text-lg font-medium">Drop to import</div>
            <div className="text-sm text-muted">CSV → new table · .sql → run &amp; load</div>
          </div>
        </div>
      )}
    </div>
  );
}
