import { db, type ModelCapabilities } from './db'

interface OpenRouterModelItem {
  id: string
  name?: string
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
  }
  supported_parameters?: string[]
}

interface LiteLLMModelEntry {
  supports_vision?: boolean
  supports_reasoning?: boolean
  mode?: string
}

type LiteLLMCatalog = Record<string, LiteLLMModelEntry>

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const LITELLM_CATALOG_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const STORAGE_KEY_OR = 'testbed_or_catalog_cache'
const STORAGE_KEY_LL = 'testbed_litellm_catalog_cache'

let openRouterCache: OpenRouterModelItem[] | null = null
let liteLLMCache: LiteLLMCatalog | null = null

function readLocalCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { timestamp: number; data: T }
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

function writeLocalCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ timestamp: Date.now(), data }),
    )
  } catch {
    /* storage quota exceeded or disabled */
  }
}

export async function fetchOpenRouterCatalog(): Promise<OpenRouterModelItem[]> {
  if (openRouterCache) return openRouterCache

  const local = readLocalCache<OpenRouterModelItem[]>(STORAGE_KEY_OR)
  if (local) {
    openRouterCache = local
    return local
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { data?: OpenRouterModelItem[] }
    if (Array.isArray(json.data)) {
      openRouterCache = json.data
      writeLocalCache(STORAGE_KEY_OR, json.data)
      return json.data
    }
  } catch {
    /* network or CORS error; return empty fallback */
  }

  return []
}

export async function fetchLiteLLMCatalog(): Promise<LiteLLMCatalog> {
  if (liteLLMCache) return liteLLMCache

  const local = readLocalCache<LiteLLMCatalog>(STORAGE_KEY_LL)
  if (local) {
    liteLLMCache = local
    return local
  }

  try {
    const res = await fetch(LITELLM_CATALOG_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as LiteLLMCatalog
    if (json && typeof json === 'object') {
      liteLLMCache = json
      writeLocalCache(STORAGE_KEY_LL, json)
      return json
    }
  } catch {
    /* network error; return empty fallback */
  }

  return {}
}

export function normalizeModelId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/^[^/]+\//, '') // strip provider prefix (e.g. 'openai/gpt-4o' -> 'gpt-4o')
    .replace(/:latest$/, '') // strip tag suffix (e.g. 'model:latest' -> 'model')
}

export async function detectFromRegistries(
  modelId: string,
): Promise<ModelCapabilities | null> {
  const normId = normalizeModelId(modelId)
  const rawIdLower = modelId.toLowerCase().trim()

  // Step 1: OpenRouter registry
  const orModels = await fetchOpenRouterCatalog()
  for (const m of orModels) {
    const mIdLower = m.id.toLowerCase()
    const mNorm = normalizeModelId(m.id)

    if (mIdLower === rawIdLower || mNorm === normId) {
      const inputMods = m.architecture?.input_modalities ?? []
      const outputMods = m.architecture?.output_modalities ?? []
      const supportedParams = m.supported_parameters ?? []

      // Standalone image models output image without text (e.g. text->image like Flux/DALL-E).
      // Multimodal chat models (like Gemini) output text + images and communicate via /chat/completions.
      const isPureImageGen =
        outputMods.includes('image') && !outputMods.includes('text')

      return {
        supportsVision: inputMods.includes('image'),
        supportsImageGen: isPureImageGen,
        isReasoning: supportedParams.includes('reasoning'),
      }
    }
  }

  // Step 2: LiteLLM registry
  const litellm = await fetchLiteLLMCatalog()
  for (const [key, entry] of Object.entries(litellm)) {
    const keyLower = key.toLowerCase()
    const keyNorm = normalizeModelId(key)

    if (keyLower === rawIdLower || keyNorm === normId) {
      return {
        supportsVision: Boolean(entry.supports_vision),
        supportsImageGen: entry.mode === 'image_generation',
        isReasoning: Boolean(entry.supports_reasoning),
      }
    }
  }

  // Step 3: Not found in either registry
  return null
}

export async function getOrResolveModelCapabilities(
  providerId: string,
  modelId: string,
): Promise<ModelCapabilities | null> {
  const compositeId = `${providerId}:${modelId}`
  const existing = await db.models.get(compositeId)

  if (existing?.capabilities) {
    return existing.capabilities
  }

  const detected = await detectFromRegistries(modelId)
  if (detected) {
    if (existing) {
      await db.models.update(compositeId, { capabilities: detected })
    } else {
      await db.models.put({
        id: compositeId,
        providerId,
        modelId,
        capabilities: detected,
        updatedAt: Date.now(),
      })
    }
    return detected
  }

  return null
}

export async function saveModelCapabilities(
  providerId: string,
  modelId: string,
  caps: ModelCapabilities,
): Promise<void> {
  const compositeId = `${providerId}:${modelId}`
  const existing = await db.models.get(compositeId)

  const updatedCaps: ModelCapabilities = {
    ...caps,
    customizedByUser: true,
  }

  if (existing) {
    await db.models.update(compositeId, { capabilities: updatedCaps })
  } else {
    await db.models.put({
      id: compositeId,
      providerId,
      modelId,
      capabilities: updatedCaps,
      updatedAt: Date.now(),
    })
  }
}
