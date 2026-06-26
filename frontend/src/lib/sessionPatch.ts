import type { Point, Session } from '../types'

export function patchPointPixel(
  session: Session,
  pointId: string,
  pixel: [number, number],
): Session {
  return patchPointsPixel(session, [{ pointId, pixel }])
}

export function patchPointsPixel(
  session: Session,
  moves: Array<{ pointId: string; pixel: [number, number] }>,
): Session {
  if (!moves.length) return session
  const byId = new Map(moves.map((m) => [m.pointId, m.pixel]))
  return {
    ...session,
    curves: session.curves.map((curve) => ({
      ...curve,
      points: curve.points.map((p) => {
        const pixel = byId.get(p.id)
        return pixel ? { ...p, pixel, origin: 'user' as const } : p
      }),
    })),
  }
}

export function deletePoint(session: Session, pointId: string): Session {
  return deletePoints(session, [pointId])
}

export function deletePoints(session: Session, pointIds: string[]): Session {
  const idSet = new Set(pointIds)
  if (!idSet.size) return session
  return {
    ...session,
    curves: session.curves.map((curve) => ({
      ...curve,
      points: curve.points.filter((p) => !idSet.has(p.id)),
    })),
  }
}

export function reassignPoint(
  session: Session,
  pointId: string,
  toCurveId: string,
): Session {
  return reassignPoints(session, [pointId], toCurveId)
}

export function reassignPoints(
  session: Session,
  pointIds: string[],
  toCurveId: string,
): Session {
  const idSet = new Set(pointIds)
  if (!idSet.size) return session
  const moved: Point[] = []
  const curves = session.curves.map((curve) => {
    const kept: Point[] = []
    for (const pt of curve.points) {
      if (idSet.has(pt.id)) {
        moved.push({ ...pt, origin: 'user' })
      } else {
        kept.push(pt)
      }
    }
    return { ...curve, points: kept }
  })
  if (!moved.length) return session
  return {
    ...session,
    curves: curves.map((curve) =>
      curve.id === toCurveId ? { ...curve, points: [...curve.points, ...moved] } : curve,
    ),
  }
}

export function addPoint(
  session: Session,
  curveId: string,
  pixel: [number, number],
): Session {
  const pending: Point = {
    id: `pending-${crypto.randomUUID()}`,
    pixel,
    origin: 'user',
  }
  return {
    ...session,
    curves: session.curves.map((curve) =>
      curve.id === curveId ? { ...curve, points: [...curve.points, pending] } : curve,
    ),
  }
}
