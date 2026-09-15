import {
  Brain,
  Check,
  ChevronDown,
  Cpu,
  Eye,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Sliders,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db, type ModelCapabilities, type Provider, type ProviderModel } from '../lib/db'
import {
  getOrResolveModelCapabilities,
  detectFromRegistries,
} from '../lib/capabilities'
import { fetchModels } from '../lib/providers'
import { cn } from '../lib/utils'
import { ModelCapabilitiesModal } from './ModelCapabilitiesModal'
import { Field } from './ui'

export function ModelSelect({
  provider,
  value,
  onPick,
  onCapabilitiesChange,
}: {
  provider: Provider | null
  value: string | null
  onPick: (m: string) => void
  onCapabilitiesChange?: (caps: ModelCapabilities | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [cachedModels, setCachedModels] = useState<ProviderModel[]>([])
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [currentCaps, setCurrentCaps] = useState<ModelCapabilities | null>(null)
  const [capsModalOpen, setCapsModalOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const onCapsRef = useRef(onCapabilitiesChange)

  useEffect(() => {
    onCapsRef.current = onCapabilitiesChange
  }, [onCapabilitiesChange])

  // Load cached models for this provider
  useEffect(() => {
    if (!provider) {
      setCachedModels([])
      setCurrentCaps(null)
      onCapsRef.current?.(null)
      return
    }
    let cancelled = false
    db.models
      .where('providerId')
      .equals(provider.id)
      .toArray()
      .then((records) => {
        if (cancelled) return
        records.sort((a, b) => a.modelId.localeCompare(b.modelId))
        setCachedModels(records)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [provider])

  // Resolve / load capabilities for the currently selected model
  useEffect(() => {
    if (!provider || !value) {
      setCurrentCaps(null)
      onCapsRef.current?.(null)
      return
    }

    let active = true
    getOrResolveModelCapabilities(provider.id, value).then((caps) => {
      if (!active) return
      setCurrentCaps(caps)
      onCapsRef.current?.(caps)
    })

    return () => {
      active = false
    }
  }, [provider, value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const sync = async () => {
    if (!provider || syncing) return
    setSyncing(true)
    setNote('')
    const s = await fetchModels(provider.baseURL, provider.apiKey, provider.proxyPrefix)
    setSyncing(false)
    if (!s.ok) {
      setNote(`${s.kind}: ${s.message}`)
      return
    }

    setNote(`${s.models.length} models synced`)
    const now = Date.now()

    // Preserve existing capabilities if present
    const existing = await db.models.where('providerId').equals(provider.id).toArray()
    const existingMap = new Map(existing.map((e) => [e.modelId, e]))

    const updatedList: ProviderModel[] = []
    for (const m of s.models) {
      const prev = existingMap.get(m)
      let caps = prev?.capabilities
      if (!caps) {
        caps = (await detectFromRegistries(m)) ?? undefined
      }
      updatedList.push({
        id: `${provider.id}:${m}`,
        providerId: provider.id,
        modelId: m,
        capabilities: caps,
        updatedAt: now,
      })
    }

    await db.models.bulkPut(updatedList)
    updatedList.sort((a, b) => a.modelId.localeCompare(b.modelId))
    setCachedModels(updatedList)
  }

  const handlePickModel = async (modelId: string) => {
    onPick(modelId)
    setOpen(false)

    if (provider) {
      const caps = await getOrResolveModelCapabilities(provider.id, modelId)
      setCurrentCaps(caps)
      onCapabilitiesChange?.(caps)
      // If neither registry recognized the model, trigger user configuration modal
      if (!caps) {
        setCapsModalOpen(true)
      }
    }
  }

  const handleCapabilitiesSaved = (caps: ModelCapabilities) => {
    setCurrentCaps(caps)
    onCapabilitiesChange?.(caps)
    if (provider && value) {
      setCachedModels((prev) =>
        prev.map((m) =>
          m.modelId === value ? { ...m, capabilities: caps } : m,
        ),
      )
    }
  }

  const filtered = cachedModels
    .filter((m) => m.modelId.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 250)

  return (
    <div ref={boxRef} className="relative flex items-center gap-1 min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!provider}
        className={cn(
          'flex max-w-72 cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs transition',
          value
            ? 'bg-ink-950 text-[#f5f1e8] hover:bg-ink-800 dark:bg-ink-800 dark:text-[#ede7db] dark:hover:bg-ink-700'
            : 'border border-dashed border-ink-300 text-ink-500 hover:border-signal-600 hover:text-signal-700 dark:border-ink-700 dark:text-ink-400 dark:hover:border-signal-500 dark:hover:text-signal-400',
        )}
        title={value ?? 'Pick a model'}
      >
        <span
          className={cn(
            'grid h-5 w-5 shrink-0 place-items-center rounded-full',
            value ? 'bg-signal-600 text-white' : 'bg-ink-950/5 dark:bg-white/10',
          )}
        >
          <Cpu size={11} />
        </span>
        <span className="truncate font-mono">{value ?? 'Pick a model'}</span>

        {/* Compact capability indicator icons */}
        {currentCaps && (
          <span className="flex items-center gap-1 opacity-80">
            {currentCaps.supportsVision && (
              <span title="Vision supported">
                <Eye size={11} className="text-signal-400" />
              </span>
            )}
            {currentCaps.supportsImageGen && (
              <span title="Image generation supported">
                <ImageIcon size={11} className="text-purple-300" />
              </span>
            )}
            {currentCaps.isReasoning && (
              <span title="Reasoning model">
                <Brain size={11} className="text-amber-300" />
              </span>
            )}
          </span>
        )}

        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>

      {/* Button to open capabilities modal for active model */}
      {provider && value && (
        <button
          onClick={() => setCapsModalOpen(true)}
          className={cn(
            'grid h-7 w-7 cursor-pointer place-items-center rounded-full border transition',
            currentCaps
              ? 'border-ink-200 bg-white/80 text-ink-600 hover:border-signal-600 hover:text-signal-700 dark:border-ink-800 dark:bg-ink-900/80 dark:text-ink-300 dark:hover:border-signal-500 dark:hover:text-signal-400'
              : 'border-dashed border-amber-500 bg-amber-50 text-amber-700 animate-pulse dark:bg-amber-950/40 dark:text-amber-300',
          )}
          title={
            currentCaps
              ? 'Configure model capabilities'
              : 'Capabilities unknown - click to configure'
          }
          aria-label="Configure model capabilities"
        >
          <Sliders size={12} />
        </button>
      )}

      {/* Dropdown list */}
      {open && provider && (
        <div className="absolute top-full left-0 z-30 mt-2 w-80 max-w-[80vw] animate-rise rounded-2xl border border-ink-200 bg-white p-2.5 shadow-xl dark:border-ink-800 dark:bg-ink-900 dark:text-[#ede7db]">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search
                size={13}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400"
              />
              <Field
                placeholder="Filter models…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="py-1 pl-8 text-xs"
                aria-label="Filter models"
              />
            </div>
            <button
              onClick={sync}
              disabled={syncing}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-ink-200 px-2 py-1.5 font-mono text-[11px] text-ink-700 transition hover:border-ink-400 disabled:opacity-50 dark:border-ink-800 dark:text-ink-300 dark:hover:border-ink-700"
              title="Sync /models from provider"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          </div>
          {note && (
            <p className="mt-1.5 truncate px-1 font-mono text-[11px] text-ink-500 dark:text-ink-400" title={note}>
              {note}
            </p>
          )}
          <div className="mt-1.5 max-h-64 space-y-0.5 overflow-auto">
            {filtered.map((m) => {
              const caps = m.capabilities
              return (
                <button
                  key={m.modelId}
                  onClick={() => handlePickModel(m.modelId)}
                  title={m.modelId}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition',
                    m.modelId === value
                      ? 'bg-signal-50 text-signal-700 dark:bg-signal-950/40 dark:text-signal-400'
                      : 'text-ink-900 hover:bg-ink-950/[0.04] dark:text-[#ede7db] dark:hover:bg-white/[0.06]',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {m.modelId}
                  </span>
                  {caps && (
                    <span className="flex items-center gap-1 opacity-70">
                      {caps.supportsVision && (
                        <span title="Vision">
                          <Eye size={10} className="text-signal-600 dark:text-signal-400" />
                        </span>
                      )}
                      {caps.supportsImageGen && (
                        <span title="Image Gen">
                          <ImageIcon size={10} className="text-purple-600 dark:text-purple-400" />
                        </span>
                      )}
                      {caps.isReasoning && (
                        <span title="Reasoning">
                          <Brain size={10} className="text-amber-600 dark:text-amber-400" />
                        </span>
                      )}
                    </span>
                  )}
                  {m.modelId === value && <Check size={13} className="shrink-0" />}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                {cachedModels.length === 0
                  ? 'Nothing cached — hit sync.'
                  : 'No match for that filter.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Capabilities Edit Modal */}
      {capsModalOpen && provider && value && (
        <ModelCapabilitiesModal
          providerId={provider.id}
          modelId={value}
          initialCapabilities={currentCaps}
          onSave={handleCapabilitiesSaved}
          onClose={() => setCapsModalOpen(false)}
        />
      )}
    </div>
  )
}
