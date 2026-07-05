import { Circle, Group, Line } from 'react-konva'
import {
  resolveMeshGrid,
  type MeshGridState,
  type MeshVertex,
  type Point,
} from '../lib/meshWarp'

const GRID_SIZE = 4

interface Props {
  mesh: MeshGridState
  scale: number
  onUpdateVertex: (row: number, col: number, vertex: MeshVertex) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function isBoundary(i: number, j: number): boolean {
  return i === 0 || i === GRID_SIZE - 1 || j === 0 || j === GRID_SIZE - 1
}

function handlePosition(vertex: MeshVertex, kind: 'h' | 'v'): Point {
  const tangent = kind === 'h' ? vertex.tangentH : vertex.tangentV
  if (!tangent) return vertex.position
  const len = Math.hypot(tangent[0], tangent[1])
  const dist = Math.min(40, Math.max(12, len * 0.35))
  const ux = tangent[0] / (len || 1)
  const uy = tangent[1] / (len || 1)
  return [vertex.position[0] + ux * dist, vertex.position[1] + uy * dist]
}

export function MeshGridOverlay({
  mesh,
  scale,
  onUpdateVertex,
  onDragStart,
  onDragEnd,
}: Props) {
  const grid = resolveMeshGrid(mesh)
  const segments: number[][] = []

  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE - 1; j++) {
      segments.push([
        grid[i][j][0],
        grid[i][j][1],
        grid[i][j + 1][0],
        grid[i][j + 1][1],
      ])
    }
  }
  for (let j = 0; j < GRID_SIZE; j++) {
    for (let i = 0; i < GRID_SIZE - 1; i++) {
      segments.push([
        grid[i][j][0],
        grid[i][j][1],
        grid[i + 1][j][0],
        grid[i + 1][j][1],
      ])
    }
  }

  const boundaryVertices: Array<{ row: number; col: number; vertex: MeshVertex }> = []
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (isBoundary(i, j)) boundaryVertices.push({ row: i, col: j, vertex: mesh.vertices[i][j] })
    }
  }

  return (
    <Group>
      {segments.map((points, idx) => (
        <Line
          key={idx}
          points={points}
          stroke="rgba(251, 191, 36, 0.75)"
          strokeWidth={1.5 / scale}
          listening={false}
        />
      ))}
      {boundaryVertices.map(({ row, col, vertex }) => (
        <BoundaryVertexControl
          key={`${row}-${col}`}
          row={row}
          col={col}
          vertex={vertex}
          scale={scale}
          onUpdate={(v) => onUpdateVertex(row, col, v)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </Group>
  )
}

function BoundaryVertexControl({
  row,
  col,
  vertex,
  scale,
  onUpdate,
  onDragStart,
  onDragEnd,
}: {
  row: number
  col: number
  vertex: MeshVertex
  scale: number
  onUpdate: (v: MeshVertex) => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const r = 7 / scale
  const hr = 5 / scale
  const showH = row === 0 || row === GRID_SIZE - 1
  const showV = col === 0 || col === GRID_SIZE - 1

  const hHandle = showH && vertex.tangentH ? handlePosition(vertex, 'h') : null
  const vHandle = showV && vertex.tangentV ? handlePosition(vertex, 'v') : null

  return (
    <Group>
      {hHandle && (
        <>
          <Line
            points={[vertex.position[0], vertex.position[1], hHandle[0], hHandle[1]]}
            stroke="rgba(251, 191, 36, 0.5)"
            strokeWidth={1 / scale}
            listening={false}
          />
          <TangentHandle
            x={hHandle[0]}
            y={hHandle[1]}
            radius={hr}
            scale={scale}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onMove={(x, y) => {
              onUpdate({
                ...vertex,
                tangentH: [x - vertex.position[0], y - vertex.position[1]],
              })
            }}
          />
        </>
      )}
      {vHandle && (
        <>
          <Line
            points={[vertex.position[0], vertex.position[1], vHandle[0], vHandle[1]]}
            stroke="rgba(251, 191, 36, 0.5)"
            strokeWidth={1 / scale}
            listening={false}
          />
          <TangentHandle
            x={vHandle[0]}
            y={vHandle[1]}
            radius={hr}
            scale={scale}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onMove={(x, y) => {
              onUpdate({
                ...vertex,
                tangentV: [x - vertex.position[0], y - vertex.position[1]],
              })
            }}
          />
        </>
      )}
      <Group
        x={vertex.position[0]}
        y={vertex.position[1]}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true
          onDragStart()
        }}
        onDragStart={(e) => {
          e.cancelBubble = true
          onDragStart()
        }}
        onDragMove={(e) => {
          e.cancelBubble = true
          onUpdate({
            ...vertex,
            position: [e.target.x(), e.target.y()],
          })
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true
          onUpdate({
            ...vertex,
            position: [e.target.x(), e.target.y()],
          })
          onDragEnd()
        }}
      >
        <Circle
          radius={r}
          fill="rgba(251, 191, 36, 0.9)"
          stroke="#fff"
          strokeWidth={2 / scale}
        />
      </Group>
    </Group>
  )
}

function TangentHandle({
  x,
  y,
  radius,
  scale,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  x: number
  y: number
  radius: number
  scale: number
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (x: number, y: number) => void
}) {
  return (
    <Group
      x={x}
      y={y}
      draggable
      onMouseDown={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onDragStart={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        onMove(e.target.x(), e.target.y())
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onMove(e.target.x(), e.target.y())
        onDragEnd()
      }}
    >
      <Circle
        radius={radius}
        fill="rgba(251, 191, 36, 0.6)"
        stroke="#fbbf24"
        strokeWidth={1.5 / scale}
      />
    </Group>
  )
}
