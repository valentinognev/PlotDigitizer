import type { Theme } from '../lib/theme'

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: 'night', label: 'Night' },
  { id: 'day', label: 'Day' },
]

export function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: Theme
  onChange: (theme: Theme) => void
}) {
  return (
    <div role="group" aria-label="Color theme" className="flex items-center">
      {THEME_OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          onClick={() => onChange(id)}
          className={`rounded px-2 py-1 text-[11px] font-medium ${
            theme === id ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
