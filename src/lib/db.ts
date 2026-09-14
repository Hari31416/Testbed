import Dexie, { type Table } from "dexie";

export interface Provider {
  id: string;
  name: string;
  baseURL: string; // e.g. https://openrouter.ai/api/v1, no trailing slash
  apiKey: string;
  proxyPrefix?: string; // optional CORS proxy prefix
  createdAt: number;
}

export interface ProviderModel {
  id: string; // `${providerId}:${modelId}`
  providerId: string;
  modelId: string;
  pinned?: boolean;
  raw?: unknown;
  updatedAt: number;
}

export interface Chat {
  id: string;
  providerId: string;
  modelId: string;
  title: string;
  systemPrompt?: string;
  temperature?: number;
  stripReasoning?: boolean;
  maxTokens?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  // Stored as AI SDK UIMessage parts JSON so we can persist images + tool calls
  parts: unknown[];
  usage?: unknown;
  createdAt: number;
}

class DB extends Dexie {
  providers!: Table<Provider, string>;
  models!: Table<ProviderModel, string>;
  chats!: Table<Chat, string>;
  messages!: Table<ChatMessage, string>;

  constructor() {
    super("model-testbed");
    this.version(1).stores({
      providers: "id, name",
      models: "id, providerId, modelId",
      chats: "id, providerId, updatedAt",
      messages: "id, chatId, createdAt",
    });
  }
}

export const db = new DB();

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
