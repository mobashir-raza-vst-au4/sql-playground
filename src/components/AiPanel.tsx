"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayground } from "@/lib/store";
import {
  AI_PROVIDERS,
  providerInfo,
  buildSystemPrompt,
  contextBlock,
  streamAi,
  type AiMessage,
} from "@/lib/ai";
import {
  Sparkles,
  X,
  Settings,
  Send,
  Loader2,
  KeyRound,
  BookOpen,
  Wrench,
  AlertCircle,
  Workflow,
} from "lucide-react";

/** Minimal markdown: fenced code blocks + preserved prose. */
function renderContent(text: string) {
  const parts = text.split(/```/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const body = part.replace(/^[a-zA-Z]*\n/, ""); // strip language line
      return (
        <pre
          key={i}
          className="my-2 p-2 rounded text-xs font-mono overflow-auto whitespace-pre-wrap"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        >
          {body.trimEnd()}
        </pre>
      );
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    );
  });
}

export default function AiPanel() {
  const {
    aiProvider,
    aiKey,
    aiModel,
    setAiProvider,
    setAiKey,
    setAiModel,
    setAiEnabled,
    schema,
    dialect,
    lastRunSql,
    editorSql,
    outcome,
    aiPrompt,
    clearAiPrompt,
  } = usePlayground();

  const info = providerInfo(aiProvider);

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const hasKey = aiKey.trim().length > 0;

  // A prompt pushed from elsewhere (e.g. "Explain this JOIN" in the visualizer).
  useEffect(() => {
    if (aiPrompt && hasKey && !busy) {
      const text = aiPrompt.text;
      clearAiPrompt();
      void send(text);
    }
    // send/messages are read fresh; re-run when a new prompt arrives or a key is added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPrompt, hasKey]);

  const send = async (text: string) => {
    if (!text.trim() || busy || !hasKey) return;
    const userMsg: AiMessage = { role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    // Give the model the live query + result context alongside the last question.
    const ctx = contextBlock(lastRunSql || editorSql, outcome);
    const apiMessages: AiMessage[] = history.map((m, i) =>
      i === history.length - 1 && ctx
        ? { role: m.role, content: `${ctx}\n\n${m.content}` }
        : m
    );

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamAi(
        {
          provider: aiProvider,
          apiKey: aiKey,
          model: aiModel,
          system: buildSystemPrompt(dialect, schema),
          messages: apiMessages,
        },
        (chunk) =>
          setMessages((cur) => {
            const next = [...cur];
            next[next.length - 1] = {
              role: "assistant",
              content: next[next.length - 1].content + chunk,
            };
            return next;
          }),
        controller.signal
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const QUICK = [
    { icon: <BookOpen className="w-3.5 h-3.5" />, label: "Explain query", prompt: "Explain this query step by step, in plain language." },
    { icon: <Workflow className="w-3.5 h-3.5" />, label: "Explain JOINs", prompt: "Explain how the JOIN(s) in this query work and which rows they produce." },
    { icon: <Wrench className="w-3.5 h-3.5" />, label: "Optimize", prompt: "Suggest how to improve or optimize this query, if possible." },
  ];

  return (
    <aside
      className="w-full md:w-[360px] shrink-0 border-l bg-panel flex flex-col min-h-0 h-full"
      style={{ borderColor: "var(--border)" }}
    >
      {/* header */}
      <div
        className="flex items-center gap-2 px-3 h-9 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium">AI Tutor</span>
        <span className="text-[10px] text-muted ml-1 truncate">
          {info.models.find((m) => m.id === aiModel)?.label ?? aiModel}
        </span>
        <div className="flex-1" />
        <button className="text-muted hover:text-app" onClick={() => setShowSettings((v) => !v)} title="AI settings">
          <Settings className="w-4 h-4" />
        </button>
        <button className="text-muted hover:text-app" onClick={() => setAiEnabled(false)} title="Turn off AI">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* settings / key setup */}
      {(showSettings || !hasKey) && (
        <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <KeyRound className="w-3.5 h-3.5" /> Choose a provider and bring your own API key (stored only in this browser).
          </div>
          <select
            className="select w-full"
            value={aiProvider}
            onChange={(e) => {
              setAiProvider(e.target.value as typeof aiProvider);
              setKeyDraft("");
            }}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="password"
            className="input"
            placeholder={info.keyPlaceholder}
            value={keyDraft || aiKey}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <select className="select w-full" value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
            {info.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              className="btn btn-primary text-xs"
              onClick={() => {
                if (keyDraft.trim()) setAiKey(keyDraft.trim());
                setShowSettings(false);
              }}
            >
              Save
            </button>
            {hasKey && (
              <button
                className="btn btn-danger text-xs"
                onClick={() => {
                  setAiKey("");
                  setKeyDraft("");
                }}
              >
                Remove key
              </button>
            )}
          </div>
          <a
            className="text-[11px] text-accent hover:underline block"
            href={info.keysUrl}
            target="_blank"
            rel="noreferrer"
          >
            Get a {info.label} key →
          </a>
        </div>
      )}

      {/* quick actions */}
      {hasKey && (
        <div className="flex flex-wrap gap-1.5 p-2 border-b" style={{ borderColor: "var(--border)" }}>
          {QUICK.map((q) => (
            <button key={q.label} className="btn !py-1 !px-2 text-xs" disabled={busy} onClick={() => void send(q.prompt)}>
              {q.icon} {q.label}
            </button>
          ))}
          {outcome?.error && (
            <button
              className="btn !py-1 !px-2 text-xs"
              disabled={busy}
              onClick={() => void send("Why did this query fail, and how do I fix it?")}
            >
              <AlertCircle className="w-3.5 h-3.5 text-bad" /> Fix error
            </button>
          )}
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && hasKey && (
          <div className="text-xs text-muted leading-relaxed">
            Ask anything about SQL, or use a quick action above. I can see your current schema, query, and results.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-app" : ""}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">
              {m.role === "user" ? "You" : "AI Tutor"}
            </div>
            <div
              className="rounded-md px-2.5 py-2"
              style={{ background: m.role === "user" ? "var(--panel2)" : "transparent", border: m.role === "user" ? "1px solid var(--border)" : "none" }}
            >
              {m.content ? renderContent(m.content) : <Loader2 className="w-4 h-4 spin text-muted" />}
            </div>
          </div>
        ))}
      </div>

      {/* input */}
      {hasKey && (
        <div className="p-2 border-t flex gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Ask about your query…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button className="btn btn-primary self-end" disabled={busy || !input.trim()} onClick={() => void send(input)}>
            {busy ? <Loader2 className="w-4 h-4 spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      )}
    </aside>
  );
}
