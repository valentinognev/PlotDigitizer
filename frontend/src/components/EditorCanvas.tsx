import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, Image as KonvaImage, Layer, Rect, Stage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Curve, Point } from '../types'

interface Props {
  imageUrl: string | null
  width: number
  height: number
  curves: Curve[]
  activeCurveId: string | null
  regionMode: boolean
  onRegion: (bbox: { x: number; y: number; width: number; height: number }) => void
  onAddPoint: (pixel: [number, number]) => void
  onMovePoint: (pointId: string, pixel: [number, number]) => void
  onSelectPoint: (pointId: string | null) => void
  selectedPointId: string | null
  onDeletePoint: (pointId: string) => void
}

export function EditorCanvas({
  imageUrl,
  width,
  height,
  curves,
  activeCurveId,
  regionMode,
  onRegion,
  onAddPoint,
  onMovePoint,
  onSelectPoint,
  selectedPointId,
  onDeletePoint,
}: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewSize, setViewSize] = useState({ w: 800, h: 500 })

  useEffect(() => {
    if (!imageUrl) return
    const img = new window.Image()
    img.src = imageUrl
    img.onload = () => setImage(img)
  }, [imageUrl])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setViewSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setViewSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const toImageCoords = useCallback(
    (stageX: number, stageY: number): [number, number] => {
      const x = (stageX - stagePos.x) / scale
      const y = (stageY - stagePos.y) / scale
      return [x, y]
    },
    [scale, stagePos],
  )

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    if (!stage) return
    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = Math.min(5, Math.max(0.2, oldScale * (1 + direction * 0.1)))
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    }
    setScale(newScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage() && e.target.getClassName() !== 'Image') return
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)
    if (regionMode) return
    if (activeCurveId) onAddPoint([x, y])
    else onSelectPoint(null)
  }

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!regionMode) return
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)
    setDrawing({ x, y })
    setBox(null)
  }

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!drawing || !regionMode) return
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)
    setBox({
      x: Math.min(drawing.x, x),
      y: Math.min(drawing.y, y),
      w: Math.abs(x - drawing.x),
      h: Math.abs(y - drawing.y),
    })
  }

  const handleMouseUp = () => {
    if (box && box.w > 4 && box.h > 4)
      onRegion({ x: box.x, y: box.y, width: box.w, height: box.h })
    setDrawing(null)
    setBox(null)
  }

  const fitScale = Math.min(viewSize.w / Math.max(width, 1), viewSize.h / Math.max(height, 1), 1)

  return (
    <div ref={containerRef} className="h-full w-full rounded-lg border border-slate-700 bg-slate-900">
      <Stage
        width={viewSize.w}
        height={viewSize.h}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        draggable={!regionMode}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={scale * fitScale}
        scaleY={scale * fitScale}
        onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
      >
        <Layer>
          {image && <KonvaImage image={image} width={width} height={height} />}
          {curves.map(
            (curve) =>
              curve.visible &&
              curve.points.map((pt) => (
                <DraggablePoint
                  key={pt.id}
                  point={pt}
                  color={curve.color}
                  selected={selectedPointId === pt.id}
                  onSelect={() => onSelectPoint(pt.id)}
                  onDragEnd={(px) => onMovePoint(pt.id, px)}
                  onDelete={() => onDeletePoint(pt.id)}
                />
              )),
          )}
          {box && (
            <Rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              stroke="#38bdf8"
              dash={[6, 4]}
              strokeWidth={2 / (scale * fitScale)}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

function DraggablePoint({
  point,
  color,
  selected,
  onSelect,
  onDragEnd,
  onDelete,
}: {
  point: Point
  color: string
  selected: boolean
  onSelect: () => void
  onDragEnd: (pixel: [number, number]) => void
  onDelete: () => void
}) {
  return (
    <Circle
      x={point.pixel[0]}
      y={point.pixel[1]}
      radius={selected ? 7 : 5}
      fill={point.origin === 'user' ? '#fbbf24' : color}
      stroke={selected ? '#fff' : '#0f172a'}
      strokeWidth={1.5}
      draggable
      onClick={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onDblClick={(e) => {
        e.cancelBubble = true
        onDelete()
      }}
      onDragEnd={(e) => onDragEnd([e.target.x(), e.target.y()])}
    />
  )
}
