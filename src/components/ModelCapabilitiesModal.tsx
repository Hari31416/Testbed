import { Brain, Check, Eye, Image as ImageIcon, Sliders, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ModelCapabilities } from '../lib/db'
import { saveModelCapabilities } from '../lib/capabilities'
import { cn } from '../lib/utils'
import { Btn } from './ui'

export function ModelCapabilitiesModal({
  providerId,
  modelId,
  initialCapabilities,
  onSave,
  onClose,
}: {
  providerId: string
  modelId: string
  initialCapabilities: ModelCapabilities | null
  onSave: (caps: ModelCapabilities) => void
  onClose: () => void
}) {
  const [supportsVision, setSupportsVision] = useState(
    initialCapabilities?.supportsVision ?? false,
  )
  const [supportsImageGen, setSupportsImageGen] = useState(
    initialCapabilities?.supportsImageGen ?? false,
  )
  const [isReasoning, setIsReasoning] = useState(
    initialCapabilities?.isReasoning ?? false,
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const caps: ModelCapabilities = {
      supportsVision,
      supportsImageGen,
      isReasoning,
      customizedByUser: true,
    }
    await saveModelCapabilities(providerId, modelId, caps)
    setSaving(false)
    onSave(caps)
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Configure Model Capabilities"
    >
      <div
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-md animate-rise overflow-y-auto rounded-2xl border border-ink-200 bg-paper p-5 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-950 text-signal-500">
            <Sliders size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Model Capabilities
            </h2>
            <p className="truncate font-mono text-[11px] text-ink-500" title={modelId}>
              {modelId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-500 hover:bg-ink-950/5 hover:text-ink-950"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {/* Vision Input Toggle */}
          <label
            onClick={() => setSupportsVision((v) => !v)}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
              supportsVision
                ? 'border-signal-600/60 bg-signal-50'
                : 'border-ink-200 bg-white hover:border-ink-400',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md',
                supportsVision ? 'bg-signal-600 text-white' : 'bg-ink-100 text-ink-600',
              )}
            >
              <Eye size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Image Input (Vision)</span>
                <span
                  className={cn(
                    'grid h-4 w-4 place-items-center rounded border',
                    supportsVision
                      ? 'border-signal-600 bg-signal-600 text-white'
                      : 'border-ink-300 bg-white',
                  )}
                >
                  {supportsVision && <Check size={11} strokeWidth={3} />}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                Allows attaching and analyzing images in the chat.
              </p>
            </div>
          </label>

          {/* Image Generation Output Toggle */}
          <label
            onClick={() => setSupportsImageGen((v) => !v)}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
              supportsImageGen
                ? 'border-signal-600/60 bg-signal-50'
                : 'border-ink-200 bg-white hover:border-ink-400',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md',
                supportsImageGen ? 'bg-signal-600 text-white' : 'bg-ink-100 text-ink-600',
              )}
            >
              <ImageIcon size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Dedicated Image Model (/images/generations)
                </span>
                <span
                  className={cn(
                    'grid h-4 w-4 place-items-center rounded border',
                    supportsImageGen
                      ? 'border-signal-600 bg-signal-600 text-white'
                      : 'border-ink-300 bg-white',
                  )}
                >
                  {supportsImageGen && <Check size={11} strokeWidth={3} />}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                Only for standalone image engines (DALL-E 3, Flux). Multimodal chat models (like Gemini) generate content in Chat and should leave this unchecked.
              </p>
            </div>
          </label>

          {/* Reasoning Toggle */}
          <label
            onClick={() => setIsReasoning((v) => !v)}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
              isReasoning
                ? 'border-signal-600/60 bg-signal-50'
                : 'border-ink-200 bg-white hover:border-ink-400',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md',
                isReasoning ? 'bg-signal-600 text-white' : 'bg-ink-100 text-ink-600',
              )}
            >
              <Brain size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Reasoning Model</span>
                <span
                  className={cn(
                    'grid h-4 w-4 place-items-center rounded border',
                    isReasoning
                      ? 'border-signal-600 bg-signal-600 text-white'
                      : 'border-ink-300 bg-white',
                  )}
                >
                  {isReasoning && <Check size={11} strokeWidth={3} />}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                Strips reasoning blocks from prompt history during tool execution loops.
              </p>
            </div>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Capabilities'}
          </Btn>
        </div>
      </div>
    </div>,
    document.body,
  )
}
