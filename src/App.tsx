import { FlaskConical, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChatView } from "./components/ChatView";
import { ModelPicker } from "./components/ModelPicker";
import { ProviderPanel } from "./components/ProviderPanel";
import { db, type Provider } from "./lib/db";
import { cn } from "./lib/utils";

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(() => localStorage.getItem("activeProvider"));
  const [activeModel, setActiveModel] = useState<string | null>(() => localStorage.getItem("activeModel"));
  const [tick, setTick] = useState(0);
  const [drawer, setDrawer] = useState(false);

  const reload = useCallback(async () => {
    const all = await db.providers.toArray();
    setProviders(all);
    const stored = localStorage.getItem("activeProvider");
    if (stored && all.some((p) => p.id === stored)) setActiveProviderId(stored);
    else if (all.length) {
      setActiveProviderId(all[0].id);
      localStorage.setItem("activeProvider", all[0].id);
    } else setActiveProviderId(null);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, tick]);

  const provider = providers.find((p) => p.id === activeProviderId) ?? null;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-signal-600 text-white shadow-[0_4px_16px_-4px_var(--color-signal-600)]">
          <FlaskConical size={17} />
        </span>
        <span>
          <span className="block font-display text-[19px] leading-none font-semibold tracking-tight text-[#f2ede1]">
            Testbed
          </span>
          <span className="mt-0.5 block font-mono text-[10px] tracking-[0.16em] text-ink-400 uppercase">BYOK · client-only</span>
        </span>
      </div>

      <ProviderPanel providers={providers} activeId={activeProviderId} onChange={setProviders} onRefresh={() => setTick((t) => t + 1)} />

      <div className="h-px bg-white/[0.08]" />

      <ModelPicker
        provider={provider}
        activeModel={activeModel}
        onPick={(m) => {
          setActiveModel(m);
          localStorage.setItem("activeModel", m);
          setDrawer(false);
        }}
      />

      <p className="mt-auto font-mono text-[10px] leading-relaxed text-ink-500">
        Keys live in IndexedDB. Requests go straight to the baseURL — nothing passes through our servers. Static-safe for GitHub Pages.
      </p>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-[320px] shrink-0 bg-ink-950 md:block">{sidebar}</aside>

      {/* mobile drawer */}
      <div className={cn("fixed inset-0 z-40 md:hidden", drawer ? "block" : "hidden")}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
        <aside className="absolute inset-y-0 left-0 w-[320px] max-w-[85vw] bg-ink-950 shadow-2xl">{sidebar}</aside>
      </div>

      <main className="relative min-w-0 flex-1">
        <button
          onClick={() => setDrawer(true)}
          className="absolute top-3 left-3 z-20 grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-ink-200 bg-white/90 shadow-sm md:hidden"
          aria-label="Open providers"
        >
          <PanelLeft size={16} />
        </button>
        {provider && activeModel ? (
          <ChatView key={`${provider.id}:${activeModel}`} provider={provider} model={activeModel} />
        ) : (
          <div className="dotgrid grid h-full place-items-center p-6">
            <div className="max-w-md rounded-2xl border border-ink-200 bg-white/85 p-8 text-center shadow-sm">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-ink-950 text-signal-500">
                <FlaskConical size={19} />
              </span>
              <h1 className="mt-4 font-display text-3xl font-medium tracking-tight">
                Plug in a provider, <em className="text-signal-600">pick a model.</em>
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                Add an OpenAI-compatible base URL + key{drawer ? "" : " in the left panel"}, sync <span className="font-mono text-xs">/models</span>, and
                start probing streaming, tools and vision.
              </p>
              <button
                onClick={() => setDrawer(true)}
                className="mt-5 cursor-pointer rounded-xl bg-ink-950 px-4 py-2 text-sm font-medium text-white md:hidden"
              >
                Open providers
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
