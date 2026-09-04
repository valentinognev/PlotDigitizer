export type MatchCandidate = { pixel: [number, number]; score: number }

export type PointMatchState = {
  candidates: MatchCandidate[]
  accepted: MatchCandidate[]
  rejected: MatchCandidate[]
}

export type PointMatchAction =
  | { type: 'set-candidates'; candidates: MatchCandidate[] }
  | { type: 'accept-current' }
  | { type: 'reject-current' }
  | { type: 'accept-at-or-above' }
  | { type: 'clear' }

export const emptyPointMatch: PointMatchState = {
  candidates: [],
  accepted: [],
  rejected: [],
}

export function partitionByScore(
  candidates: MatchCandidate[],
  threshold: number,
): { atOrAbove: MatchCandidate[]; below: MatchCandidate[] } {
  const atOrAbove: MatchCandidate[] = []
  const below: MatchCandidate[] = []
  for (const c of candidates) {
    if (c.score >= threshold) atOrAbove.push(c)
    else below.push(c)
  }
  return { atOrAbove, below }
}

export function ringRadiusFromScore(score: number, isCurrent: boolean): number {
  const clamped = Math.min(1, Math.max(0, score))
  const base = 6 + (1 - clamped) * 10
  return isCurrent ? base + 4 : base
}

export function reducePointMatch(
  state: PointMatchState,
  action: PointMatchAction,
): PointMatchState {
  if (action.type === 'clear') return emptyPointMatch
  if (action.type === 'set-candidates') {
    const ranked = [...action.candidates].sort((a, b) => b.score - a.score)
    return { ...state, candidates: ranked }
  }
  const current = state.candidates[0]
  if (!current) return state
  if (action.type === 'accept-current') {
    return {
      accepted: [...state.accepted, current],
      rejected: state.rejected,
      candidates: state.candidates.slice(1),
    }
  }
  if (action.type === 'reject-current') {
    return {
      accepted: state.accepted,
      rejected: [...state.rejected, current],
      candidates: state.candidates.slice(1),
    }
  }
  const { atOrAbove, below } = partitionByScore(state.candidates, current.score)
  return {
    accepted: [...state.accepted, ...atOrAbove],
    rejected: state.rejected,
    candidates: below,
  }
}

export function pointMatchKeyAction(
  key: string,
  shiftKey: boolean,
): PointMatchAction | null {
  if (key === 'Enter' && shiftKey) return { type: 'accept-at-or-above' }
  if (key === 'Enter') return { type: 'accept-current' }
  if (key === 'Escape') return { type: 'reject-current' }
  return null
}
