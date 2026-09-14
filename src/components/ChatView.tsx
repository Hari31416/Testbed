import { useChat } from "@ai-sdk/react";
import { DirectChatTransport, ToolLoopAgent } from "ai";
import { useMemo, useRef, useState } from "react";
import type { Provider } from "../lib/db";
import { clientModel } from "../lib/providers";
import { testTools } from "../lib/test-tools";

function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export function ChatView({ provider, model }: { provider: Provider; model: string }) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<{ url: string; mediaType: string; name: string }[]>([]);
  const [system, setSystem] = useState("You are a helpful assistant. Use tools when asked.");
  const [temperature, setTemperature] = useState(0.7);
  const fileRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(() => {
    const agent = new ToolLoopAgent({
      model: clientModel(provider.baseURL, provider.apiKey, model, provider.proxyPrefix),
      instructions: system,
      temperature,
      tools: testTools,
    } as never);
    return new DirectChatTransport({ agent } as never);
  }, [provider.baseURL, provider.apiKey, provider.proxyPrefix, model, system, temperature]);

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport,
  } as never) as unknown as {
    messages: { id: string; role: string; parts: Record<string, unknown>[] }[];
    sendMessage: (m: unknown, o?: unknown) => Promise<void>;
    status: string;
    error: Error | undefined;
    stop: () => void;
    regenerate: () => void;
  };

  const busy = status === "streaming" || status === "submitted";

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: { url: string; mediaType: string; name: string }[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ url: await fileToDataURL(f), mediaType: f.type, name: f.name });
    }
    setImages((p) => [...p, ...next].slice(0, 4));
  };

  const send = async () => {
    if (!input.trim() && images.length === 0) return;
    const parts: unknown[] = [
      ...images.map((img) => ({ type: "file", mediaType: img.mediaType, url: img.url, filename: img.name })),
      ...(input.trim() ? [{ type: "text", text: input }] : []),
    ];
    setInput("");
    setImages([]);
    await sendMessage({ role: "user", parts } as never);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-2 text-xs">
        <span className="rounded bg-neutral-900 px-2 py-0.5 text-white">{model}</span>
        <input className="min-w-52 flex-1 rounded border px-2 py-1" value={system} onChange={(e) => setSystem(e.target.value)} placeholder="System prompt" />
        <label className="flex items-center gap-1">
          temp
          <input type="number" step={0.1} min={0} max={2} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-16 rounded border px-1 py-0.5" />
        </label>
        {busy ? (
          <button onClick={stop} className="rounded bg-red-600 px-2 py-1 text-white">Stop</button>
        ) : (
          <button onClick={() => regenerate()} className="rounded border px-2 py-1">Regenerate</button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {messages.length === 0 && (
          <div className="text-sm text-neutral-500">
            <p className="font-medium text-neutral-800">Model test checklist</p>
            <ol className="list-decimal pl-5">
              <li>Ask “What is 12 * 18? Use the calculator tool.” → expect a tool call card.</li>
              <li>Ask “Weather in Paris?” → expect get_weather output.</li>
              <li>Attach an image + “Describe this.” → expect vision to work (model-dependent).</li>
            </ol>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-neutral-900 p-2 text-sm text-white" : "max-w-[95%] rounded-lg border p-2 text-sm"}>
            <div className="mb-1 text-[11px] opacity-60">{m.role}</div>
            <div className="space-y-1">
              {(m.parts ?? []).map((p, i) => {
                const t = String((p as { type?: string }).type ?? "");
                if (t === "text") return <div key={i} className="whitespace-pre-wrap">{String((p as { text?: string }).text ?? "")}</div>;
                if (t === "file") {
                  const f = p as { url?: string; filename?: string };
                  return f.url?.startsWith("data:image") ? (
                    <img key={i} src={f.url} alt={f.filename ?? "upload"} className="max-h-48 rounded" />
                  ) : (
                    <div key={i} className="text-xs">file: {f.filename}</div>
                  );
                }
                if (t.startsWith("tool-") || t.startsWith("dynamic-tool")) {
                  return (
                    <details key={i} className="rounded bg-neutral-100 p-1 text-xs text-black" open>
                      <summary className="cursor-pointer font-medium">🔧 {t} — {String((p as { state?: string }).state ?? "")}</summary>
                      <pre className="overflow-auto">{JSON.stringify(p, null, 2)}</pre>
                    </details>
                  );
                }
                if (t === "reasoning") return <div key={i} className="text-xs italic opacity-70">{String((p as { text?: string }).text ?? "")}</div>;
                return <pre key={i} className="overflow-auto text-xs">{JSON.stringify(p).slice(0, 500)}</pre>;
              })}
            </div>
          </div>
        ))}
        {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-xs">Error: {error.message}</div>}
      </div>

      <div className="space-y-2 border-t p-2">
        {images.length > 0 && (
          <div className="flex gap-2">
            {images.map((img) => (
              <img key={img.url.slice(0, 32)} src={img.url} alt={img.name} className="h-14 w-14 rounded border object-cover" />
            ))}
            <button className="text-xs" onClick={() => setImages([])}>clear</button>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="rounded border px-2 text-sm" title="Attach images">📎</button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            placeholder={`Message ${model}… (try: use calculator for 12*18)`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button onClick={send} disabled={busy} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
