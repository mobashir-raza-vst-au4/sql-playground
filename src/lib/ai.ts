import type { Dialect, QueryOutcome, TableMeta } from "./engine";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export type AiProvider = "anthropic" | "openai" | "google";

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  keyPlaceholder: string;
  keysUrl: string;
  models: { id: string; label: string }[];
}

export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    keyPlaceholder: "sk-ant-...",
    keysUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8 (best)" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast/cheap)" },
    ],
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    keyPlaceholder: "sk-...",
    keysUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (fast/cheap)" },
    ],
  },
  {
    id: "google",
    label: "Gemini (Google · free tier)",
    keyPlaceholder: "AQ.… or AIza…",
    keysUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-flash-latest", label: "Gemini Flash (latest, free)" },
      { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (fastest, free)" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
];

export function providerInfo(p: AiProvider): ProviderInfo {
  return AI_PROVIDERS.find((x) => x.id === p) ?? AI_PROVIDERS[0];
}

export function defaultModel(p: AiProvider): string {
  return providerInfo(p).models[0].id;
}

/** A compact text description of the current schema for the model. */
export function schemaSummary(schema: TableMeta[]): string {
  if (schema.length === 0) return "(no tables yet)";
  return schema
    .map((t) => {
      const cols = t.columns
        .map((c) => `${c.name} ${c.type}${c.pk ? " PK" : ""}${c.notNull ? " NOT NULL" : ""}`)
        .join(", ");
      return `- ${t.name} (${cols}) — ${t.rowCount} rows`;
    })
    .join("\n");
}

export function buildSystemPrompt(dialect: Dialect, schema: TableMeta[]): string {
  return `You are a friendly, expert SQL tutor embedded in an interactive SQL playground.
The user is learning SQL and running queries against a real ${dialect.toUpperCase()} database in their browser.

Current database schema:
${schemaSummary(schema)}

Guidelines:
- Be concise and clear. Prefer short paragraphs and small, correct code blocks.
- When explaining a query, walk through it step by step in plain language (what each clause does and why).
- Use ${dialect} syntax. Point out dialect-specific gotchas when relevant.
- When fixing an error, show the corrected query and briefly say what was wrong.
- Teach: mention the underlying concept (JOIN types, GROUP BY, indexes, NULL handling) when it helps understanding.
- Never invent tables or columns that aren't in the schema above.
- Format SQL in \`\`\`sql code blocks.`;
}

/** Contextual preamble appended to a user's question or quick-action. */
export function contextBlock(sql: string, outcome: QueryOutcome | null): string {
  const parts: string[] = [];
  if (sql.trim()) parts.push(`Current query:\n\`\`\`sql\n${sql.trim()}\n\`\`\``);
  if (outcome?.error) {
    parts.push(`This query produced an ERROR:\n${outcome.error.message}`);
  } else if (outcome?.ok && outcome.results.length) {
    const last = outcome.results[outcome.results.length - 1];
    if (last.columns.length) {
      parts.push(`It returned ${last.rowCount} row(s) with columns: ${last.columns.join(", ")}.`);
    } else {
      parts.push(`It ran successfully (${last.affectedRows ?? last.rowCount} row(s) affected).`);
    }
  }
  return parts.join("\n\n");
}

/** POST to the proxy route and stream tokens back via onToken. */
export async function streamAi(
  opts: {
    provider: AiProvider;
    apiKey: string;
    model: string;
    system: string;
    messages: AiMessage[];
  },
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "AI request failed");
    onToken(`\n\n⚠️ ${text}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}
