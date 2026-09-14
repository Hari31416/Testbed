import { useChat } from "@ai-sdk/react";
import { DirectChatTransport, ToolLoopAgent } from "ai";
import {
  ArrowUp,
  Brain,
  Copy,
  FlaskConical,
  ImagePlus,
  Loader2,
  OctagonX,
  PlugZap,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { PersistedMessage } from "../lib/chats";
import type { Provider } from "../lib/db";
import { describeError } from "../lib/errors";
import { preprocessMath } from "../lib/math";
import { clientModel } from "../lib/providers";
import { testTools } from "../lib/test-tools";
import { cn } from "../lib/utils";
import { ModelSelect } from "./ModelSelect";
import { Plaque, StatusDot } from "./ui";

export interface ChatSettings {
  system: string;
  temperature: number;
  stripReasoning: boolean;
}

export interface PersistSnapshot extends ChatSettings {
  messages: PersistedMessage[];
  providerId: string | null;
  modelId: string | null;
}

type Part = Record<string, unknown> & { type?: string };
type Msg = { id: string; role: string; parts: Part[] };

const SUGGESTIONS = [
  { icon: FlaskConical, title: "Tool-call stress test", prompt: "What is 12 * 18 plus 7? Use the calculator tool, then explain the result.", tag: "calculator" },
  { icon: Wrench, title: "Multi-tool reasoning", prompt: "What is the weather in Paris and what time is it there? Use get_weather and get_datetime.", tag: "weather + time" },
  { icon: Sparkles, title: "Instruction following", prompt: "Reply with exactly three bullet points about why streaming matters for chat UX.", tag: "format" },
];

function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {preprocessMath(text)}
      </ReactMarkdown>
    </div>
  );
}

function ToolCard({ part }: { part: Part }) {
  const type = String(part.type ?? "");
  const name = type.replace(/^tool-/, "").replace(/^dynamic-/, "");
  const state = String((part as { state?: string }).state ?? "");
  const failed = /error|denied/.test(state);
  const done = (/output|available|result|done/.test(state) && !/input/.test(state)) || failed;
  const running = !done;
  const label = failed
    ? state.includes("denied")
      ? "denied"
      : "error"
    : done
      ? "done"
      : /streaming/.test(state)
        ? "calling…"
        : "called";
  const input = (part as { input?: unknown }).input;
  const output = (part as { output?: unknown }).output ?? (part as { result?: unknown }).result;
  return (
    <div className={cn("overflow-hidden rounded-xl border text-left", failed ? "border-red-600/25 bg-red-50/70" : done ? "border-emerald-600/25 bg-emerald-50/70" : "border-amber-600/25 bg-amber-50/70")}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className={cn("grid h-6 w-6 place-items-center rounded-md", failed ? "bg-red-600/15 text-red-700" : done ? "bg-emerald-600/15 text-emerald-700" : "bg-amber-600/15 text-amber-700")}>
          {running ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
        </span>
        <span className="font-mono text-xs font-semibold">{name}</span>
        <span className={cn("ml-auto font-mono text-[10px] uppercase tracking-wider", failed ? "text-red-700" : done ? "text-emerald-700" : "text-amber-700")}>
          {label}
        </span>
      </div>
      {(input !== undefined || output !== undefined) && (
        <details className="border-t border-black/[0.06] px-2.5 py-1.5">
          <summary className="cursor-pointer font-mono text-[11px] text-ink-500 hover:text-ink-950">payload</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-ink-950 p-2 font-mono text-[11px] leading-relaxed text-[#e8e2d4]">
            {JSON.stringify({ input, output }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export function ChatView({
  viewKey,
  chatId,
  provider,
  model,
  initialMessages,
  initialSettings,
  onOpenProviders,
  onModelChange,
  onPersist,
}: {
  viewKey: string;
  chatId: string | null;
  provider: Provider | null;
  model: string | null;
  initialMessages: PersistedMessage[];
  initialSettings: ChatSettings;
  onOpenProviders: () => void;
  onModelChange: (m: string) => void;
  onPersist: (viewKey: string, snap: PersistSnapshot) => void;
}) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<{ url: string; mediaType: string; name: string }[]>([]);
  const [system, setSystem] = useState(initialSettings.system);
  const [temperature, setTemperature] = useState(initialSettings.temperature);
  const [stripReasoning, setStripReasoning] = useState(initialSettings.stripReasoning);
  const [tuning, setTuning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => {
    if (!provider || !model) return null;
    const agent = new ToolLoopAgent({
      model: clientModel(provider.baseURL, provider.apiKey, model, provider.proxyPrefix, { stripReasoning }),
      instructions: system,
      temperature,
      tools: testTools,
    } as never);
    // No server here — everything runs in-browser, so surface the real
    // provider error instead of the default redacted "An error occurred."
    return new DirectChatTransport({
      agent,
      onError: (e: unknown) => {
        console.error("[testbed] chat transport error:", e);
        return describeError(e);
      },
    } as never);
  }, [provider, model, system, temperature, stripReasoning]);

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    messages: initialMessages,
    transport,
  } as never) as unknown as {
    messages: Msg[];
    sendMessage: (m: unknown, o?: unknown) => Promise<void>;
    status: string;
    error: Error | undefined;
    stop: () => void;
    regenerate: () => void;
  };

  const busy = status === "streaming" || status === "submitted";
  const ready = !!provider && !!model;

  // ---- persistence: report thread + settings upward on settle & unmount ----
  // viewKey/chatId are captured at mount so a late unmount-cleanup can never
  // write this thread into a *different* chat opened afterwards.
  // Provider/model follow the live props (header switchers).
  const mountRef = useRef({ viewKey, chatId });
  const modelRef = useRef(model);
  modelRef.current = model;
  const providerIdRef = useRef<string | null>(provider?.id ?? null);
  providerIdRef.current = provider?.id ?? null;
  const latestRef = useRef<Msg[]>(messages);
  latestRef.current = messages;
  const settingsRef = useRef({ system, temperature, stripReasoning });
  settingsRef.current = { system, temperature, stripReasoning };
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;
  const persistNow = useCallback(() => {
    const s = settingsRef.current;
    const m = mountRef.current;
    onPersistRef.current(m.viewKey, {
      messages: latestRef.current as unknown as PersistedMessage[],
      system: s.system,
      temperature: s.temperature,
      stripReasoning: s.stripReasoning,
      providerId: providerIdRef.current,
      // Model may change after mount (header switcher) — track live.
      modelId: modelRef.current,
    });
  }, []);
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    // Only persist on a real settle (busy -> idle), not on mount.
    if ((status === "ready" || status === "error") && (prev === "streaming" || prev === "submitted")) persistNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  useEffect(() => () => persistNow(), [persistNow]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy, status]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: { url: string; mediaType: string; name: string }[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ url: await fileToDataURL(f), mediaType: f.type, name: f.name });
    }
    setImages((p) => [...p, ...next].slice(0, 4));
  };

  const send = async (text?: string) => {
    const body = (text ?? input).trim();
    if ((!body && images.length === 0) || busy || !ready) return;
    const parts: unknown[] = [
      ...images.map((img) => ({ type: "file", mediaType: img.mediaType, url: img.url, filename: img.name })),
      ...(body ? [{ type: "text", text: body }] : []),
    ];
    setInput("");
    setImages([]);
    await sendMessage({ role: "user", parts } as never);
  };

  const copyText = async (id: string, parts: Part[]) => {
    const text = parts.filter((p) => p.type === "text").map((p) => String((p as { text?: string }).text ?? "")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header: provider + model live in the composer zone now */}
      <header className="z-10 border-b border-ink-200/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2.5">
          <button
            onClick={onOpenProviders}
            className="flex max-w-44 cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 py-1 pr-2.5 pl-1 text-xs font-medium text-ink-700 transition hover:border-signal-600/60 hover:text-signal-700"
            title={provider ? provider.baseURL : "Add a provider"}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-950 text-signal-500">
              <PlugZap size={11} />
            </span>
            <span className="truncate">{provider?.name ?? "Add provider"}</span>
          </button>
          <ModelSelect provider={provider} value={model} onPick={onModelChange} />
          <span className="ml-auto flex items-center gap-2">
            {busy && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-signal-700">
                <StatusDot tone="live" /> streaming
              </span>
            )}
            <button
              onClick={() => setTuning((t) => !t)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                tuning ? "border-signal-600/50 bg-signal-50 text-signal-700" : "border-ink-200 bg-white/70 text-ink-700 hover:border-ink-400",
              )}
            >
              <SlidersHorizontal size={13} /> Tune
            </button>
            {!busy && messages.length > 0 && (
              <button
                onClick={() => regenerate()}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-400"
              >
                <RotateCcw size={13} /> Retry
              </button>
            )}
            {busy && (
              <button
                onClick={stop}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
              >
                <OctagonX size={13} /> Stop
              </button>
            )}
          </span>
        </div>
        {tuning && (
          <div className="mx-auto grid max-w-3xl gap-2 px-4 pb-3 sm:grid-cols-[1fr_140px_auto]">
            <input
              value={system}
              onChange={(e) => {
                setSystem(e.target.value);
                localStorage.setItem("tune.system", e.target.value);
              }}
              placeholder="System prompt…"
              className="rounded-lg border border-ink-200 bg-white/80 px-2.5 py-1.5 text-xs outline-none focus:border-signal-600 focus:ring-2 focus:ring-signal-600/15"
            />
            <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white/80 px-2.5 py-1.5 text-xs">
              <span className="font-mono text-ink-500">temp</span>
              <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={(e) => { setTemperature(Number(e.target.value)); localStorage.setItem("tune.temperature", e.target.value); }} className="w-full accent-[#ea580c]" />
              <span className="font-mono">{temperature.toFixed(1)}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-200 bg-white/80 px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink-700" title="Drop reasoning from follow-up requests — required by strict gateways like Groq, harmless elsewhere">
              <input
                type="checkbox"
                checked={stripReasoning}
                onChange={(e) => {
                  setStripReasoning(e.target.checked);
                  localStorage.setItem("stripReasoning", e.target.checked ? "1" : "0");
                }}
                className="accent-[#ea580c]"
              />
              strip reasoning
            </label>
          </div>
        )}
      </header>

      {/* thread */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
          {messages.length === 0 && (
            <div className="animate-rise">
              <div className="dotgrid relative overflow-hidden rounded-2xl border border-ink-200 bg-white/60 px-6 py-10 text-center">
                <Plaque className="mb-2">New session{provider ? ` · ${provider.name}` : ""}</Plaque>
                <h2 className="font-display text-3xl font-medium tracking-tight text-ink-950">
                  What are we <em className="text-signal-600">probing</em> today?
                </h2>
                <p className="mx-auto mt-2 max-w-md font-mono text-xs leading-relaxed text-ink-500">
                  {!provider ? "Add a provider above to begin." : (model ?? "Pick a model above to begin.")}
                </p>
              </div>
              {ready && (
                <>
                  <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.title}
                        onClick={() => send(s.prompt)}
                        className="group cursor-pointer rounded-2xl border border-ink-200 bg-white/80 p-3.5 text-left shadow-[0_1px_0_var(--color-ink-200)] transition hover:-translate-y-0.5 hover:border-signal-600/50 hover:shadow-[0_8px_24px_-12px_var(--color-signal-600)]"
                      >
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-950 text-[#f5f1e8] transition group-hover:bg-signal-600">
                          <s.icon size={15} />
                        </span>
                        <span className="mt-2.5 block text-[13px] font-semibold">{s.title}</span>
                        <span className="mt-1 block font-mono text-[11px] text-ink-500">{s.tag}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-center font-mono text-[11px] text-ink-400">tip: attach an image + “describe this” to test vision</p>
                </>
              )}
            </div>
          )}

          {messages.map((m, mi) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex animate-rise justify-end" style={{ animationDelay: `${Math.min(mi * 20, 120)}ms` }}>
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink-950 px-4 py-2.5 text-sm leading-relaxed text-[#f5f1e8] shadow-md">
                    {m.parts.filter((p) => p.type === "file").map((p, i) => {
                      const f = p as unknown as { url?: string; filename?: string };
                      return f.url ? <img key={i} src={f.url} alt={f.filename ?? "upload"} className="mb-2 max-h-56 rounded-xl border border-white/15" /> : null;
                    })}
                    {m.parts.filter((p) => p.type === "text").map((p, i) => (
                      <div key={i} className="whitespace-pre-wrap">{String((p as { text?: string }).text ?? "")}</div>
                    ))}
                  </div>
                </div>
              );
            }
            const texts = m.parts.filter((p) => p.type === "text");
            const thinking = m.parts.filter((p) => p.type === "reasoning");
            const tools = m.parts.filter((p) => {
              const t = String(p.type ?? "");
              return t.startsWith("tool-") || t.startsWith("dynamic-tool");
            });
            const files = m.parts.filter((p) => p.type === "file");
            return (
              <div key={m.id} className="flex animate-rise gap-3" style={{ animationDelay: `${Math.min(mi * 20, 120)}ms` }}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-950 text-signal-500">
                  <Sparkles size={15} />
                </span>
                <div className="min-w-0 flex-1 space-y-2.5 rounded-2xl rounded-tl-md border border-ink-200/80 bg-white/85 px-4 py-3 shadow-[0_1px_0_var(--color-ink-200)]">
                  {thinking.map((p, i) => (
                    <details key={`r${i}`} className="rounded-xl bg-parchment/70 px-3 py-2 text-[13px] text-ink-700">
                      <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                        <Brain size={13} className="text-signal-600" /> Reasoning
                      </summary>
                      <div className="mt-1 whitespace-pre-wrap italic">{String((p as { text?: string }).text ?? "")}</div>
                    </details>
                  ))}
                  {texts.map((p, i) => (
                    <Markdown key={`t${i}`} text={String((p as { text?: string }).text ?? "")} />
                  ))}
                  {busy && mi === messages.length - 1 && texts.length === 0 && tools.length === 0 && (
                    <span className="flex items-center gap-1.5 py-1">
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-600" />
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-600 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-600 [animation-delay:300ms]" />
                    </span>
                  )}
                  {tools.map((p, i) => (
                    <ToolCard key={`o${i}`} part={p} />
                  ))}
                  {files.map((p, i) => {
                    const f = p as unknown as { url?: string; filename?: string };
                    return f.url ? <img key={i} src={f.url} alt={f.filename ?? "image"} className="max-h-56 rounded-xl border border-ink-200" /> : null;
                  })}
                  {!busy && texts.length > 0 && (
                    <button
                      onClick={() => copyText(m.id, m.parts)}
                      className="flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-400 transition hover:text-ink-950"
                    >
                      <Copy size={11} /> {copied === m.id ? "copied" : "copy"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="rounded-2xl border border-red-600/25 bg-red-50 px-4 py-3 text-sm text-red-900">
              <b>Request failed.</b>
              <div className="mt-1 whitespace-pre-wrap">{error.message}</div>
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-xs opacity-70 hover:opacity-100">raw error (for debugging the provider)</summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed text-[#e8e2d4]">
                  {String((error as { stack?: string }).stack ?? error.message)}
                </pre>
              </details>
              <span className="mt-2 block font-mono text-xs opacity-70">“Failed to fetch” = CORS/preflight block — use the proxy field in providers or another provider.</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* composer */}
      <footer className="border-t border-ink-200/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {images.length > 0 && (
            <div className="mb-2 flex gap-2">
              {images.map((img) => (
                <span key={img.url.slice(0, 48)} className="relative">
                  <img src={img.url} alt={img.name} className="h-16 w-16 rounded-xl border border-ink-200 object-cover" />
                  <button
                    onClick={() => setImages((p) => p.filter((x) => x.url !== img.url))}
                    className="absolute -top-1.5 -right-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-ink-950 text-white"
                    aria-label="Remove image"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-ink-300/70 bg-white shadow-[0_10px_36px_-16px_rgba(22,19,15,0.35)] transition focus-within:border-signal-600/60 focus-within:ring-4 focus-within:ring-signal-600/10">
            <textarea
              ref={areaRef}
              rows={1}
              value={input}
              disabled={!ready}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={!provider ? "Add a provider to start…" : !model ? "Pick a model above to start…" : `Message ${model}…`}
              className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-ink-400 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!ready}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-500 transition hover:bg-ink-950/5 hover:text-ink-950 disabled:opacity-40"
                title="Attach images"
                aria-label="Attach images"
              >
                <ImagePlus size={17} />
              </button>
              <span className="ml-1 hidden font-mono text-[11px] text-ink-400 sm:block">⏎ send · ⇧⏎ newline · 📎 vision</span>
              <span className="ml-auto flex gap-1.5">
                {busy && (
                  <button onClick={stop} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700">
                    <OctagonX size={15} /> Stop
                  </button>
                )}
                <button
                  onClick={() => send()}
                  disabled={busy || !ready || (!input.trim() && images.length === 0)}
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-signal-600 text-white shadow-[0_4px_14px_-4px_var(--color-signal-600)] transition hover:bg-signal-700 disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp size={17} strokeWidth={2.5} />
                </button>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
