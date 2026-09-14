import type { UIMessage } from "ai";
import { db, uid, type Chat } from "./db";

export type PersistedMessage = Pick<UIMessage, "id" | "role" | "parts"> & Partial<UIMessage>;

export async function listChats(): Promise<Chat[]> {
  return db.chats.orderBy("updatedAt").reverse().toArray();
}

export async function createChat(init: Pick<Chat, "providerId" | "modelId"> & Partial<Chat>): Promise<Chat> {
  const now = Date.now();
  const chat: Chat = {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    ...init,
  };
  await db.chats.put(chat);
  return chat;
}

export async function updateChat(id: string, patch: Partial<Chat>) {
  // Note: intentionally does NOT touch updatedAt — recency is driven only by
  // new message content (see replaceMessages), so viewing chats or tweaking
  // settings never reshuffles history order.
  const { updatedAt: _ignored, ...rest } = patch;
  await db.chats.update(id, rest);
}

export async function deleteChat(id: string) {
  await db.transaction("rw", db.chats, db.messages, async () => {
    await db.chats.delete(id);
    await db.messages.where("chatId").equals(id).delete();
  });
}

/** Replace a chat's stored messages with the current in-memory thread.
 *  Skips the write (and the updatedAt bump) when content is unchanged, so
 *  merely opening a chat or re-saving identical state never reorders history. */
export async function replaceMessages(chatId: string, messages: PersistedMessage[]) {
  const now = Date.now();
  const existing = await db.messages.where("chatId").equals(chatId).sortBy("createdAt");
  if (sameThread(existing, messages)) return;
  await db.transaction("rw", db.chats, db.messages, async () => {
    await db.messages.where("chatId").equals(chatId).delete();
    if (messages.length) {
      await db.messages.bulkPut(
        messages.map((m, i) => ({
          id: m.id || `${chatId}-${i}`,
          chatId,
          role: m.role as "user" | "assistant" | "system",
          parts: (m.parts ?? []) as unknown[],
          createdAt: now + i,
        })),
      );
    }
    const title = titleFor(messages);
    const patch: Partial<Chat> = { updatedAt: now };
    if (title) patch.title = title;
    await db.chats.update(chatId, patch);
  });
}

function fingerprint(parts: unknown): string {
  return JSON.stringify(parts ?? []);
}

function sameThread(
  stored: { id: string; parts: unknown[] }[],
  incoming: PersistedMessage[],
): boolean {
  if (stored.length !== incoming.length) return false;
  return stored.every((row, i) => {
    const m = incoming[i];
    if (!m || row.id !== (m.id || "")) return false;
    return fingerprint(row.parts) === fingerprint(m.parts);
  });
}

export async function loadMessages(chatId: string): Promise<PersistedMessage[]> {
  const rows = await db.messages.where("chatId").equals(chatId).sortBy("createdAt");
  return rows.map((r) => ({ id: r.id, role: r.role, parts: (r.parts ?? []) as UIMessage["parts"] }));
}

function firstUserText(messages: PersistedMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const p of m.parts ?? []) {
      const part = p as { type?: string; text?: string };
      if (part.type === "text" && part.text?.trim()) return part.text.trim().replace(/\s+/g, " ");
    }
  }
  return "";
}

/** Derive a title from the first user message (only when still untitled). */
export function titleFor(messages: PersistedMessage[]): string | undefined {
  const text = firstUserText(messages);
  if (!text) return undefined;
  return text.length > 44 ? text.slice(0, 44) + "…" : text;
}
