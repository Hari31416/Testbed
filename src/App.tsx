import { PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatHistory } from "./components/ChatHistory";
import { ChatView, type ChatSettings, type PersistSnapshot } from "./components/ChatView";
import { ProviderModal } from "./components/ProviderModal";
import { createChat, deleteChat, listChats, loadMessages, replaceMessages, updateChat, type PersistedMessage } from "./lib/chats";
import { db, type Chat, type Provider } from "./lib/db";
import { cn } from "./lib/utils";

const DEFAULT_SYSTEM = "You are a helpful assistant. Use tools when asked.";
const defaultSettings = (): ChatSettings => {
  const temp = Number(localStorage.getItem("tune.temperature"));
  return {
    system: localStorage.getItem("tune.system") || DEFAULT_SYSTEM,
    temperature: Number.isFinite(temp) ? Math.min(2, Math.max(0, temp)) : 0.7,
    stripReasoning: localStorage.getItem("stripReasoning") !== "0",
  };
};

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar") === "0");

  // Current view (one conversation on screen). viewKey remounts ChatView
  // when switching conversations; draft->created keeps the same key.
  const [viewKey, setViewKey] = useState("draft");
  const [viewChatId, setViewChatId] = useState<string | null>(null);
  const [viewMessages, setViewMessages] = useState<PersistedMessage[]>([]);
  const [viewSettings, setViewSettings] = useState<ChatSettings>(defaultSettings);
  const [viewProviderId, setViewProviderId] = useState<string | null>(() => localStorage.getItem("activeProvider"));
  const [viewModel, setViewModel] = useState<string | null>(() => localStorage.getItem("activeModel"));
  const [viewReady, setViewReady] = useState(false);

  // Ref mirrors so callbacks always see current values.
  const viewKeyRef = useRef("draft");
  const viewProviderIdRef = useRef<string | null>(localStorage.getItem("activeProvider"));
  const chatByViewRef = useRef(new Map<string, string>());

  const refreshProviders = useCallback(async () => {
    const all = await db.providers.toArray();
    setProviders(all);
    return all;
  }, []);

  const refreshChats = useCallback(async () => {
    setChats(await listChats());
  }, []);

  // Initial load: providers, chats, then restore last-open conversation.
  useEffect(() => {
    (async () => {
      const all = await refreshProviders();
      await refreshChats();
      const lastId = localStorage.getItem("activeChat");
      if (lastId) {
        const chat = await db.chats.get(lastId);
        if (chat) {
          chatByViewRef.current.set(chat.id, chat.id);
          viewKeyRef.current = chat.id;
          setViewChatId(chat.id);
          viewProviderIdRef.current = chat.providerId;
          setViewProviderId(chat.providerId);
          setViewModel(chat.modelId);
          setViewMessages(await loadMessages(chat.id));
          setViewSettings({
            system: chat.systemPrompt ?? DEFAULT_SYSTEM,
            temperature: chat.temperature ?? 0.7,
            stripReasoning: chat.stripReasoning ?? localStorage.getItem("stripReasoning") !== "0",
          });
          setViewKey(chat.id);
          localStorage.setItem("activeProvider", chat.providerId);
          if (chat.modelId) localStorage.setItem("activeModel", chat.modelId);
          setViewReady(true);
          return;
        }
      }
      // Draft: keep last-used provider/model (or first provider as fallback).
      if (!localStorage.getItem("activeProvider") && all.length) {
        viewProviderIdRef.current = all[0].id;
        setViewProviderId(all[0].id);
        localStorage.setItem("activeProvider", all[0].id);
      }
      setViewReady(true);
    })();
  }, [refreshProviders, refreshChats]);

  const openChat = useCallback(
    async (id: string) => {
      const chat = await db.chats.get(id);
      if (!chat) return;
      setViewReady(false);
      viewProviderIdRef.current = chat.providerId;
      chatByViewRef.current.set(chat.id, chat.id);
      viewKeyRef.current = chat.id;
      setViewChatId(chat.id);
      setViewProviderId(chat.providerId);
      setViewModel(chat.modelId);
      setViewMessages(await loadMessages(chat.id));
      setViewSettings({
        system: chat.systemPrompt ?? DEFAULT_SYSTEM,
        temperature: chat.temperature ?? 0.7,
        stripReasoning: chat.stripReasoning ?? true,
      });
      localStorage.setItem("activeChat", chat.id);
      localStorage.setItem("activeProvider", chat.providerId);
      if (chat.modelId) localStorage.setItem("activeModel", chat.modelId);
      setViewKey(chat.id);
      setViewReady(true);
    },
    [],
  );

  const newChat = useCallback(() => {
    const key = `draft-${Date.now()}`;
    viewKeyRef.current = key;
    setViewChatId(null);
    setViewMessages([]);
    setViewSettings(defaultSettings());
    localStorage.removeItem("activeChat");
    setViewKey(key);
    setViewReady(true);
  }, []);

  const onPersist = useCallback(
    async (persistKey: string, snap: PersistSnapshot) => {
      const settings = {
        systemPrompt: snap.system,
        temperature: snap.temperature,
        stripReasoning: snap.stripReasoning,
      };
      let id = chatByViewRef.current.get(persistKey) ?? null;
      if (!snap.messages.length) {
        // Settings-only persist (no thread yet) — nothing to store for drafts.
        if (id) {
          await updateChat(id, settings);
          refreshChats();
        }
        return;
      }
      if (!id) {
        const chat = await createChat({
          providerId: snap.providerId ?? "",
          modelId: snap.modelId ?? "",
          ...settings,
        });
        chatByViewRef.current.set(persistKey, chat.id);
        id = chat.id;
      }
      await replaceMessages(id, snap.messages);
      await updateChat(id, {
        providerId: snap.providerId ?? "",
        modelId: snap.modelId ?? "",
        ...settings,
      });
      // Highlight the row if this view is still on screen.
      if (persistKey === viewKeyRef.current) {
        setViewChatId(id);
        localStorage.setItem("activeChat", id);
      }
      refreshChats();
    },
    [refreshChats],
  );

  const onModelChange = useCallback(
    async (m: string) => {
      setViewModel(m);
      localStorage.setItem("activeModel", m);
      const id = chatByViewRef.current.get(viewKeyRef.current);
      if (id) {
        await updateChat(id, { modelId: m });
        refreshChats();
      }
    },
    [refreshChats],
  );

  const onSelectProvider = useCallback(
    async (id: string) => {
      // A provider switch always forks a fresh chat: model IDs, tool
      // behavior and history belong to the old provider. Tune prefs carry
      // over (they live in localStorage via the composer).
      if (id === viewProviderIdRef.current) return;
      viewProviderIdRef.current = id;
      setViewProviderId(id);
      localStorage.setItem("activeProvider", id);
      const key = `draft-${Date.now()}`;
      viewKeyRef.current = key;
      setViewChatId(null);
      setViewMessages([]);
      setViewSettings(defaultSettings());
      setViewModel(null);
      localStorage.removeItem("activeChat");
      localStorage.removeItem("activeModel");
      setViewKey(key);
      setViewReady(true);
    },
    [],
  );

  const onDeleteChat = useCallback(
    async (id: string) => {
      await deleteChat(id);
      for (const [k, v] of chatByViewRef.current) if (v === id) chatByViewRef.current.delete(k);
      setViewChatId((cur) => {
        if (cur === id) newChat();
        return cur === id ? null : cur;
      });
      refreshChats();
    },
    [newChat, refreshChats],
  );

  const provider = providers.find((p) => p.id === viewProviderId) ?? null;
  const providersById = new Map(providers.map((p) => [p.id, p]));

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          "shrink-0 overflow-hidden bg-ink-950 transition-[width] duration-200",
          collapsed ? "w-0" : "w-[300px] max-w-[85vw]",
        )}
      >
        {!collapsed && (
          <ChatHistory
            chats={chats}
            activeId={viewChatId}
            providersById={providersById}
            onSelect={openChat}
            onNew={newChat}
            onDelete={onDeleteChat}
            onCollapse={() => {
              setCollapsed(true);
              localStorage.setItem("sidebar", "0");
            }}
          />
        )}
      </aside>

      <main className="relative min-w-0 flex-1">
        {collapsed && (
          <button
            onClick={() => {
              setCollapsed(false);
              localStorage.setItem("sidebar", "1");
            }}
            className="absolute top-3 left-3 z-20 grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-ink-200 bg-white/90 shadow-sm transition hover:border-ink-400"
            aria-label="Open history"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        {viewReady ? (
          <ChatView
            key={viewKey}
            viewKey={viewKey}
            chatId={viewChatId}
            provider={provider}
            model={viewModel}
            initialMessages={viewMessages}
            initialSettings={viewSettings}
            onOpenProviders={() => setModalOpen(true)}
            onModelChange={onModelChange}
            onPersist={onPersist}
          />
        ) : (
          <div className="dotgrid grid h-full place-items-center" />
        )}
      </main>

      {modalOpen && (
        <ProviderModal
          providers={providers}
          activeId={viewProviderId}
          onSelect={onSelectProvider}
          onChanged={refreshProviders}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
