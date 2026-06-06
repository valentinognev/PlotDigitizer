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
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Settings</h3>
      <label className="mb-2 block text-xs text-slate-300">
        Provider
        <select
          className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value as ProviderName)}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>
      <p className="mb-2 text-xs text-slate-400">
        Key status: {providerStatus?.has_key ? '•••• set' : 'not set'}
      </p>
      <label className="mb-2 block text-xs text-slate-300">
        API key
        <input
          type="password"
          className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
          placeholder="Paste API key"
          value={apiKeyInput}
          onChange={(e) => onApiKeyChange(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => onClearKey(selectedProvider)}
          className="rounded bg-slate-600 px-3 py-1.5 text-xs hover:bg-slate-500"
        >
          Clear key
        </button>
      </div>
    </section>
  )
}
