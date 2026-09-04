import { Line } from 'react-konva'
import type { Calibration } from '../types'
import { axesCheckerPolyline, isCalibrationValid } from '../lib/transform2d'
import { axesCheckerVisible } from '../lib/axesChecker'

interface Props {
  calibration: Calibration | null
  imageWidth: number
  imageHeight: number
  enabled: boolean
  changedAtMs: number
  nowMs: number
  scale: number
}

export function AxesCheckerOverlay({
  calibration,
  imageWidth,
  imageHeight,
  enabled,
  changedAtMs,
  nowMs,
  scale,
}: Props) {
  if (!calibration || !isCalibrationValid(calibration)) return null
  if (!axesCheckerVisible(enabled, changedAtMs, nowMs)) return null
  let points: [number, number][]
  try {
    points = axesCheckerPolyline(calibration, [imageWidth, imageHeight])
  } catch {
    return null
  }
  if (points.length < 2) return null
  return (
    <Line
      points={points.flat()}
      stroke="#fbbf24"
      strokeWidth={2 / scale}
      dash={[6 / scale, 4 / scale]}
      closed={false}
      listening={false}
    />
  )
}
