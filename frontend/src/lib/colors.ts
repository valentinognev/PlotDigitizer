export function rainbowColor(index: number, total: number): string {
  const n = Math.max(total, 1)
  const hue = (index / n) % 1
  return hslToHex(hue * 360, 85, 55)
}

export function rainbowColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => rainbowColor(i, count))
}

export function isGrayscaleHex(color: string): boolean {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return Math.max(r, g, b) - Math.min(r, g, b) < 30
}

export function curvesLookGrayscale(curves: { color: string }[]): boolean {
  return curves.length >= 2 && curves.every((c) => isGrayscaleHex(c.color))
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const lit = l / 100
  const c = (1 - Math.abs(2 * lit - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lit - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
