import { useChat } from "@ai-sdk/react";
import { DirectChatTransport, ToolLoopAgent } from "ai";
import {
  AlertTriangle,
  ArrowUp,
  Brain,
  Check,
  Copy,
  Download,
  FlaskConical,
  ImagePlus,
  KeyRound,
  Loader2,
  Maximize2,
  OctagonX,
  PenLine,
  PlugZap,
  RotateCcw,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { saveModelCapabilities } from "../lib/capabilities";
import type { PersistedMessage } from "../lib/chats";
import { metricsOf, type MessageMetrics } from "../lib/chats";
import { uid, type ModelCapabilities, type Provider } from "../lib/db";
import { describeError } from "../lib/errors";
import { preprocessMath } from "../lib/math";
import { clientModel, generateImage } from "../lib/providers";
import { testTools } from "../lib/test-tools";
import { cn } from "../lib/utils";
import { ModelSelect } from "./ModelSelect";
import { Plaque, StatusDot } from "./ui";

export interface ChatSettings {
  system: string;
  temperature: number;
  topP: number;
  maxTokens: number | null;
  stripReasoning: boolean;
}

export interface PersistSnapshot extends ChatSettings {
  messages: PersistedMessage[];
  providerId: string | null;
  modelId: string | null;
}

export const DEFAULT_SYSTEM = 'You are a helpful assistant. Use tools when asked.'
export const DEFAULT_TEMP = 0.7
export const DEFAULT_TOP_P = 1
export const DEFAULT_MAX_TOKENS: number | null = null
export const DEFAULT_STRIP = true

function fmtClock(at?: number): string {
  if (!at) return "";
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

function fmtSecs(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(2) : s.toFixed(1)}s`;
}

/** Rough output-token estimate (~4 chars/token) for live tok/s. */
function estTokens(parts: Part[]): number {
  let chars = 0;
  for (const p of parts) {
    if ((p.type === "text" || p.type === "reasoning") && typeof (p as { text?: unknown }).text === "string") {
      chars += ((p as { text: string }).text ?? "").length;
    }
  }
  return Math.max(1, Math.round(chars / 4));
}

function hasContent(m: Msg): boolean {
  return m.parts.some((p) => {
    const t = String(p.type ?? "");
    if (t === "text" || t === "reasoning") return String((p as { text?: string }).text ?? "").length > 0;
    return t.startsWith("tool-") || t.startsWith("dynamic-tool") || t === "file";
  });
}

type Part = Record<string, unknown> & { type?: string };
type Msg = { id: string; role: string; parts: Part[] };

const SUGGESTIONS = [
  { icon: FlaskConical, title: "Tool-call stress test", prompt: "What is 12 * 18 plus 7? Use the calculator tool, then explain the result.", tag: "calculator" },
  { icon: Wrench, title: "Multi-tool reasoning", prompt: "What is the weather in Paris and what time is it there? Use get_weather and get_datetime.", tag: "weather + time" },
  { icon: Sparkles, title: "Instruction following", prompt: "Reply with exactly three bullet points about why streaming matters for chat UX.", tag: "format" },
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function processImageFile(file: File): Promise<{ url: string; mediaType: string; name: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onerror = () => resolve({ url: dataUrl, mediaType: file.type, name: file.name });
      img.onload = () => {
        const maxDim = 2048;
        if (img.width <= maxDim && img.height <= maxDim) {
          resolve({ url: dataUrl, mediaType: file.type, name: file.name });
          return;
        }
        try {
          let w = img.width;
          let h = img.height;
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({ url: dataUrl, mediaType: file.type, name: file.name });
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
          const resized = canvas.toDataURL(mime, 0.85);
          resolve({ url: resized, mediaType: mime, name: file.name });
        } catch {
          resolve({ url: dataUrl, mediaType: file.type, name: file.name });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function Lightbox({
  url,
  filename,
  onClose,
}: {
  url: string
  filename?: string
  onClose: () => void
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/85 p-4 backdrop-blur-sm animate-fade"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div
        className="relative max-h-[95vh] max-w-[95vw] overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt={filename ?? 'Full size preview'}
          className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        />
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <a
            href={url}
            download={filename || 'generated-image.png'}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-ink-950/70 text-white backdrop-blur transition hover:bg-ink-900"
            title="Download image"
            aria-label="Download image"
          >
            <Download size={15} />
          </a>
          <button
            onClick={onClose}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-ink-950/70 text-white backdrop-blur transition hover:bg-ink-900"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ImageCard({ url, filename }: { url: string; filename?: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (url.startsWith('data:image/')) {
        const res = await fetch(url)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `image-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="group/img relative my-2 overflow-hidden rounded-2xl border border-ink-200/80 bg-ink-950/[0.03] shadow-xs transition hover:shadow-md">
      <div
        onClick={() => setLightboxOpen(true)}
        className="flex cursor-zoom-in justify-center overflow-hidden"
        title="Click to expand"
      >
        <img
          src={url}
          alt={filename ?? 'Generated image'}
          className="max-h-[520px] w-auto max-w-full rounded-xl object-contain transition duration-200 group-hover/img:scale-[1.01]"
        />
      </div>

      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-xl border border-ink-200/80 bg-white/90 p-1 shadow-md backdrop-blur-sm opacity-90 transition hover:opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100">
        <button
          onClick={handleCopy}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
          title={copied ? 'Copied' : 'Copy image'}
          aria-label="Copy image"
        >
          {copied ? <Check size={13} className="text-signal-600" /> : <Copy size={13} />}
        </button>
        <button
          onClick={handleDownload}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
          title="Download image"
          aria-label="Download image"
        >
          <Download size={13} />
        </button>
        <button
          onClick={() => setLightboxOpen(true)}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
          title="View full size"
          aria-label="View full size"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {lightboxOpen && (
        <Lightbox url={url} filename={filename} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  )
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node: _n, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
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
  onNewChat,
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
    onNewChat: () => void;
  onPersist: (viewKey: string, snap: PersistSnapshot) => void;
}) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<{ url: string; mediaType: string; name: string }[]>([]);
  const [system, setSystem] = useState(initialSettings.system);
  const [temperature, setTemperature] = useState(initialSettings.temperature);
  const [topP, setTopP] = useState(() => {
    const p = initialSettings.topP;
    return Number.isFinite(p) && p > 0 ? Math.min(1, Math.max(0.01, p)) : 1;
  });
  const [maxTokens, setMaxTokens] = useState<number | null>(initialSettings.maxTokens);
  const [stripReasoning, setStripReasoning] = useState(initialSettings.stripReasoning);
  const [tuning, setTuning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [modelCaps, setModelCaps] = useState<ModelCapabilities | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (modelCaps?.supportsVision === false && images.length > 0) {
      setImages([]);
    }
  }, [modelCaps?.supportsVision, images.length]);

  const adjustPromptHeight = useCallback(() => {
    const el = systemPromptRef.current
    if (!el) return
    el.style.height = 'auto'
    const computed = window.getComputedStyle(el)
    const lineHeight = parseFloat(computed.lineHeight) || 20
    const paddingTop = parseFloat(computed.paddingTop) || 6
    const paddingBottom = parseFloat(computed.paddingBottom) || 6
    const borderTop = parseFloat(computed.borderTopWidth) || 1
    const borderBottom = parseFloat(computed.borderBottomWidth) || 1
    const verticalPadding = paddingTop + paddingBottom + borderTop + borderBottom
    const maxHeight = lineHeight * 3 + verticalPadding
    const minHeight = lineHeight + verticalPadding
    const targetHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))
    el.style.height = `${targetHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    if (tuning) {
      const raf = requestAnimationFrame(adjustPromptHeight)
      window.addEventListener('resize', adjustPromptHeight)
      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', adjustPromptHeight)
      }
    }
  }, [tuning, system, adjustPromptHeight])

  const isModified =
    system !== DEFAULT_SYSTEM ||
    Math.abs(temperature - DEFAULT_TEMP) > 0.001 ||
    Math.abs(topP - DEFAULT_TOP_P) > 0.001 ||
    maxTokens !== DEFAULT_MAX_TOKENS ||
    stripReasoning !== DEFAULT_STRIP

  const resetToDefaults = useCallback(() => {
    setSystem(DEFAULT_SYSTEM)
    setTemperature(DEFAULT_TEMP)
    setTopP(DEFAULT_TOP_P)
    setMaxTokens(DEFAULT_MAX_TOKENS)
    setStripReasoning(DEFAULT_STRIP)
    localStorage.setItem('tune.system', DEFAULT_SYSTEM)
    localStorage.setItem('tune.temperature', String(DEFAULT_TEMP))
    localStorage.setItem('tune.topP', String(DEFAULT_TOP_P))
    localStorage.setItem('tune.maxTokens', '')
    localStorage.setItem('stripReasoning', DEFAULT_STRIP ? '1' : '0')
  }, [])

  // Per-message lab metrics (timestamps, TTFT, tok/s). Seeded from history,
  // merged into message metadata on persist.
  const metaRef = useRef(new Map<string, MessageMetrics>());
  const [, setMetaTick] = useState(0);
  const bumpMeta = useCallback(() => setMetaTick((t) => t + 1), []);
  const setMeta = useCallback(
    (id: string, patch: MessageMetrics) => {
      metaRef.current.set(id, { ...metaRef.current.get(id), ...patch });
      bumpMeta();
    },
    [bumpMeta],
  );
  const metaFor = useCallback(
    (m: { id: string; metadata?: unknown }): MessageMetrics => ({
      ...metricsOf({ metadata: m.metadata } as PersistedMessage),
      ...metaRef.current.get(m.id),
    }),
    [],
  );
  useEffect(() => {
    for (const m of initialMessages) {
      const saved = metricsOf(m);
      if (Object.keys(saved).length) metaRef.current.set(m.id, saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active turn timing refs.
  const turnRef = useRef({ active: false, wall: 0, perf: 0, firstTokenAt: 0 });
  const [, setTick] = useState(0);

  const transport = useMemo(() => {
    if (!provider || !model) return null;
    const safeTopP = Number.isFinite(topP) && topP > 0 ? Math.min(1, Math.max(0.01, topP)) : 1;
    const agent = new ToolLoopAgent({
      model: clientModel(provider.baseURL, provider.apiKey, model, provider.proxyPrefix, { stripReasoning }),
      instructions: system,
      temperature,
      topP: safeTopP,
      maxOutputTokens: maxTokens ?? undefined,
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
  }, [provider, model, system, temperature, topP, maxTokens, stripReasoning]);

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    messages: initialMessages,
    transport,
  } as never) as unknown as {
    messages: Msg[];
    sendMessage: (m: unknown, o?: unknown) => Promise<void>;
    status: string;
    error: Error | undefined;
    stop: () => void;
    setMessages: (updater: Msg[] | ((prev: Msg[]) => Msg[])) => void;
  };

  const busy = status === "streaming" || status === "submitted" || generatingImage;
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
  const settingsRef = useRef({ system, temperature, topP, maxTokens, stripReasoning });
  settingsRef.current = { system, temperature, topP, maxTokens, stripReasoning };
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;
  const persistNow = useCallback(() => {
    const s = settingsRef.current;
    const m = mountRef.current;
    onPersistRef.current(m.viewKey, {
      messages: latestRef.current.map((msg) => {
        const meta = metaRef.current.get(msg.id);
        if (!meta || !Object.keys(meta).length) return msg as unknown as PersistedMessage;
        return { ...msg, metadata: { ...((msg as { metadata?: object }).metadata ?? {}), testbed: meta } } as unknown as PersistedMessage;
      }),
      system: s.system,
      temperature: s.temperature,
      topP: s.topP,
      maxTokens: s.maxTokens,
      stripReasoning: s.stripReasoning,
      providerId: providerIdRef.current,
      // Model may change after mount (header switcher) — track live.
      modelId: modelRef.current,
    });
  }, []);
  const prevStatusRef = useRef(status);

  // Turn metrics engine: timestamps, TTFT, tok/s, total. Runs before the
  // persist below so settled numbers are stored in the same write.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const settling = (status === "ready" || status === "error") && (prev === "streaming" || prev === "submitted");

    // A fresh turn may begin without send() (regenerate): pick it up.
    if (!turnRef.current.active && (status === "submitted" || status === "streaming")) {
      const last = messages[messages.length - 1];
      if (last && last.role === "user") {
        turnRef.current = { active: true, wall: Date.now(), perf: performance.now(), firstTokenAt: 0 };
      }
    }
    const t = turnRef.current;
    if (t.active) {
      const last = messages[messages.length - 1];
      if (last && last.role === "user" && !metaRef.current.get(last.id)?.at) {
        setMeta(last.id, { at: t.wall });
      }
      const asst = [...messages].reverse().find((m) => m.role === "assistant");
      if (asst && !t.firstTokenAt && hasContent(asst)) {
        t.firstTokenAt = performance.now();
        setMeta(asst.id, { at: Date.now(), ttftMs: t.firstTokenAt - t.perf });
      }
      if (settling && asst) {
        const now = performance.now();
        const totalMs = now - t.perf;
        const ttftMs = t.firstTokenAt ? t.firstTokenAt - t.perf : totalMs;
        const est = estTokens(asst.parts);
        const decodeMs = Math.max(1, totalMs - ttftMs);
        setMeta(asst.id, {
          at: metaRef.current.get(asst.id)?.at ?? Date.now(),
          ttftMs,
          totalMs,
          estTokens: est,
          tpsEst: Math.round((est / (decodeMs / 1000)) * 10) / 10,
        });
        t.active = false;
      } else if (settling) {
        t.active = false;
      }
    }
    // Only persist on a real settle (busy -> idle), not on mount.
    if (settling) persistNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status]);
  useEffect(() => () => persistNow(), [persistNow]);

  // Live elapsed ticker while a response is in flight.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((x) => x + 1), 150);
    return () => clearInterval(id);
  }, [busy]);
  const elapsedSecs = busy && turnRef.current.wall ? (Date.now() - turnRef.current.wall) / 1000 : 0;

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
    if (modelCaps?.supportsVision === false) {
      setFileError("The selected model does not support image input.");
      return;
    }
    setFileError(null);
    const next: { url: string; mediaType: string; name: string }[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const item = await processImageFile(f);
        next.push(item);
      } catch (e) {
        setFileError(e instanceof Error ? e.message : String(e));
      }
    }
    setImages((p) => [...p, ...next].slice(0, 4));
  };

  const send = async (text?: string) => {
    const body = (text ?? input).trim();
    if ((!body && images.length === 0) || busy || !ready) return;

    if (modelCaps?.supportsImageGen) {
      if (!body || !provider || !model) return;
      const userMsg: Msg = {
        id: uid(),
        role: "user",
        parts: [{ type: "text", text: body }],
      };
      setInput("");
      setGeneratingImage(true);
      setFileError(null);
      setMessages((prev) => {
        const updated = [...prev, userMsg];
        latestRef.current = updated;
        return updated;
      });
      try {
        const res = await generateImage(
          provider.baseURL,
          provider.apiKey,
          model,
          body,
          provider.proxyPrefix,
        );
        const assistantMsg: Msg = {
          id: uid(),
          role: "assistant",
          parts: [
            {
              type: "file",
              url: res.url,
              filename: "generated.png",
            },
            ...(res.revisedPrompt ? [{ type: "text", text: res.revisedPrompt }] : []),
          ],
        };
        setMessages((prev) => {
          const updated = [...prev, assistantMsg];
          latestRef.current = updated;
          return updated;
        });
        persistNow();
      } catch (e) {
        const errMsg: Msg = {
          id: uid(),
          role: "assistant",
          parts: [
            {
              type: "text",
              text: `Image generation failed: ${e instanceof Error ? e.message : String(e)}`,
              isImageGenError: true,
              prompt: body,
            },
          ],
        };
        setMessages((prev) => {
          const updated = [...prev, errMsg];
          latestRef.current = updated;
          return updated;
        });
        persistNow();
      } finally {
        setGeneratingImage(false);
      }
      return;
    }

    if (modelCaps?.supportsVision === false && images.length > 0) {
      setFileError("The selected model does not support image input. Please remove attached images.");
      return;
    }

    turnRef.current = { active: true, wall: Date.now(), perf: performance.now(), firstTokenAt: 0 };
    const parts: unknown[] = [
      ...images.map((img) => ({ type: "file", mediaType: img.mediaType, url: img.url, filename: img.name })),
      ...(body ? [{ type: "text", text: body }] : []),
    ];
    setInput("");
    setImages([]);
    await sendMessage({ role: "user", parts } as never);
  };

  const disableImageGenForCurrentModel = async (retryPrompt?: string) => {
    if (!provider || !model) return;
    const newCaps: ModelCapabilities = {
      supportsVision: modelCaps?.supportsVision ?? true,
      supportsImageGen: false,
      isReasoning: modelCaps?.isReasoning ?? false,
      customizedByUser: true,
    };
    await saveModelCapabilities(provider.id, model, newCaps);
    setModelCaps(newCaps);

    if (retryPrompt) {
      setMessages((prev) => {
        const cleaned = prev.filter(
          (m) =>
            !m.parts.some(
              (p) =>
                (p as { isImageGenError?: boolean }).isImageGenError ||
                (typeof (p as { text?: string }).text === "string" &&
                  (p as { text: string }).text.startsWith("Image generation failed:")),
            ),
        );
        latestRef.current = cleaned;
        return cleaned;
      });
      setTimeout(() => {
        send(retryPrompt);
      }, 50);
    }
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

  const needsKey = Boolean(
    provider &&
    !provider.apiKey &&
    !provider.baseURL.includes("localhost") &&
    !provider.baseURL.includes("127.0.0.1")
  );

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
          {needsKey && (
            <button
              onClick={onOpenProviders}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-amber-500/40 bg-amber-50 px-2 py-1 font-mono text-[10px] font-medium text-amber-800 transition hover:bg-amber-100"
              title="No API key set for this session — click to provide"
            >
              <KeyRound size={11} className="text-amber-600" />
              <span>Set key</span>
            </button>
          )}
          <ModelSelect
            provider={provider}
            value={model}
            onPick={onModelChange}
            onCapabilitiesChange={setModelCaps}
          />
          <span className="ml-auto flex items-center gap-2">
            {busy && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-signal-700">
                <StatusDot tone="live" /> {generatingImage ? "generating" : "streaming"}
              </span>
            )}
            <button
              onClick={() => setTuning((t) => !t)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                tuning ? 'border-signal-600/50 bg-signal-50 text-signal-700' : 'border-ink-200 bg-white/70 text-ink-700 hover:border-ink-400',
              )}
            >
              <SlidersHorizontal size={13} />
              <span>Tune</span>
              {isModified && (
                <span className="h-1.5 w-1.5 rounded-full bg-signal-600" title="Custom parameters active" />
              )}
            </button>
            {!busy && (
              <button
                onClick={onNewChat}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-400"
              >
                <PenLine size={13} /> New chat
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
          <div className="mx-auto max-w-3xl px-4 pb-3 animate-rise">
            <div className="rounded-xl border border-ink-200/90 bg-white/85 p-3.5 shadow-xs backdrop-blur-xs">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                    Model Parameters & Instructions
                  </span>
                  {isModified && (
                    <span className="inline-flex items-center rounded-full bg-signal-100 px-2 py-0.5 font-mono text-[10px] font-medium text-signal-700">
                      customized
                    </span>
                  )}
                </div>
                {isModified && (
                  <button
                    type="button"
                    onClick={resetToDefaults}
                    className="flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-500 transition hover:text-signal-700"
                    title="Reset all settings to defaults"
                  >
                    <RotateCcw size={11} /> Reset defaults
                  </button>
                )}
              </div>

              {/* system prompt */}
              <div className="mb-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-ink-500">system prompt</span>
                  {system !== DEFAULT_SYSTEM && (
                    <button
                      type="button"
                      onClick={() => {
                        setSystem(DEFAULT_SYSTEM)
                        localStorage.setItem('tune.system', DEFAULT_SYSTEM)
                        adjustPromptHeight()
                      }}
                      className="cursor-pointer font-mono text-[10px] text-ink-400 transition hover:text-signal-700"
                      title="Revert system prompt to default"
                    >
                      revert default
                    </button>
                  )}
                </div>
                <textarea
                  ref={systemPromptRef}
                  rows={1}
                  value={system}
                  onChange={(e) => {
                    setSystem(e.target.value)
                    localStorage.setItem('tune.system', e.target.value)
                    adjustPromptHeight()
                  }}
                  placeholder="You are a helpful assistant…"
                  className="w-full resize-none rounded-lg border border-ink-200 bg-white/90 px-2.5 py-1.5 font-mono text-xs leading-5 text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-signal-600 focus:ring-2 focus:ring-signal-600/15"
                />
              </div>

              {/* parameter controls */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {/* Temperature */}
                <div className="flex flex-col justify-between rounded-lg border border-ink-200 bg-white/70 p-2.5 transition hover:border-ink-300 hover:bg-white">
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-ink-500" title="Controls randomness: lower is more deterministic, higher is more creative">
                      temperature
                    </span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-950">
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setTemperature(val)
                      localStorage.setItem('tune.temperature', String(val))
                    }}
                    className="my-1.5 w-full cursor-pointer accent-signal-600"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-ink-400">
                    <button
                      type="button"
                      onClick={() => {
                        setTemperature(0.2)
                        localStorage.setItem('tune.temperature', '0.2')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', Math.abs(temperature - 0.2) < 0.05 && 'font-semibold text-signal-700')}
                    >
                      0.2 precise
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTemperature(0.7)
                        localStorage.setItem('tune.temperature', '0.7')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', Math.abs(temperature - 0.7) < 0.05 && 'font-semibold text-signal-700')}
                    >
                      0.7 def
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTemperature(1.2)
                        localStorage.setItem('tune.temperature', '1.2')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', Math.abs(temperature - 1.2) < 0.05 && 'font-semibold text-signal-700')}
                    >
                      1.2 creative
                    </button>
                  </div>
                </div>

                {/* Top-P */}
                <div className="flex flex-col justify-between rounded-lg border border-ink-200 bg-white/70 p-2.5 transition hover:border-ink-300 hover:bg-white">
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-ink-500" title="Nucleus sampling: lower values focus on likely tokens">
                      top-p
                    </span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-950">
                      {topP.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={topP}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setTopP(val)
                      localStorage.setItem('tune.topP', String(val))
                    }}
                    className="my-1.5 w-full cursor-pointer accent-signal-600"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-ink-400">
                    <button
                      type="button"
                      onClick={() => {
                        setTopP(0.5)
                        localStorage.setItem('tune.topP', '0.5')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', Math.abs(topP - 0.5) < 0.02 && 'font-semibold text-signal-700')}
                    >
                      0.50 focus
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopP(0.9)
                        localStorage.setItem('tune.topP', '0.9')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', Math.abs(topP - 0.9) < 0.02 && 'font-semibold text-signal-700')}
                    >
                      0.90
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopP(1.0)
                        localStorage.setItem('tune.topP', '1')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', Math.abs(topP - 1.0) < 0.02 && 'font-semibold text-signal-700')}
                    >
                      1.00 def
                    </button>
                  </div>
                </div>

                {/* Max Tokens */}
                <div className="flex flex-col justify-between rounded-lg border border-ink-200 bg-white/70 p-2.5 transition hover:border-ink-300 hover:bg-white">
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-ink-500" title="Cap on response length: empty means provider default">
                      max tokens
                    </span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-950">
                      {maxTokens ? maxTokens.toLocaleString() : '∞'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    placeholder="∞ (provider default)"
                    value={maxTokens ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value) || 0)) || null
                      setMaxTokens(v)
                      localStorage.setItem('tune.maxTokens', v == null ? '' : String(v))
                    }}
                    className="my-1 w-full rounded border border-ink-200 bg-white px-2 py-0.5 font-mono text-xs outline-none transition placeholder:text-ink-400 focus:border-signal-600 focus:ring-1 focus:ring-signal-600/15"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-ink-400">
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTokens(null)
                        localStorage.setItem('tune.maxTokens', '')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', maxTokens === null && 'font-semibold text-signal-700')}
                    >
                      ∞
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTokens(1024)
                        localStorage.setItem('tune.maxTokens', '1024')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', maxTokens === 1024 && 'font-semibold text-signal-700')}
                    >
                      1k
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTokens(4096)
                        localStorage.setItem('tune.maxTokens', '4096')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', maxTokens === 4096 && 'font-semibold text-signal-700')}
                    >
                      4k
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTokens(8192)
                        localStorage.setItem('tune.maxTokens', '8192')
                      }}
                      className={cn('cursor-pointer transition hover:text-ink-950', maxTokens === 8192 && 'font-semibold text-signal-700')}
                    >
                      8k
                    </button>
                  </div>
                </div>

                {/* Strip Reasoning */}
                <div
                  onClick={() => {
                    const next = !stripReasoning
                    setStripReasoning(next)
                    localStorage.setItem('stripReasoning', next ? '1' : '0')
                  }}
                  className="flex cursor-pointer flex-col justify-between rounded-lg border border-ink-200 bg-white/70 p-2.5 transition hover:border-ink-300 hover:bg-white select-none"
                  title="Drop reasoning/thinking tags from follow-up requests — required by strict gateways like Groq"
                >
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-ink-500">strip reasoning</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        stripReasoning ? 'bg-signal-100 text-signal-700' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      {stripReasoning ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="my-1.5 flex items-center justify-between">
                    <span className="text-xs text-ink-700">Drop thoughts</span>
                    <div
                      className={cn(
                        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200',
                        stripReasoning ? 'bg-signal-600' : 'bg-ink-300',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200',
                          stripReasoning ? 'translate-x-3.5' : 'translate-x-0.5',
                        )}
                      />
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-ink-400">for Groq & strict APIs</div>
                </div>
              </div>
            </div>
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
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/80 px-3 py-1 font-mono text-[11px] text-ink-600 shadow-xs">
                    <ShieldCheck size={13} className="text-signal-600" />
                    <span>No server required · 100% client-side</span>
                  </span>
                </div>
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
            const umeta = metaFor(m);
            if (m.role === "user") {
              const userTexts = m.parts.filter((p) => p.type === 'text')
              return (
                <div key={m.id} className="flex animate-rise justify-end" style={{ animationDelay: `${Math.min(mi * 20, 120)}ms` }}>
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink-950 px-4 py-2.5 text-sm leading-relaxed text-[#f5f1e8] shadow-md">
                    {m.parts.filter((p) => p.type === "file").map((p, i) => {
                      const f = p as unknown as { url?: string; filename?: string };
                      return f.url ? <ImageCard key={i} url={f.url} filename={f.filename ?? "upload"} /> : null;
                    })}
                    {userTexts.map((p, i) => (
                      <div key={i} className="whitespace-pre-wrap">{String((p as { text?: string }).text ?? '')}</div>
                    ))}
                    {(userTexts.length > 0 || umeta.at) && (
                      <div className="mt-1 flex items-center gap-3 font-mono text-[#f5f1e8]/50">
                        {userTexts.length > 0 && (
                          <button
                            onClick={() => copyText(m.id, m.parts)}
                            className="flex cursor-pointer items-center gap-1 text-[11px] transition hover:text-[#f5f1e8]"
                          >
                            <Copy size={11} /> {copied === m.id ? 'copied' : 'copy'}
                          </button>
                        )}
                        {umeta.at && (
                          <span className="ml-auto text-[10px]">{fmtClock(umeta.at)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            }
            const texts = m.parts.filter((p) => p.type === "text");
            const thinking = m.parts.filter((p) => p.type === "reasoning");
            const tools = m.parts.filter((p) => {
              const t = String(p.type ?? "");
              return t.startsWith("tool-") || t.startsWith("dynamic-tool");
            });
            const files = m.parts.filter((p) => p.type === "file");
            const ameta = metaFor(m);
            const metricBits = [
              ameta.ttftMs != null ? `TTFT ${fmtSecs(ameta.ttftMs)}` : "",
              ameta.tpsEst != null ? `~${ameta.tpsEst} tok/s` : "",
              ameta.totalMs != null ? `total ${fmtSecs(ameta.totalMs)}` : "",
            ].filter(Boolean);
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
                  {texts.map((p, i) => {
                    const textContent = String((p as { text?: string }).text ?? "");
                    const isImgGenError =
                      (p as { isImageGenError?: boolean }).isImageGenError ||
                      textContent.startsWith("Image generation failed:");
                    const lastUserMsg = messages
                      .slice(0, mi)
                      .reverse()
                      .find((x) => x.role === "user");
                    const userTextPart = lastUserMsg?.parts.find((x) => x.type === "text") as
                      | { text?: string }
                      | undefined;
                    const nearestPrompt =
                      (p as { prompt?: string }).prompt || userTextPart?.text;

                    if (isImgGenError) {
                      return (
                        <div
                          key={`t${i}`}
                          className="my-1 space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-ink-900"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-500/20 text-amber-800">
                              <AlertTriangle size={14} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-amber-950">
                                Image generation endpoint failed (404 / unsupported)
                              </p>
                              <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink-600 break-words">
                                {textContent}
                              </p>
                              <p className="mt-2 text-ink-700">
                                This provider does not support the OpenAI <code>/images/generations</code> endpoint for this model. If this is a conversational chat model, turn off Image Generation to use standard chat.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              onClick={() => disableImageGenForCurrentModel(nearestPrompt)}
                              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-signal-600 px-3 py-1.5 font-medium text-white shadow-xs transition hover:bg-signal-700"
                            >
                              <RotateCcw size={12} />
                              <span>Turn off Image Gen & Retry as Chat</span>
                            </button>
                            <button
                              onClick={() => disableImageGenForCurrentModel()}
                              className="flex cursor-pointer items-center gap-1 rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 font-medium text-ink-700 transition hover:bg-ink-100"
                            >
                              <Sliders size={12} />
                              <span>Turn off Image Gen only</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return <Markdown key={`t${i}`} text={textContent} />;
                  })}
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
                    return f.url ? <ImageCard key={i} url={f.url} filename={f.filename ?? "generated-image.png"} /> : null;
                  })}
                  {!busy && (texts.length > 0 || files.length > 0) && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => copyText(m.id, m.parts)}
                        className="flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-400 transition hover:text-ink-950"
                      >
                        <Copy size={11} /> {copied === m.id ? "copied" : "copy"}
                      </button>
                      <span className="ml-auto font-mono text-[10px] text-ink-400">
                        {[fmtClock(ameta.at), ...metricBits].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                  {busy && (fmtClock(ameta.at) || metricBits.length > 0) && (
                    <div className="font-mono text-[10px] text-ink-400">
                      {[fmtClock(ameta.at), ...metricBits].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* No assistant message yet for this turn: show the system working */}
          {busy && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
            <div className="flex animate-rise gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-950 text-signal-500">
                {generatingImage || status === "submitted" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              </span>
              <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-ink-200/80 bg-white/85 px-4 py-3 text-sm text-ink-500 shadow-[0_1px_0_var(--color-ink-200)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-600" />
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-600 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-600 [animation-delay:300ms]" />
                </span>
                {generatingImage
                  ? `Generating image with ${model ?? "model"}…`
                  : status === "submitted"
                    ? `Contacting ${model ?? "model"}…`
                    : "Receiving…"}
                <span className="font-mono text-[11px] text-signal-700">{elapsedSecs.toFixed(1)}s</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-600/25 bg-red-50 px-4 py-3 text-sm text-red-900">
              <b>Request failed.</b>
              <div className="mt-1 whitespace-pre-wrap font-mono text-xs">{describeError(error)}</div>
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-xs opacity-70 hover:opacity-100">raw error (for debugging the provider)</summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed text-[#e8e2d4]">
                  {String((error as { stack?: string }).stack ?? error.message)}
                </pre>
              </details>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* composer */}
      <footer className="border-t border-ink-200/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {fileError && (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-red-500/25 bg-red-50/90 px-3 py-1.5 text-xs text-red-900">
              <span>{fileError}</span>
              <button
                onClick={() => setFileError(null)}
                className="ml-2 cursor-pointer font-mono text-xs opacity-70 hover:opacity-100"
                aria-label="Dismiss error"
              >
                <X size={13} />
              </button>
            </div>
          )}
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
              placeholder={
                !provider
                  ? "Add a provider to start…"
                  : !model
                    ? "Pick a model above to start…"
                    : needsKey
                      ? `Enter session API key for ${provider.name} (click 'Set key' above)…`
                      : modelCaps?.supportsImageGen
                        ? `Describe an image to generate with ${model}…`
                        : `Message ${model}…`
              }
              className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-ink-400 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!ready || modelCaps?.supportsVision === false || modelCaps?.supportsImageGen === true}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition",
                  modelCaps?.supportsVision === false || modelCaps?.supportsImageGen === true
                    ? "opacity-30 cursor-not-allowed"
                    : "cursor-pointer hover:bg-ink-950/5 hover:text-ink-950 disabled:opacity-40"
                )}
                title={
                  modelCaps?.supportsImageGen
                    ? "Image generation model (text prompt only)"
                    : modelCaps?.supportsVision === false
                      ? "This model does not support image input"
                      : "Attach images"
                }
                aria-label="Attach images"
              >
                <ImagePlus size={17} />
              </button>
              <span className="ml-1 hidden font-mono text-[11px] text-ink-400 sm:block">⏎ send · ⇧⏎ newline</span>
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
