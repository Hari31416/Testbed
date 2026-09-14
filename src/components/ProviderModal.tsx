import { Check, Eye, EyeOff, FlaskConical, Loader2, PlugZap, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { db, uid, type Provider } from "../lib/db";
import { fetchModels, normalizeBaseURL, PRESETS, type ConnectionStatus } from "../lib/providers";
import { cn } from "../lib/utils";
import { Btn, Field, StatusDot } from "./ui";

export function ProviderModal({
  providers,
  activeId,
  onSelect,
  onChanged,
  onClose,
}: {
  providers: Provider[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("OpenRouter");
  const [baseURL, setBaseURL] = useState("https://openrouter.ai/api/v1");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [proxyPrefix, setProxyPrefix] = useState("");
  const [showForm, setShowForm] = useState(providers.length === 0);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    setStatus(null);
    setStatus(await fetchModels(baseURL, apiKey, proxyPrefix || undefined));
    setBusy(false);
  };

  const save = async () => {
    const p: Provider = {
      id: uid(),
      name: name.trim() || normalizeBaseURL(baseURL),
      baseURL: normalizeBaseURL(baseURL),
      apiKey,
      proxyPrefix: proxyPrefix.trim() || undefined,
      createdAt: Date.now(),
    };
    await db.providers.put(p);
    onSelect(p.id);
    onChanged();
    setShowForm(false);
  };

  const remove = async (id: string) => {
    await db.providers.delete(id);
    await db.models.where("providerId").equals(id).delete();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Providers">
      <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg animate-rise overflow-auto rounded-2xl border border-ink-200 bg-paper p-5 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-signal-500">
            <PlugZap size={17} />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold tracking-tight">Providers</h2>
            <p className="font-mono text-[11px] text-ink-500">Direct browser calls · Keys stay in IndexedDB</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-500 hover:bg-ink-950/5 hover:text-ink-950" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {providers.map((p) => {
            const active = p.id === activeId;
            return (
              <div
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  onClose();
                }}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  active ? "border-signal-600/60 bg-signal-50" : "border-ink-200 bg-white/80 hover:border-ink-400",
                )}
              >
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", active ? "bg-signal-600 text-white" : "bg-ink-950 text-[#f5f1e8]")}>
                  <PlugZap size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {p.name}
                    {active && <Check size={14} className="text-signal-600" />}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-ink-500">{p.baseURL}</span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(p.id);
                  }}
                  className="cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>

        {showForm ? (
          <div className="mt-4 space-y-2.5 rounded-2xl border border-ink-200 bg-white/70 p-4">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setName(p.name);
                    setBaseURL(p.baseURL);
                    setStatus(null);
                  }}
                  className="cursor-pointer rounded-full border border-ink-200 px-2.5 py-1 font-mono text-[11px] text-ink-700 transition hover:border-signal-600/60 hover:text-signal-700"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <Field placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Provider name" />
            <Field placeholder="Base URL — https://…/v1" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} spellCheck={false} className="font-mono text-xs" aria-label="Base URL" />
            <div className="relative">
              <Field
                placeholder="API key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                spellCheck={false}
                className="pr-9 font-mono text-xs"
                aria-label="API key"
              />
              <button onClick={() => setShowKey((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-ink-400 hover:text-ink-950" aria-label={showKey ? "Hide key" : "Show key"}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Field placeholder="Proxy prefix — CORS fallback, optional" value={proxyPrefix} onChange={(e) => setProxyPrefix(e.target.value)} spellCheck={false} className="font-mono text-xs" aria-label="Proxy prefix" />
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="primary" onClick={test} disabled={busy || !baseURL.trim()}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                {busy ? "Probing…" : "Test /models"}
              </Btn>
              <Btn size="sm" variant="ink" onClick={save} disabled={!baseURL.trim()}>
                Save provider
              </Btn>
              {providers.length > 0 && (
                <button onClick={() => setShowForm(false)} className="ml-auto cursor-pointer text-xs text-ink-500 hover:text-ink-950">
                  Cancel
                </button>
              )}
            </div>
            {status && (
              <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug", status.ok ? "border-emerald-600/25 bg-emerald-50 text-emerald-900" : "border-red-600/25 bg-red-50 text-red-900")}>
                <span className="mt-0.5">
                  <StatusDot tone={status.ok ? "green" : "red"} />
                </span>
                {status.ok ? <span><b>{status.models.length} models</b> reachable — save, then pick one in the composer.</span> : <span><b className="font-mono uppercase">{status.kind}</b> — {status.message}</span>}
              </div>
            )}
          </div>
        ) : (
          <Btn size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Add provider
          </Btn>
        )}
      </div>
    </div>
  );
}
