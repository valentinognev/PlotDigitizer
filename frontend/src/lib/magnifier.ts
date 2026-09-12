export function magnifierSourceRect(
  imageW: number,
  imageH: number,
  cursor: [number, number],
  magnification: number,
  view: number,
): { sx: number; sy: number; sw: number; sh: number } {
  let sw = view / magnification
  let sh = view / magnification
  let sx = cursor[0] - sw / 2
  let sy = cursor[1] - sh / 2

  if (sw > imageW) {
    sx = 0
    sw = imageW
  } else {
    sx = Math.min(Math.max(sx, 0), imageW - sw)
  }

  if (sh > imageH) {
    sy = 0
    sh = imageH
  } else {
    sy = Math.min(Math.max(sy, 0), imageH - sh)
  }

  return { sx, sy, sw, sh }
}
