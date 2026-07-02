import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AiRequest {
  provider?: "anthropic" | "openai" | "google";
  apiKey: string;
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

function friendlyError(
  provider: string | undefined,
  status: number | undefined,
  apiMsg: string
): string {
  if (status === 401 || /api key not valid|api_key_invalid|invalid api key/i.test(apiMsg))
    return "Invalid API key. Check it in AI settings.";

  const detail = apiMsg ? ` Provider said: "${apiMsg}"` : "";

  if (status === 404 && provider === "google")
    return `That Gemini model isn't available to your key.${detail}. Try the other Gemini model in AI settings.`;

  if (status === 429 || /resource_exhausted|insufficient_quota|credit balance|billing|quota/i.test(apiMsg)) {
    if (provider === "google")
      return (
        `Gemini free-tier limit hit (rate limit or daily cap).${detail}. ` +
        `Wait ~30–60s and retry. If it keeps failing, the free tier may not be available in your region — you'd then need to enable billing in Google AI Studio.`
      );
    return `Your account is out of credits/quota. Add billing, then try again.${detail}`;
  }

  return (apiMsg || "AI request failed.") + (status ? ` (HTTP ${status})` : "");
}

// Streams a Claude response back as plain text.
async function streamAnthropic(
  body: AiRequest,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  const client = new Anthropic({ apiKey: body.apiKey });
  try {
    const s = client.messages.stream({
      model: body.model || "claude-opus-4-8",
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: body.system,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    s.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
    await s.finalMessage();
  } catch (e) {
    const err = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
    const msg = friendlyError("anthropic", err.status, err.error?.error?.message || err.message || "");
    controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`));
  }
}

// Streams an OpenAI (ChatGPT) response by parsing its SSE chat-completions stream.
async function streamOpenAI(
  body: AiRequest,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  const messages = [
    ...(body.system ? [{ role: "system", content: body.system }] : []),
    ...body.messages,
  ];
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${body.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: body.model || "gpt-4o-mini", stream: true, messages }),
    });
  } catch {
    controller.enqueue(encoder.encode("\n\n⚠️ Couldn't reach OpenAI."));
    return;
  }

  if (!res.ok || !res.body) {
    let apiMsg = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      apiMsg = j.error?.message || "";
    } catch {
      /* ignore */
    }
    controller.enqueue(encoder.encode(`\n\n⚠️ ${friendlyError("openai", res.status, apiMsg)}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the trailing partial line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) controller.enqueue(encoder.encode(delta));
      } catch {
        /* skip keep-alive / non-JSON lines */
      }
    }
  }
}

// Streams a Google Gemini response by parsing its SSE stream (alt=sse).
async function streamGoogle(
  body: AiRequest,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  const model = body.model || "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  const payload = {
    ...(body.system ? { systemInstruction: { parts: [{ text: body.system }] } } : {}),
    // Gemini uses roles "user" and "model" (not "assistant").
    contents: body.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Works for both the new AQ.-format keys and legacy AIza keys.
        "X-goog-api-key": body.apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    controller.enqueue(encoder.encode("\n\n⚠️ Couldn't reach Google Gemini."));
    return;
  }

  if (!res.ok || !res.body) {
    let apiMsg = "";
    try {
      const j = (await res.json()) as { error?: { message?: string; status?: string } };
      apiMsg = j.error?.message || j.error?.status || "";
    } catch {
      /* ignore */
    }
    controller.enqueue(encoder.encode(`\n\n⚠️ ${friendlyError("google", res.status, apiMsg)}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(data) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) if (part.text) controller.enqueue(encoder.encode(part.text));
      } catch {
        /* skip non-JSON lines */
      }
    }
  }
}

export async function POST(req: Request) {
  let body: AiRequest;
  try {
    body = (await req.json()) as AiRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body.apiKey) return new Response("Missing API key", { status: 400 });
  if (!body.messages?.length) return new Response("No messages", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      if (body.provider === "openai") {
        await streamOpenAI(body, controller, encoder);
      } else if (body.provider === "google") {
        await streamGoogle(body, controller, encoder);
      } else {
        await streamAnthropic(body, controller, encoder);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
