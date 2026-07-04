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

  useEffect(() => {
    void init();
  }, [init]);

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
        {/* Schema sidebar — static on md+, slide-in drawer on mobile */}
        <div
          className={`absolute md:static inset-y-0 left-0 z-40 md:z-auto h-full transition-transform md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
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
        </div>
        {/* backdrop when the mobile drawer is open */}
        {sidebarOpen && (
          <div
            className="md:hidden absolute inset-0 z-30 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0">
          {!ready ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted">
              <Database className="w-8 h-8 spin text-accent" />
              <div>{statusMessage ?? "Loading playground…"}</div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 border-b border-app" style={{ borderColor: "var(--border)" }}>
                <SqlEditor />
              </div>
              <div className="h-[42%] min-h-[180px]">
                <ResultsPanel />
              </div>
            </>
          )}
        </main>

        {/* AI panel — side panel on md+, full-screen overlay on mobile */}
        {ready && aiEnabled && (
          <div className="absolute md:static inset-0 md:inset-auto z-40 md:z-auto h-full">
            <AiPanel />
          </div>
        )}
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
