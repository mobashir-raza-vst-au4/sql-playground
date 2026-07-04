"use client";

import { usePlayground } from "@/lib/store";
import { FolderKanban, ChevronDown, Plus, Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Named-workspace switcher. Each project has its own tables, data and tabs. */
export default function ProjectMenu() {
  const projects = usePlayground((s) => s.projects);
  const activeProjectId = usePlayground((s) => s.activeProjectId);
  const ready = usePlayground((s) => s.ready);
  const switchProject = usePlayground((s) => s.switchProject);
  const createProject = usePlayground((s) => s.createProject);
  const renameProject = usePlayground((s) => s.renameProject);
  const deleteProject = usePlayground((s) => s.deleteProject);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const active = projects.find((p) => p.id === activeProjectId);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setNewName("");
    setEditingId(null);
    setConfirmDelete(null);
  };

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(false);
    setNewName("");
    setOpen(false);
    await createProject(name);
  };

  const submitRename = (id: string) => {
    if (editName.trim()) renameProject(id, editName);
    setEditingId(null);
  };

  return (
    <div className="relative" ref={wrapRef} data-tour="projects">
      <button
        className="btn max-w-[180px]"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={!ready}
        title="Switch or manage projects (workspaces)"
      >
        <FolderKanban className="w-4 h-4 text-accent shrink-0" />
        <span className="truncate">{active?.name ?? "Project"}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 mt-1 w-72 rounded-md border bg-panel z-30 p-1 shadow-lg"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
            Projects · each keeps its own tables &amp; data
          </div>

          <div className="max-h-64 overflow-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1 rounded hover:bg-hover group"
              >
                {editingId === p.id ? (
                  <input
                    autoFocus
                    className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none border rounded"
                    style={{ borderColor: "var(--accent)" }}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => submitRename(p.id)}
                  />
                ) : (
                  <>
                    <button
                      className="flex items-center gap-1.5 flex-1 px-2 py-1.5 text-left text-sm min-w-0"
                      onClick={() => {
                        close();
                        if (p.id !== activeProjectId) void switchProject(p.id);
                      }}
                    >
                      {p.id === activeProjectId ? (
                        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 px-1 text-muted hover:text-app shrink-0"
                      title="Rename"
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                        setConfirmDelete(null);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className={`px-1 shrink-0 ${
                        projects.length <= 1
                          ? "opacity-20 cursor-not-allowed"
                          : "opacity-0 group-hover:opacity-100 text-muted hover:text-bad"
                      }`}
                      title={projects.length <= 1 ? "Can't delete the only project" : "Delete project"}
                      disabled={projects.length <= 1}
                      onClick={() => setConfirmDelete(confirmDelete === p.id ? null : p.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {confirmDelete && (
            <div
              className="mx-1 my-1 p-2 rounded text-xs"
              style={{ border: "1px solid var(--bad)" }}
            >
              <div className="mb-2 text-app">
                Delete <b>{projects.find((p) => p.id === confirmDelete)?.name}</b> and all its tables
                &amp; data? This can&apos;t be undone.
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn !py-1 !px-2" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger !py-1 !px-2"
                  onClick={() => {
                    const id = confirmDelete;
                    setConfirmDelete(null);
                    close();
                    void deleteProject(id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          <div className="border-t mt-1 pt-1" style={{ borderColor: "var(--border)" }}>
            {creating ? (
              <div className="flex items-center gap-1 px-1 py-1">
                <input
                  autoFocus
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none border rounded"
                  style={{ borderColor: "var(--accent)" }}
                  placeholder="Project name (e.g. E-commerce)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitNew();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                />
                <button className="px-1 text-accent hover:opacity-70" title="Create" onClick={() => void submitNew()}>
                  <Check className="w-4 h-4" />
                </button>
                <button
                  className="px-1 text-muted hover:text-app"
                  title="Cancel"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-sm rounded hover:bg-hover text-accent"
                onClick={() => {
                  setCreating(true);
                  setConfirmDelete(null);
                }}
              >
                <Plus className="w-4 h-4" /> New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
