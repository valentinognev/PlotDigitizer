import type { FigureMeta } from '../types'

export const FIGURE_FIELD_KEYS = ['title', 'xlabel', 'ylabel'] as const satisfies readonly (keyof FigureMeta)[]

export const FIGURE_FIELD_LABELS: Record<keyof FigureMeta, string> = {
  title: 'Figure title',
  xlabel: 'xlabel',
  ylabel: 'ylabel',
}
