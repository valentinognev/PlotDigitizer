import type { ProviderName, SettingsPublic } from '../types'

interface Props {
  settings: SettingsPublic | null
  apiKeyInput: string
  selectedProvider: ProviderName
  onProviderChange: (p: ProviderName) => void
  onApiKeyChange: (v: string) => void
  onSave: () => void
  onClearKey: (p: ProviderName) => void
}

export function SettingsPanel({
  settings,
  apiKeyInput,
  selectedProvider,
  onProviderChange,
  onApiKeyChange,
  onSave,
  onClearKey,
}: Props) {
  const providerStatus = settings?.providers.find((p) => p.name === selectedProvider)

  return (
    <section className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
      <h3 className="mb-1.5 text-xs font-semibold text-slate-200">Settings</h3>
      <div className="flex flex-wrap items-end gap-2 text-[11px]">
        <label className="text-slate-300">
          Provider
          <select
            className="mt-0.5 block rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5"
            value={selectedProvider}
            onChange={(e) => onProviderChange(e.target.value as ProviderName)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label className="min-w-[120px] flex-1 text-slate-300">
          API key
          <input
            type="password"
            className="mt-0.5 w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5"
            placeholder={providerStatus?.has_key ? '•••• set' : 'Paste key'}
            value={apiKeyInput}
            onChange={(e) => onApiKeyChange(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          className="rounded bg-sky-600 px-2 py-1 text-[11px] font-medium hover:bg-sky-500"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => onClearKey(selectedProvider)}
          className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500"
        >
          Clear
        </button>
      </div>
    </section>
  )
}
