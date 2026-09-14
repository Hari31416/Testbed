import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, FlaskConical, Loader2, PlugZap, Trash2 } from "lucide-react";
import { db, uid, type Provider } from "../lib/db";
import { fetchModels, normalizeBaseURL, PRESETS, type ConnectionStatus } from "../lib/providers";
import { cn } from "../lib/utils";
import { Btn, DarkField, Plaque, StatusDot } from "./ui";

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
  const [showKey, setShowKey] = useState(false);
  const [proxyPrefix, setProxyPrefix] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.providers.toArray().then(onChange).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    localStorage.setItem("activeProvider", p.id);
    onChange(await db.providers.toArray());
    onRefresh();
  };

  const remove = async (id: string) => {
    await db.providers.delete(id);
    await db.models.where("providerId").equals(id).delete();
    onChange(await db.providers.toArray());
    onRefresh();
  };

  return (
    <section className="space-y-3">
      <Plaque tone="dark">Providers · BYOK client-only</Plaque>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setName(p.name);
              setBaseURL(p.baseURL);
              setStatus(null);
            }}
            className="cursor-pointer rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-ink-300 transition hover:border-signal-500/50 hover:text-white"
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <DarkField placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Provider name" />
        <DarkField
          placeholder="Base URL — https://…/v1"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          spellCheck={false}
          className="font-mono text-xs"
          aria-label="Base URL"
        />
        <div className="relative">
          <DarkField
            placeholder="API key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            spellCheck={false}
            className="pr-9 font-mono text-xs"
            aria-label="API key"
          />
          <button
            onClick={() => setShowKey((s) => !s)}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-ink-400 hover:text-white"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {advanced && (
          <DarkField
            placeholder="Proxy prefix (CORS fallback, optional)"
            value={proxyPrefix}
            onChange={(e) => setProxyPrefix(e.target.value)}
            spellCheck={false}
            className="font-mono text-xs"
            aria-label="Proxy prefix"
          />
        )}
        <div className="flex items-center gap-2 pt-0.5">
          <Btn size="sm" variant="primary" onClick={test} disabled={busy || !baseURL.trim()}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
            {busy ? "Probing…" : "Test"}
          </Btn>
          <Btn
            size="sm"
            onClick={save}
            disabled={!baseURL.trim()}
            className="border-white/10 bg-white/[0.07] text-[#ece7db] hover:border-white/25 hover:bg-white/[0.12]"
          >
            Save
          </Btn>
          <button
            onClick={() => setAdvanced((a) => !a)}
            className="ml-auto cursor-pointer font-mono text-[11px] text-ink-400 hover:text-white"
          >
            {advanced ? "− proxy" : "+ proxy"}
          </button>
        </div>
        {status && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs leading-snug",
              status.ok
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/25 bg-red-400/10 text-red-200",
            )}
          >
            <span className="mt-0.5">
              <StatusDot tone={status.ok ? "green" : "red"} />
            </span>
            {status.ok ? (
              <span>
                <b>{status.models.length} models</b> reachable. Save, then pick one below.
              </span>
            ) : (
              <span>
                <b className="font-mono uppercase">{status.kind}</b> — {status.message}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {providers.map((p) => {
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              className={cn(
                "group flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition",
                active
                  ? "border-signal-500/60 bg-signal-500/[0.12]"
                  : "border-white/[0.07] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
              )}
              onClick={() => {
                localStorage.setItem("activeProvider", p.id);
                onRefresh();
              }}
            >
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", active ? "bg-signal-600 text-white" : "bg-white/[0.07] text-ink-300")}>
                <PlugZap size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#ece7db]">
                  {p.name}
                  {active && <Check size={13} className="text-signal-500" />}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-400">{p.baseURL}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(p.id);
                }}
                className="cursor-pointer rounded p-1 text-ink-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-300"
                aria-label={`Delete ${p.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {providers.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-ink-400">
            No providers yet — add OpenRouter or Groq above.
          </p>
        )}
      </div>
    </section>
  );
}
