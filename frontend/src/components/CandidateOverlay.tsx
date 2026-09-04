import { Circle, Group, Text } from 'react-konva'
import type { MatchCandidate } from '../types'
import { ringRadiusFromScore } from '../lib/pointMatch'

interface Props {
  candidates: MatchCandidate[]
  scale: number
  toDisplay: (pixel: [number, number]) => [number, number]
}

export function CandidateOverlay({ candidates, scale, toDisplay }: Props) {
  return (
    <>
      {candidates.map((cand, i) => {
        const [x, y] = toDisplay(cand.pixel)
        const isCurrent = i === 0
        const r = ringRadiusFromScore(cand.score, isCurrent) / scale
        return (
          <Group key={`${cand.pixel[0]}-${cand.pixel[1]}-${i}`} x={x} y={y} listening={false}>
            <Circle
              radius={r}
              stroke={isCurrent ? '#fbbf24' : '#38bdf8'}
              strokeWidth={(isCurrent ? 3 : 1.5) / scale}
              fill={isCurrent ? 'rgba(251, 191, 36, 0.12)' : 'transparent'}
            />
            {isCurrent && (
              <Text
                x={r + 2 / scale}
                y={-6 / scale}
                text={`${cand.score.toFixed(2)}`}
                fontSize={11 / scale}
                fill="#fbbf24"
              />
            )}
          </Group>
        )
      })}
    </>
  )
}
