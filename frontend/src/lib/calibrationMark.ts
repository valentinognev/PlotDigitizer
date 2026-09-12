export type CalibrationMarkVisual = {
  radius: number
  fill: string
  stroke: string
  strokeWidth: number
  hitStrokeWidth: number
  cross: {
    horizontal: [number, number, number, number]
    vertical: [number, number, number, number]
    stroke: string
    strokeWidth: number
  } | null
}

export function calibrationMarkVisual({
  hollow,
  active,
  color,
  scale,
}: {
  hollow: boolean
  active: boolean
  color: string
  scale: number
}): CalibrationMarkVisual {
  const radius = (active ? 10 : 8) / scale
  const strokeWidth = (active ? 3 : 2) / scale
  const arm = (active ? 6 : 5) / scale
  return {
    radius,
    fill: hollow ? 'transparent' : color,
    stroke: active ? '#fbbf24' : hollow ? color : '#fff',
    strokeWidth,
    hitStrokeWidth: 14 / scale,
    cross: hollow
      ? {
          horizontal: [-arm, 0, arm, 0],
          vertical: [0, -arm, 0, arm],
          stroke: color,
          strokeWidth: 1.5 / scale,
        }
      : null,
  }
}
