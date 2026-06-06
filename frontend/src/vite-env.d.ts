/// <reference types="vite/client" />

declare module 'react-plotly.js' {
  import type { ComponentType } from 'react'
  import type { PlotParams } from 'plotly.js'
  const Plot: ComponentType<PlotParams>
  export default Plot
}
