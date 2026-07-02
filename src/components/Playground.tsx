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
import { Database } from "lucide-react";

export default function Playground() {
  const init = usePlayground((s) => s.init);
  const ready = usePlayground((s) => s.ready);
  const statusMessage = usePlayground((s) => s.statusMessage);
  const aiEnabled = usePlayground((s) => s.aiEnabled);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editTable, setEditTable] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const openBuilder = (table?: string) => {
    setEditTable(table ?? null);
    setBuilderOpen(true);
  };

  return (
    <div className="h-screen flex flex-col bg-bg text-app overflow-hidden">
      <Toolbar onNewTable={() => openBuilder()} onOpenGuide={() => setGuideOpen(true)} />

      <div className="flex-1 flex min-h-0">
        <SchemaSidebar onNewTable={() => openBuilder()} onEditTable={(t) => openBuilder(t)} />

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

        {ready && aiEnabled && <AiPanel />}
      </div>

      {builderOpen && (
        <TableBuilder editTable={editTable} onClose={() => setBuilderOpen(false)} />
      )}
      {guideOpen && <JoinGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
