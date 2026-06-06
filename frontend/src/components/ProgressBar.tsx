interface Props {
  message: string
}

export function ProgressBar({ message }: Props) {
  return (
    <div className="border-b border-emerald-700/50 bg-slate-900 px-4 py-2 shadow-lg shadow-emerald-900/20">
      <p className="mb-1.5 text-sm font-medium text-emerald-200">{message}</p>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-700">
        <div className="progress-indeterminate absolute inset-y-0 w-2/5 rounded-full bg-emerald-400" />
      </div>
    </div>
  )
}
