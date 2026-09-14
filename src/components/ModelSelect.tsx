import { Check, ChevronDown, Cpu, Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { db, type Provider } from "../lib/db";
import { fetchModels } from "../lib/providers";
import { cn } from "../lib/utils";
import { Field } from "./ui";

export function ModelSelect({
  provider,
  value,
  onPick,
}: {
  provider: Provider | null;
  value: string | null;
  onPick: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!provider) {
      setModels([]);
      return;
    }
    db.models
      .where("providerId")
      .equals(provider.id)
      .toArray()
      .then((cached) => setModels(cached.map((c) => c.modelId).sort()))
      .catch(() => {});
  }, [provider]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open ]);

  const sync = async () => {
    if (!provider || syncing) return;
    setSyncing(true);
    setNote("");
    const s = await fetchModels(provider.baseURL, provider.apiKey, provider.proxyPrefix);
    setSyncing(false);
    if (!s.ok) {
      setNote(`${s.kind}: ${s.message}`);
      return;
    }
    setModels(s.models);
    setNote(`${s.models.length} models synced`);
    const now = Date.now();
    await db.models.bulkPut(s.models.map((m) => ({ id: `${provider.id}:${m}`, providerId: provider.id, modelId: m, updatedAt: now })));
  };

  const filtered = models.filter((m) => m.toLowerCase().includes(q.toLowerCase())).slice(0, 250);

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!provider}
        className={cn(
          "flex max-w-64 cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs transition",
          value ? "bg-ink-950 text-[#f5f1e8] hover:bg-ink-800" : "border border-dashed border-ink-300 text-ink-500 hover:border-signal-600 hover:text-signal-700",
        )}
        title={value ?? "Pick a model"}
      >
        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", value ? "bg-signal-600 text-white" : "bg-ink-950/5")}>
          <Cpu size={11} />
        </span>
        <span className="truncate font-mono">{value ?? "Pick a model"}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>

      {open && provider && (
        <div className="absolute top-full left-0 z-30 mt-2 w-80 max-w-[80vw] animate-rise rounded-2xl border border-ink-200 bg-white p-2.5 shadow-xl">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400" />
              <Field placeholder="Filter models…" value={q} onChange={(e) => setQ(e.target.value)} className="py-1 pl-8 text-xs" aria-label="Filter models" />
            </div>
            <button
              onClick={sync}
              disabled={syncing}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-ink-200 px-2 py-1.5 font-mono text-[11px] text-ink-700 transition hover:border-ink-400 disabled:opacity-50"
              title="Sync /models from provider"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          </div>
          {note && <p className="mt-1.5 truncate px-1 font-mono text-[11px] text-ink-500" title={note}>{note}</p>}
          <div className="mt-1.5 max-h-64 space-y-0.5 overflow-auto">
            {filtered.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
                title={m}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition",
                  m === value ? "bg-signal-50 text-signal-700" : "hover:bg-ink-950/[0.04]",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{m}</span>
                {m === value && <Check size={13} className="shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
                {models.length === 0 ? "Nothing cached — hit sync." : "No match for that filter."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
