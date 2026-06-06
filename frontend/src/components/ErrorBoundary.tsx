import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PlotDigitizer UI error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-slate-200">
          <h1 className="text-lg font-semibold">PlotDigitizer failed to load</h1>
          <p className="max-w-md text-sm text-slate-400">
            Try a hard refresh (Ctrl+Shift+R). If the problem persists, run{' '}
            <code className="text-amber-300">./kill.sh &amp;&amp; ./start.sh</code>.
          </p>
          <button
            type="button"
            className="rounded bg-sky-600 px-4 py-2 text-sm hover:bg-sky-500"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
