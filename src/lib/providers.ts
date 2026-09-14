import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";

export type ConnectionStatus =
  | { ok: true; models: string[] }
  | { ok: false; kind: "cors" | "auth" | "not-found" | "network" | "unknown"; message: string };

export function normalizeBaseURL(v: string) {
  return v.trim().replace(/\/+$/, "");
}

function withProxy(baseURL: string, proxyPrefix?: string) {
  if (!proxyPrefix) return baseURL;
  const p = proxyPrefix.trim();
  if (!p) return baseURL;
  return `${p.replace(/\/+$/, "")}/${baseURL.replace(/^https?:\/\//, "")}`;
}

/** GET {baseURL}/models with CORS-vs-auth diagnosis. */
export async function fetchModels(
  baseURL: string,
  apiKey: string,
  proxyPrefix?: string,
): Promise<ConnectionStatus> {
  const base = normalizeBaseURL(baseURL);
  const url = `${withProxy(base, proxyPrefix)}/models`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  } catch (e) {
    // TypeError: Failed to fetch == CORS preflight fail OR offline OR wrong host
    return {
      ok: false,
      kind: "cors",
      message: `Could not reach ${url} from the browser. Likely CORS/preflight blocked, wrong host, or offline. (${e instanceof Error ? e.message : String(e)})`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    // NOTE: some gateways strip ACAO on errors, but if we got a status
    // the preflight succeeded — this is a real auth error.
    return { ok: false, kind: "auth", message: `Auth failed (${res.status}). Check API key.` };
  }
  if (res.status === 404) {
    return { ok: false, kind: "not-found", message: `404 from ${url}. Check baseURL (expect …/v1, no /chat/completions).` };
  }
  if (!res.ok) {
    return { ok: false, kind: "unknown", message: `HTTP ${res.status} from ${url}: ${await res.text().catch(() => "")}` };
  }
  const json = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  const models = Array.isArray(json?.data) ? json.data.map((m) => m.id).filter(Boolean) : [];
  return { ok: true, models };
}

/** Build a client-only OpenAI-compatible model (BYOK, direct from browser). */
export function clientModel(
  baseURL: string,
  apiKey: string,
  modelId: string,
  proxyPrefix?: string,
  opts?: { stripReasoning?: boolean },
) {
  // Minimal headers on purpose: extra x-* headers break preflight on some providers (e.g. Gemini).
  const provider = createOpenAICompatible({
    name: "custom",
    baseURL: withProxy(normalizeBaseURL(baseURL), proxyPrefix),
    apiKey,
  });
  const model = provider.chatModel(modelId);
  // Strict gateways (notably Groq) reject `reasoning_content` on *input*,
  // which the provider replays into follow-up requests of a tool loop even
  // though it sends that same field in responses. Strip reasoning parts from
  // the request prompt so multi-step tool calls survive. Display is
  // unaffected — the live step still streams reasoning to the UI.
  if (opts?.stripReasoning === false) return model;
  return wrapLanguageModel({ model, middleware: stripReasoningMiddleware });
}

const stripReasoningMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    const prompt = params.prompt as unknown as Array<Record<string, unknown>>;
    if (!Array.isArray(prompt)) return params;
    const cleaned = prompt.map((m) => {
      if (m?.role !== "assistant" || !Array.isArray(m.content)) return m;
      return {
        ...m,
        content: (m.content as Array<Record<string, unknown>>).filter((p) => p?.type !== "reasoning"),
      };
    });
    return { ...params, prompt: cleaned as unknown as typeof params.prompt };
  },
};

export const PRESETS: { name: string; baseURL: string }[] = [
  { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1" },
  { name: "Groq", baseURL: "https://api.groq.com/openai/v1" },
  { name: "Ollama (local)", baseURL: "http://localhost:11434/v1" },
  { name: "LM Studio (local)", baseURL: "http://localhost:1234/v1" },
];
