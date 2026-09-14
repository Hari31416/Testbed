import { useCallback, useEffect, useState } from "react";
import { ChatView } from "./components/ChatView";
import { ModelPicker } from "./components/ModelPicker";
import { ProviderPanel } from "./components/ProviderPanel";
import { db, type Provider } from "./lib/db";

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(() => localStorage.getItem("activeProvider"));
  const [activeModel, setActiveModel] = useState<string | null>(() => localStorage.getItem("activeModel"));
  const [tick, setTick] = useState(0);

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

  return (
    <div className="flex h-screen text-sm">
      <aside className="w-80 shrink-0 space-y-6 overflow-auto border-r p-3">
        <h1 className="text-base font-bold">BYOK Model Testbed</h1>
        <ProviderPanel providers={providers} activeId={activeProviderId} onChange={setProviders} onRefresh={() => setTick((t) => t + 1)} />
        <ModelPicker
          provider={provider}
          activeModel={activeModel}
          onPick={(m) => {
            setActiveModel(m);
            localStorage.setItem("activeModel", m);
          }}
        />
        <p className="text-[11px] text-neutral-500">
          Client-only: key in IndexedDB, direct fetch to baseURL. GitHub Pages safe (static). Streaming + tools + images via Vercel AI SDK
          (DirectChatTransport, OpenAI-compatible provider).
        </p>
      </aside>
      <main className="min-w-0 flex-1">
        {provider && activeModel ? (
          <ChatView key={`${provider.id}:${activeModel}`} provider={provider} model={activeModel} />
        ) : (
          <div className="p-8 text-sm text-neutral-500">Add a provider → Test /models → Save → Refresh models → pick a model to start testing.</div>
        )}
      </main>
    </div>
  );
}
