import { Circle, Group, Line } from 'react-konva'
import {
  meshGridSize,
  resolveMeshGrid,
  type MeshGridState,
  type MeshVertex,
} from '../lib/meshWarp'

interface Props {
  mesh: MeshGridState
  scale: number
  onUpdateVertex: (row: number, col: number, vertex: MeshVertex) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function isBoundary(i: number, j: number, size: number): boolean {
  const last = size - 1
  return i === 0 || i === last || j === 0 || j === last
}

export function MeshGridOverlay({
  mesh,
  scale,
  onUpdateVertex,
  onDragStart,
  onDragEnd,
}: Props) {
  const gridSize = meshGridSize(mesh)
  const grid = resolveMeshGrid(mesh)
  const segments: number[][] = []

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize - 1; j++) {
      segments.push([
        grid[i][j][0],
        grid[i][j][1],
        grid[i][j + 1][0],
        grid[i][j + 1][1],
      ])
    }
  }
  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize - 1; i++) {
      segments.push([
        grid[i][j][0],
        grid[i][j][1],
        grid[i + 1][j][0],
        grid[i + 1][j][1],
      ])
    }
  }

  const boundaryVertices: Array<{ row: number; col: number; vertex: MeshVertex }> = []
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (isBoundary(i, j, gridSize)) boundaryVertices.push({ row: i, col: j, vertex: mesh.vertices[i][j] })
    }
  }

  const r = 7 / scale

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
        <Group
          key={`${row}-${col}`}
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
            onUpdateVertex(row, col, {
              ...vertex,
              position: [e.target.x(), e.target.y()],
            })
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            onUpdateVertex(row, col, {
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
      ))}
    </Group>
  )
}
