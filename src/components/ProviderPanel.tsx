import { useEffect, useState } from "react";
import { db, uid, type Provider } from "../lib/db";
import { fetchModels, normalizeBaseURL, PRESETS, type ConnectionStatus } from "../lib/providers";
import { cn } from "../lib/utils";

export function ProviderPanel({
  providers,
  activeId,
  onChange,
  onRefresh,
}: {
  providers: Provider[];
  activeId: string | null;
  onChange: (p: Provider[]) => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState("OpenRouter");
  const [baseURL, setBaseURL] = useState("https://openrouter.ai/api/v1");
  const [apiKey, setApiKey] = useState("");
  const [proxyPrefix, setProxyPrefix] = useState("");
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const all = await db.providers.toArray();
    onChange(all);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const test = async () => {
    setBusy(true);
    setStatus(null);
    const s = await fetchModels(baseURL, apiKey, proxyPrefix || undefined);
    setStatus(s);
    setBusy(false);
  };

  const save = async () => {
    const p: Provider = {
      id: uid(),
      name: name || normalizeBaseURL(baseURL),
      baseURL: normalizeBaseURL(baseURL),
      apiKey,
      proxyPrefix: proxyPrefix || undefined,
      createdAt: Date.now(),
    };
    await db.providers.put(p);
    await load();
    onRefresh();
  };

  const remove = async (id: string) => {
    await db.providers.delete(id);
    await db.models.where("providerId").equals(id).delete();
    await load();
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Providers (BYOK, client-only)</h2>
        <p className="text-xs text-neutral-500">Key stays in IndexedDB, requests go direct to baseURL.</p>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="rounded-full border px-2 py-0.5 text-xs hover:bg-neutral-100"
            onClick={() => {
              setName(p.name);
              setBaseURL(p.baseURL);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Base URL (…/v1)" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
        <input className="w-full rounded border px-2 py-1 text-sm" placeholder="API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Proxy prefix (optional, for CORS fallback)" value={proxyPrefix} onChange={(e) => setProxyPrefix(e.target.value)} />
        <div className="flex gap-2">
          <button disabled={busy} onClick={test} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50">
            {busy ? "Testing…" : "Test /models"}
          </button>
          <button onClick={save} className="rounded border px-3 py-1 text-sm">Save</button>
        </div>
        {status && (
          <div className={cn("rounded border p-2 text-xs", status.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}>
            {status.ok ? (
              <span>OK — {status.models.length} models found. Save, then pick below.</span>
            ) : (
              <span>
                <b>{status.kind}</b>: {status.message}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1">
        {providers.map((p) => (
          <div key={p.id} className={cn("flex items-center justify-between rounded border px-2 py-1 text-sm", p.id === activeId && "border-black bg-neutral-50")}>
            <button className="truncate text-left" onClick={() => { localStorage.setItem("activeProvider", p.id); onRefresh(); }}>
              <span className="font-medium">{p.name}</span>
              <span className="block truncate text-xs text-neutral-500">{p.baseURL}</span>
            </button>
            <button className="text-xs text-red-600" onClick={() => remove(p.id)}>del</button>
          </div>
        ))}
        {providers.length === 0 && <p className="text-xs text-neutral-500">No providers yet. Add OpenRouter/Groq above.</p>}
      </div>
    </div>
  );
}
