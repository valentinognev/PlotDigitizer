import type { ConnectAs } from '../types'

export function connectAsToPlotlyMode(
  connectAs: ConnectAs | undefined,
): 'lines+markers' | 'markers' {
  return connectAs === 'scatter' ? 'markers' : 'lines+markers'
}
