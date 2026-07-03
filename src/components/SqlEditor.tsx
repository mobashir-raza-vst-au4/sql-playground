"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { usePlayground } from "@/lib/store";
import { useEffect, useRef } from "react";
import { Play, Plus, X } from "lucide-react";
import { statementAtOffset } from "@/lib/engine";
import {
  columnsForQualifier,
  maybeQuote,
  parseAliases,
  qualifierBeforeDot,
  SQL_KEYWORDS,
} from "@/lib/sql-intel";
import { lintSql } from "@/lib/sql-lint";

export default function SqlEditor() {
  const editorSql = usePlayground((s) => s.editorSql);
  const setEditorSql = usePlayground((s) => s.setEditorSql);
  const run = usePlayground((s) => s.run);
  const theme = usePlayground((s) => s.theme);
  const tabs = usePlayground((s) => s.tabs);
  const activeTabId = usePlayground((s) => s.activeTabId);
  const newTab = usePlayground((s) => s.newTab);
  const closeTab = usePlayground((s) => s.closeTab);
  const setActiveTab = usePlayground((s) => s.setActiveTab);
  const reorderTab = usePlayground((s) => s.reorderTab);
  const dragId = useRef<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const completionDisposable = useRef<{ dispose: () => void } | null>(null);

  // Scan the buffer and surface inline hints (bare OUTER JOIN, = NULL, …).
  const runLint = (value: string) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    const markers = lintSql(value).map((issue) => {
      const startPos = model.getPositionAt(issue.start);
      const endPos = model.getPositionAt(issue.end);
      const severity =
        issue.severity === "error"
          ? monaco.MarkerSeverity.Error
          : issue.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info;
      return {
        message: issue.message,
        severity,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      };
    });
    monaco.editor.setModelMarkers(model, "sqlpg-lint", markers);
  };

  useEffect(() => {
    // Dispose the completion provider when the editor unmounts.
    return () => completionDisposable.current?.dispose();
  }, []);

  // Switching tabs changes the value programmatically (no onChange) — re-lint.
  useEffect(() => {
    runLint(editorSql);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  const runCurrent = () => {
    const ed = editorRef.current;
    if (!ed) return void run();
    const model = ed.getModel();
    if (!model) return void run();

    // 1) An explicit selection always wins.
    const sel = ed.getSelection();
    if (sel && !sel.isEmpty()) {
      void run(model.getValueInRange(sel));
      return;
    }

    // 2) No selection → run the statement the cursor is inside (bounded by `;`),
    //    and highlight it so it's clear what ran.
    const pos = ed.getPosition();
    if (!pos) return void run();
    const offset = model.getOffsetAt(pos);
    const stmt = statementAtOffset(model.getValue(), offset);
    if (!stmt) return void run();

    const startPos = model.getPositionAt(stmt.start);
    const endPos = model.getPositionAt(stmt.end);
    ed.setSelection({
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    });
    void run(stmt.text);
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    runLint(editor.getValue());
    // Cmd/Ctrl + Enter runs (selection if any, else the statement at the cursor).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCurrent);
    // Shift + Cmd/Ctrl + N → new editor tab (browser may reserve this; the + button always works).
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyN,
      () => usePlayground.getState().newTab()
    );

    // Schema-aware autocomplete. Reads the latest schema/dialect from the store
    // on every keystroke, so new tables/columns show up immediately.
    completionDisposable.current?.dispose();
    completionDisposable.current = monaco.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [".", " "],
      provideCompletionItems(
        model: import("monaco-editor").editor.ITextModel,
        position: import("monaco-editor").Position
      ) {
        const { schema, dialect } = usePlayground.getState();
        const tableNames = schema.map((t) => t.name);
        const aliases = parseAliases(model.getValue(), tableNames);

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const textUntil = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // Case 1: "alias." or "table." → suggest that table's columns.
        const qualifier = qualifierBeforeDot(textUntil);
        if (qualifier) {
          const cols = columnsForQualifier(qualifier, schema, aliases);
          return {
            suggestions: cols.map((c) => ({
              label: c.pk ? `${c.column}  🔑` : c.column,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${c.type}  ·  ${c.table}`,
              insertText: maybeQuote(c.column, dialect),
              filterText: c.column,
              sortText: `0_${c.column}`,
              range,
            })),
          };
        }

        // Case 2: general context → tables, aliases, all columns, keywords.
        const suggestions: import("monaco-editor").languages.CompletionItem[] = [];

        for (const t of schema) {
          suggestions.push({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            detail: `table · ${t.rowCount} rows`,
            insertText: maybeQuote(t.name, dialect),
            filterText: t.name,
            sortText: `1_${t.name}`,
            range,
          });
        }

        for (const [alias, table] of aliases) {
          if (alias === table.toLowerCase()) continue; // skip bare table names
          suggestions.push({
            label: alias,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: `alias → ${table}`,
            insertText: alias,
            sortText: `0a_${alias}`,
            range,
          });
        }

        for (const t of schema) {
          for (const c of t.columns) {
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${c.type} · ${t.name}`,
              insertText: maybeQuote(c.name, dialect),
              filterText: c.name,
              sortText: `2_${c.name}`,
              range,
            });
          }
        }

        for (const kw of SQL_KEYWORDS) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            sortText: `3_${kw}`,
            range,
          });
        }

        return { suggestions };
      },
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center h-9 border-b bg-panel shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        {/* Editor tabs (VS Code style) */}
        <div className="flex items-stretch overflow-x-auto flex-1 min-w-0">
          {tabs.map((t) => {
            const active = t.id === activeTabId;
            return (
              <div
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                draggable
                onDragStart={(e) => {
                  dragId.current = t.id;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = dragId.current;
                  dragId.current = null;
                  if (!fromId) return;
                  // Drop on the right half of the target → place after it; left half → before.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientX > rect.left + rect.width / 2;
                  reorderTab(fromId, t.id, after);
                }}
                onDragEnd={() => (dragId.current = null)}
                className="group flex items-center gap-1.5 px-3 border-r cursor-pointer text-xs whitespace-nowrap select-none"
                style={{
                  borderColor: "var(--border)",
                  background: active ? "var(--bg)" : "transparent",
                  color: active ? "var(--text)" : "var(--muted)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                title={t.title}
              >
                <span className="max-w-[140px] truncate">{t.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 hover:text-bad shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <button
            className="px-2 text-muted hover:text-app shrink-0"
            onClick={() => newTab()}
            title="New query tab (⇧⌘N)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          className="btn !py-1 !px-2 mr-2 shrink-0"
          onClick={runCurrent}
          title="Run the selection, or the statement under the cursor (⌘/Ctrl+⏎)"
        >
          <Play className="w-3.5 h-3.5" /> Run current
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="sql"
          theme={theme === "dark" ? "vs-dark" : "light"}
          value={editorSql}
          onChange={(v) => {
            const val = v ?? "";
            setEditorSql(val);
            runLint(val);
          }}
          onMount={onMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 12, bottom: 12 },
            lineNumbersMinChars: 3,
            renderLineHighlight: "line",
            tabSize: 2,
            automaticLayout: true,
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>
    </div>
  );
}
