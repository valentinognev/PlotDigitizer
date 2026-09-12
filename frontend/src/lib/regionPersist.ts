import type { RegionMask, Session } from '../types'

export function shouldApplySavedRegion(opts: { savedSeq: number; localSeq: number }): boolean {
  return opts.savedSeq === opts.localSeq
}

export function applyCurveRegion(session: Session, curveId: string, region: RegionMask): Session {
  return {
    ...session,
    curves: session.curves.map((c) => (c.id === curveId ? { ...c, region } : c)),
  }
}

export function nextCurveRegion(
  session: Session,
  curveId: string,
  compute: (prev: RegionMask | undefined) => RegionMask,
): { region: RegionMask; previous: RegionMask | undefined } | null {
  const curve = session.curves.find((c) => c.id === curveId)
  if (!curve) return null
  const previous = curve.region ?? undefined
  return { previous, region: compute(previous) }
}
