import { AlertTriangle, Check, Eye, EyeOff, FlaskConical, KeyRound, Loader2, PlugZap, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { db, uid, type Provider } from "../lib/db";
import {
  fetchModels,
  getSessionKey,
  isInsecureRemoteHttp,
  normalizeBaseURL,
  PRESETS,
  removeSessionKey,
  resolveProviderKey,
  setSessionKey,
  type ConnectionStatus,
} from "../lib/providers";
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
  const [rememberKey, setRememberKey] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionInput, setSessionInput] = useState("");
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
    const id = uid();
    const trimmedKey = apiKey.trim();
    const p: Provider = {
      id,
      name: name.trim() || normalizeBaseURL(baseURL),
      baseURL: normalizeBaseURL(baseURL),
      apiKey: rememberKey ? trimmedKey : "",
      proxyPrefix: proxyPrefix.trim() || undefined,
      createdAt: Date.now(),
    };
    await db.providers.put(p);
    if (!rememberKey && trimmedKey) {
      setSessionKey(id, trimmedKey);
    }
    onSelect(p.id);
    onChanged();
    setShowForm(false);
    setApiKey("");
  };

  const remove = async (id: string) => {
    await db.providers.delete(id);
    await db.models.where("providerId").equals(id).delete();
    removeSessionKey(id);
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Providers">
      <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg animate-rise overflow-auto rounded-2xl border border-ink-200 bg-paper p-5 shadow-2xl dark:border-ink-800 dark:bg-ink-900 dark:text-[#ede7db]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-signal-500 dark:bg-ink-800">
            <PlugZap size={17} />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink-950 dark:text-[#f4efe6]">Providers</h2>
            <p className="font-mono text-[11px] text-ink-500 dark:text-ink-400">Direct browser calls · Session memory by default</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-500 hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {providers.map((p) => {
            const active = p.id === activeId;
            const effectiveKey = resolveProviderKey(p);
            const isPersisted = Boolean(p.isPersisted);
            const hasSession = Boolean(getSessionKey(p.id));
            const isLocal = p.baseURL.includes("localhost") || p.baseURL.includes("127.0.0.1");
            return (
              <div
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  onClose();
                }}
                className={cn(
                  "group flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition",
                  active
                    ? "border-signal-600/60 bg-signal-50 dark:border-signal-500/60 dark:bg-signal-950/50"
                    : "border-ink-200 bg-white/80 hover:border-ink-400 dark:border-ink-800 dark:bg-ink-950/60 dark:hover:border-ink-700",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", active ? "bg-signal-600 text-white" : "bg-ink-950 text-[#f5f1e8] dark:bg-ink-800")}>
                    <PlugZap size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-950 dark:text-[#ede7db]">
                      {p.name}
                      {active && <Check size={14} className="text-signal-600 dark:text-signal-400" />}
                      {isPersisted ? (
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                          saved on device
                        </span>
                      ) : hasSession ? (
                        <span className="rounded bg-signal-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-signal-700 dark:bg-signal-950/50 dark:text-signal-400">
                          session only
                        </span>
                      ) : !effectiveKey && !isLocal ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          no key
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-500 dark:text-ink-400">{p.baseURL}</span>
                  </span>
                  {!effectiveKey && !isLocal && editingSessionId !== p.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSessionId(p.id);
                        setSessionInput("");
                      }}
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-signal-600/40 bg-white px-2 py-1 font-mono text-[11px] text-signal-700 transition hover:bg-signal-50 dark:border-signal-500/40 dark:bg-ink-900 dark:text-signal-400 dark:hover:bg-signal-950/40"
                      title="Provide API key for current session"
                    >
                      <KeyRound size={11} /> set key
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                    className="cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:text-ink-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {editingSessionId === p.id && (
                  <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                    <Field
                      type="password"
                      placeholder="Paste session API key"
                      value={sessionInput}
                      onChange={(e) => setSessionInput(e.target.value)}
                      className="py-1 font-mono text-xs"
                      autoFocus
                    />
                    <Btn
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        if (sessionInput.trim()) {
                          setSessionKey(p.id, sessionInput.trim());
                          setEditingSessionId(null);
                          setSessionInput("");
                          onChanged();
                        }
                      }}
                    >
                      Save
                    </Btn>
                    <button
                      onClick={() => setEditingSessionId(null)}
                      className="cursor-pointer px-1.5 text-xs text-ink-500 hover:text-ink-950 dark:text-ink-400 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showForm ? (
          <div className="mt-4 space-y-2.5 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-950/60">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setName(p.name);
                    setBaseURL(p.baseURL);
                    setStatus(null);
                  }}
                  className="cursor-pointer rounded-full border border-ink-200 px-2.5 py-1 font-mono text-[11px] text-ink-700 transition hover:border-signal-600/60 hover:text-signal-700 dark:border-ink-800 dark:text-ink-300 dark:hover:border-signal-500/60 dark:hover:text-signal-400"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <Field placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Provider name" />
            <Field placeholder="Base URL — https://…/v1" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} spellCheck={false} className="font-mono text-xs" aria-label="Base URL" />
            {isInsecureRemoteHttp(baseURL) && (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  <b>Security risk:</b> Remote HTTP transmits API keys and messages unencrypted. Use HTTPS for remote gateways.
                </span>
              </div>
            )}
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
              <button onClick={() => setShowKey((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-ink-400 hover:text-ink-950 dark:text-ink-500 dark:hover:text-[#ede7db]" aria-label={showKey ? "Hide key" : "Show key"}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="space-y-1 rounded-lg border border-ink-200/60 bg-white/50 p-2.5 dark:border-ink-800 dark:bg-ink-900/50">
              <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-ink-700 dark:text-ink-300">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="accent-signal-600"
                />
                <span>Persist key in browser storage (IndexedDB)</span>
              </label>
              <p className="font-mono text-[10px] text-ink-500 dark:text-ink-400">
                {rememberKey
                  ? "Key will be saved unencrypted in browser storage across restarts."
                  : "Session only (default): Key lives in temporary memory and is purged on tab close."}
              </p>
            </div>
            <Field placeholder="Proxy prefix — CORS fallback, optional" value={proxyPrefix} onChange={(e) => setProxyPrefix(e.target.value)} spellCheck={false} className="font-mono text-xs" aria-label="Proxy prefix" />
            {proxyPrefix.trim() !== "" && (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  <b>Proxy warning:</b> All requests (including your API key and prompts) pass through this proxy. Only use a proxy you control and trust.
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="primary" onClick={test} disabled={busy || !baseURL.trim()}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                {busy ? "Probing…" : "Test /models"}
              </Btn>
              <Btn size="sm" variant="ink" onClick={save} disabled={!baseURL.trim()}>
                Save provider
              </Btn>
              {providers.length > 0 && (
                <button onClick={() => setShowForm(false)} className="ml-auto cursor-pointer text-xs text-ink-500 hover:text-ink-950 dark:text-ink-400 dark:hover:text-white">
                  Cancel
                </button>
              )}
            </div>
            {status && (
              <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug", status.ok ? "border-emerald-600/25 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-red-600/25 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200")}>
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
