import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { getAxisBounds, type AxisBoundKey } from '../lib/transform'
import type { Calibration, Curve, Point } from '../types'

interface Props {
  imageUrl: string | null
  width: number
  height: number
  curves: Curve[]
  activeCurveId: string | null
  regionMode: boolean
  calibration: Calibration | null
  manualCalibration: boolean
  onMoveCalibrationMark: (key: AxisBoundKey, pixel: [number, number]) => void
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
  calibration,
  manualCalibration,
  onMoveCalibrationMark,
  onRegion,
  onAddPoint,
  onMovePoint,
  onSelectPoint,
  selectedPointId,
  onDeletePoint,
}: Props) {
  const axisBounds =
    manualCalibration && calibration ? getAxisBounds(calibration) : null
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageDraggable, setStageDraggable] = useState(true)
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewSize, setViewSize] = useState({ w: 800, h: 500 })

  const fitScale = Math.min(viewSize.w / Math.max(width, 1), viewSize.h / Math.max(height, 1), 1)
  const totalScale = scale * fitScale

  useEffect(() => {
    if (!imageUrl) return
    const img = new window.Image()
    img.src = imageUrl
    img.onload = () => setImage(img)
  }, [imageUrl])

  useEffect(() => {
    setStagePos({ x: 0, y: 0 })
    setScale(1)
  }, [imageUrl, width, height])

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
      const x = (stageX - stagePos.x) / totalScale
      const y = (stageY - stagePos.y) / totalScale
      return [x, y]
    },
    [totalScale, stagePos],
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
    const oldTotalScale = oldScale * fitScale
    const newTotalScale = newScale * fitScale
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldTotalScale,
      y: (pointer.y - stagePos.y) / oldTotalScale,
    }
    setScale(newScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * newTotalScale,
      y: pointer.y - mousePointTo.y * newTotalScale,
    })
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (regionMode) return
    const onBackground =
      e.target === e.target.getStage() || e.target.getClassName() === 'Image'
    setStageDraggable(onBackground)
  }

  const handleStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return
    setStagePos({ x: e.target.x(), y: e.target.y() })
    setStageDraggable(true)
  }

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target.getClassName() === 'Text') return
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

  return (
    <div
      ref={containerRef}
      className="h-full max-h-full min-h-0 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
    >
      <Stage
        width={viewSize.w}
        height={viewSize.h}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        draggable={stageDraggable && !regionMode}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={totalScale}
        scaleY={totalScale}
        onDragEnd={handleStageDragEnd}
      >
        <Layer onMouseDown={handleStageMouseDown}>
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
                  onDragStart={() => setStageDraggable(false)}
                  onDragEnd={(px) => {
                    setStageDraggable(true)
                    onMovePoint(pt.id, px)
                  }}
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
              strokeWidth={2 / totalScale}
            />
          )}
          {axisBounds &&
            (Object.entries(axisBounds) as [AxisBoundKey, (typeof axisBounds)['xmin']][]).map(
              ([key, bound]) => (
                <CalibrationMark
                  key={`${key}-${bound.pixel[0]}-${bound.pixel[1]}`}
                  label={key.toUpperCase()}
                  pixel={bound.pixel}
                  color={key.startsWith('x') ? '#22d3ee' : '#e879f9'}
                  scale={totalScale}
                  onDragStart={() => setStageDraggable(false)}
                  onDragEnd={(px) => {
                    setStageDraggable(true)
                    onMoveCalibrationMark(key, px)
                  }}
                />
              ),
            )}
        </Layer>
      </Stage>
    </div>
  )
}

function CalibrationMark({
  label,
  pixel,
  color,
  scale,
  onDragStart,
  onDragEnd,
}: {
  label: string
  pixel: [number, number]
  color: string
  scale: number
  onDragStart: () => void
  onDragEnd: (pixel: [number, number]) => void
}) {
  const r = 8
  const fontSize = 11 / scale
  return (
    <Group
      x={pixel[0]}
      y={pixel[1]}
      draggable
      onMouseDown={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onDragStart={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onDragEnd([e.target.x(), e.target.y()])
      }}
    >
      <Circle radius={r} fill={color} stroke="#fff" strokeWidth={2 / scale} />
      <Text
        x={r + 2 / scale}
        y={-fontSize / 2}
        text={label}
        fontSize={fontSize}
        fill={color}
        listening={false}
      />
    </Group>
  )
}

function DraggablePoint({
  point,
  color,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  onDelete,
}: {
  point: Point
  color: string
  selected: boolean
  onSelect: () => void
  onDragStart: () => void
  onDragEnd: (pixel: [number, number]) => void
  onDelete: () => void
}) {
  return (
    <Circle
      x={point.pixel[0]}
      y={point.pixel[1]}
      radius={selected ? 7 : 5}
      fill={color}
      stroke={selected ? '#fff' : point.origin === 'user' ? '#fbbf24' : '#0f172a'}
      strokeWidth={1.5}
      draggable
      onMouseDown={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onClick={(e) => {
        e.cancelBubble = true
        onSelect()
      }}
      onDblClick={(e) => {
        e.cancelBubble = true
        onDelete()
      }}
      onDragStart={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onDragEnd([e.target.x(), e.target.y()])
      }}
    />
  )
}
