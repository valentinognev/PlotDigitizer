export const NUDGE_STEP_PX = 1
export const NUDGE_SHIFT_STEP_PX = 10

export function nudgeDelta(key: string, shift: boolean): [number, number] | null {
  const step = shift ? NUDGE_SHIFT_STEP_PX : NUDGE_STEP_PX
  if (key === 'ArrowLeft') return [-step, 0]
  if (key === 'ArrowRight') return [step, 0]
  if (key === 'ArrowUp') return [0, -step]
  if (key === 'ArrowDown') return [0, step]
  return null
}

export function applyNudge(
  pixel: [number, number],
  delta: [number, number],
  bounds?: { w: number; h: number },
): [number, number] {
  let x = pixel[0] + delta[0]
  let y = pixel[1] + delta[1]
  if (bounds) {
    x = Math.min(Math.max(x, 0), bounds.w)
    y = Math.min(Math.max(y, 0), bounds.h)
  }
  return [x, y]
}
