import type { DigitizeMethod } from '../lib/digitizeMethod'
import { DIGITIZE_METHOD_TABS } from '../lib/digitizeMethod'

interface Props {
  method: DigitizeMethod
  onChange: (method: DigitizeMethod) => void
  disabled?: boolean
}

export function DigitizeMethodTabs({ method, onChange, disabled }: Props) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {DIGITIZE_METHOD_TABS.map((tab) => {
        const selected = method === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={`rounded px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              selected ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
