import { useEffect, useState } from "react";
import { Cpu, Loader2, RefreshCw, Search } from "lucide-react";
import { db, type Provider } from "../lib/db";
import { fetchModels } from "../lib/providers";
import { cn } from "../lib/utils";
import { DarkField, Plaque } from "./ui";

export function ModelPicker({
  provider,
  activeModel,
  onPick,
}: {
  provider: Provider | null;
  activeModel: string | null;
  onPick: (m: string) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!provider) {
      setModels([]);
      return;
    }
    db.models.where("providerId").equals(provider.id).toArray().then((cached) => {
      if (cached.length) setModels(cached.map((c) => c.modelId).sort());
      else setModels([]);
    });
  }, [provider]);

  const refresh = async () => {
    if (!provider) return;
    setState("loading");
    setNote("");
    const s = await fetchModels(provider.baseURL, provider.apiKey, provider.proxyPrefix);
    if (!s.ok) {
      setState("error");
      setNote(`${s.kind}: ${s.message}`);
      return;
    }
    setState("idle");
    setNote(`${s.models.length} models · just synced`);
    setModels(s.models);
    const now = Date.now();
    await db.models.bulkPut(
      s.models.map((m) => ({ id: `${provider.id}:${m}`, providerId: provider.id, modelId: m, updatedAt: now })),
    );
  };

  const filtered = models.filter((m) => m.toLowerCase().includes(q.toLowerCase())).slice(0, 250);

  if (!provider) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Plaque tone="dark">
          Models{models.length > 0 && <span className="text-signal-500"> · {models.length}</span>}
        </Plaque>
        <button
          onClick={refresh}
          disabled={state === "loading"}
          className="flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-400 transition hover:text-white disabled:opacity-50"
        >
          {state === "loading" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Sync
        </button>
      </div>
      {note && <p className="truncate font-mono text-[11px] text-ink-400" title={note}>{note}</p>}
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-500" />
        <DarkField placeholder="Filter models…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" aria-label="Filter models" />
      </div>
      <div className="max-h-72 space-y-1 overflow-auto pr-0.5">
        {filtered.map((m) => {
          const active = m === activeModel;
          return (
            <button
              key={m}
              onClick={() => onPick(m)}
              title={m}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition",
                active
                  ? "border-signal-500/60 bg-signal-500/[0.14]"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.05]",
              )}
            >
              <Cpu size={13} className={cn("shrink-0", active ? "text-signal-500" : "text-ink-500")} />
              <span className={cn("truncate font-mono text-xs", active ? "text-white" : "text-ink-300")}>{m}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-ink-400">
            {models.length === 0 ? "Nothing cached — hit Sync." : "No match for that filter."}
          </p>
        )}
      </div>
    </section>
  );
}
