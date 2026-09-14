import { FlaskConical, MessageSquareText, PanelLeftClose, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import type { Chat, Provider } from "../lib/db";
import { cn } from "../lib/utils";
import { Plaque } from "./ui";

function age(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ChatHistory({
  chats,
  activeId,
  providersById,
  onSelect,
  onNew,
  onDelete,
  onCollapse,
}: {
  chats: Chat[];
  activeId: string | null;
  providersById: Map<string, Provider>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal-600 text-white shadow-[0_4px_16px_-4px_var(--color-signal-600)]">
          <FlaskConical size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[19px] leading-none font-semibold tracking-tight text-[#f2ede1]">
            Testbed
          </span>
          <span className="mt-0.5 block font-mono text-[10px] tracking-[0.16em] text-ink-400 uppercase">BYOK</span>
        </span>
        <button onClick={onCollapse} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-400 transition hover:bg-white/10 hover:text-white" aria-label="Collapse sidebar">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button
        onClick={onNew}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-signal-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_var(--color-signal-600)] transition hover:bg-signal-700 active:scale-[0.99]"
      >
        <PenLine size={15} /> New chat
      </button>

      <div className="-mx-1 min-h-0 flex-1 space-y-1 overflow-auto px-1">
        <Plaque tone="dark" className="px-1">History</Plaque>
        {chats.map((c) => {
          const active = c.id === activeId;
          const prov = providersById.get(c.providerId);
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition",
                active ? "border-signal-500/60 bg-signal-500/[0.12]" : "border-transparent hover:bg-white/[0.05]",
              )}
            >
              <MessageSquareText size={14} className={cn("shrink-0", active ? "text-signal-500" : "text-ink-500")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[#ece7db]">{c.title || "Untitled"}</span>
                <span className="block truncate font-mono text-[10px] text-ink-400">
                  {prov?.name ?? "provider?"} · {c.modelId || "no model"} · {age(c.updatedAt)}
                </span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                className="cursor-pointer rounded p-1 text-ink-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-300"
                aria-label="Delete chat"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        {chats.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-5 text-center text-xs leading-relaxed text-ink-400">
            No conversations yet.
            <br />
            Hit New chat to start probing.
          </p>
        )}
      </div>

      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-signal-500 uppercase">
          <ShieldCheck size={12} />
          <span>No Server Required</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
          Client-only runtime. Keys and data stay in your browser.
        </p>
      </div>
    </div>
  );
}
