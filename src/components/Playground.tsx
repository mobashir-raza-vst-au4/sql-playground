"use client";

import { useEffect, useState } from "react";
import { usePlayground } from "@/lib/store";
import Toolbar from "./Toolbar";
import SqlEditor from "./SqlEditor";
import ResultsPanel from "./ResultsPanel";
import SchemaSidebar from "./SchemaSidebar";
import TableBuilder from "./TableBuilder";
import JoinGuide from "./JoinGuide";
import AiPanel from "./AiPanel";
import Tour from "./Tour";
import { Database } from "lucide-react";

const TOUR_KEY = "sqlpg:tour-done";

export default function Playground() {
  const init = usePlayground((s) => s.init);
  const ready = usePlayground((s) => s.ready);
  const statusMessage = usePlayground((s) => s.statusMessage);
  const aiEnabled = usePlayground((s) => s.aiEnabled);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editTable, setEditTable] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

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
    <div className="h-screen flex flex-col bg-bg text-app overflow-hidden">
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
    </div>
  );
}
