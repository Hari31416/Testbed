import { useEffect, useState } from "react";
import { db, type Provider } from "../lib/db";
import { fetchModels } from "../lib/providers";
import { cn } from "../lib/utils";

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
  const [state, setState] = useState<string>("");

  const loadCache = async () => {
    if (!provider) return;
    const cached = await db.models.where("providerId").equals(provider.id).toArray();
    if (cached.length) setModels(cached.map((c) => c.modelId).sort());
  };

  useEffect(() => {
    loadCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id]);

  const refresh = async () => {
    if (!provider) return;
    setState("loading…");
    const s = await fetchModels(provider.baseURL, provider.apiKey, provider.proxyPrefix);
    if (!s.ok) {
      setState(`${s.kind}: ${s.message}`);
      return;
    }
    setModels(s.models);
    setState(`${s.models.length} models`);
    const now = Date.now();
    await db.models.bulkPut(
      s.models.map((m) => ({ id: `${provider.id}:${m}`, providerId: provider.id, modelId: m, updatedAt: now })),
    );
  };

  const filtered = models.filter((m) => m.toLowerCase().includes(q.toLowerCase())).slice(0, 200);

  if (!provider) return <p className="text-xs text-neutral-500">Select a provider first.</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Models</h2>
        <button onClick={refresh} className="rounded border px-2 py-0.5 text-xs">Refresh</button>
      </div>
      {state && <p className="text-xs text-neutral-500">{state}</p>}
      <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Filter models…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-64 space-y-1 overflow-auto">
        {filtered.map((m) => (
          <button
            key={m}
            onClick={() => onPick(m)}
            className={cn("block w-full truncate rounded border px-2 py-1 text-left text-xs", m === activeModel ? "border-black bg-neutral-900 text-white" : "hover:bg-neutral-100")}
            title={m}
          >
            {m}
          </button>
        ))}
        {filtered.length === 0 && <p className="text-xs text-neutral-500">No models cached. Hit Refresh.</p>}
      </div>
    </div>
  );
}
