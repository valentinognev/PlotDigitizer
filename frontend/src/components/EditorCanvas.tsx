import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { getAxisBounds, type AxisBoundKey } from '../lib/transform'
import { AXIS_PLACE_LABELS } from '../lib/calibration'
import {
  isMeshTransform,
  mapAxisBoundToDisplay,
  mapDisplayToAxisBound,
  mapPointToDisplay,
  mapPointToOriginal,
  warpImageMeshToCanvas,
  type CorrectionTransform,
  type MeshGridState,
  type MeshVertex,
} from '../lib/meshWarp'
import { warpImageToCanvas, canvasToDisplayImage, estimatePreviewContentBBox } from '../lib/unskew'
import { MeshGridOverlay } from './MeshGridOverlay'
import type { Calibration, Curve, Point } from '../types'

interface Props {
  imageUrl: string | null
  width: number
  height: number
  correctionTransform?: CorrectionTransform | null
  meshGrid?: MeshGridState | null
  showMeshGrid?: boolean
  onUpdateMeshVertex?: (row: number, col: number, vertex: MeshVertex) => void
  curves: Curve[]
  placementCurveId: string | null
  addPointMode: boolean
  axisPlaceStep: AxisBoundKey | null
  calibration: Calibration | null
  onMoveCalibrationMark: (key: AxisBoundKey, pixel: [number, number]) => void
  onAxisPlaceClick: (pixel: [number, number]) => void
  onAddPoint: (pixel: [number, number]) => void
  onMovePoint: (pointId: string, pixel: [number, number]) => void
  onMovePoints: (moves: Array<{ pointId: string; pixel: [number, number] }>) => void
  onSelectPoint: (pointId: string, additive: boolean) => void
  onSelectPoints: (pointIds: string[], additive: boolean) => void
  onClearSelection: () => void
  selectedPointIds: string[]
  onDeletePoint: (pointId: string) => void
}

type GroupDrag = {
  anchorId: string
  starts: Map<string, [number, number]>
  dx: number
  dy: number
}

type ImageBox = { x: number; y: number; w: number; h: number }

type Marquee = {
  start: [number, number]
  additive: boolean
}

const MARQUEE_MIN = 4

function isBackgroundTarget(target: KonvaEventObject<MouseEvent>['target']) {
  return target === target.getStage() || target.getClassName() === 'Image'
}

function pointsInRect(
  curves: Curve[],
  rect: ImageBox,
  getPixel: (pt: Point) => [number, number],
): string[] {
  const x2 = rect.x + rect.w
  const y2 = rect.y + rect.h
  const ids: string[] = []
  for (const curve of curves) {
    if (!curve.visible) continue
    for (const pt of curve.points) {
      const [px, py] = getPixel(pt)
      if (px >= rect.x && px <= x2 && py >= rect.y && py <= y2) ids.push(pt.id)
    }
  }
  return ids
}

function collectSelectedStarts(
  curves: Curve[],
  selectedPointIds: string[],
  toDisplay: (pixel: [number, number]) => [number, number],
): Map<string, [number, number]> {
  const selected = new Set(selectedPointIds)
  const starts = new Map<string, [number, number]>()
  for (const curve of curves) {
    for (const pt of curve.points) {
      if (selected.has(pt.id)) starts.set(pt.id, toDisplay(pt.pixel))
    }
  }
  return starts
}

export function EditorCanvas({
  imageUrl,
  width,
  height,
  correctionTransform = null,
  meshGrid = null,
  showMeshGrid = false,
  onUpdateMeshVertex,
  curves,
  placementCurveId,
  addPointMode,
  axisPlaceStep,
  calibration,
  onMoveCalibrationMark,
  onAxisPlaceClick,
  onAddPoint,
  onMovePoint,
  onMovePoints,
  onSelectPoint,
  onSelectPoints,
  onClearSelection,
  selectedPointIds,
  onDeletePoint,
}: Props) {
  const axisBounds = calibration ? getAxisBounds(calibration) : null
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [warpedPreviewImage, setWarpedPreviewImage] = useState<HTMLImageElement | null>(null)
  const [warpingPreview, setWarpingPreview] = useState(false)
  const previewReady = !!(correctionTransform && warpedPreviewImage)
  const activeTransform = previewReady ? correctionTransform : null
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageDraggable, setStageDraggable] = useState(true)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [marqueeBox, setMarqueeBox] = useState<ImageBox | null>(null)
  const [groupDrag, setGroupDrag] = useState<GroupDrag | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const konvaImageRef = useRef<Konva.Image>(null)
  const previewFramedRef = useRef(false)
  const spaceDownRef = useRef(false)
  const [spacePan, setSpacePan] = useState(false)
  const suppressNextClickRef = useRef(false)
  const middlePanRef = useRef<{
    pointerX: number
    pointerY: number
    stageX: number
    stageY: number
  } | null>(null)
  const stagePosRef = useRef(stagePos)
  stagePosRef.current = stagePos
  const [viewSize, setViewSize] = useState({ w: 800, h: 500 })

  const selectedSet = new Set(selectedPointIds)
  const multiSelected = selectedPointIds.length > 1
  const logicalWidth = previewReady ? correctionTransform!.width : width
  const logicalHeight = previewReady ? correctionTransform!.height : height
  const texScaleX =
    previewReady && warpedPreviewImage ? warpedPreviewImage.naturalWidth / logicalWidth : 1
  const texScaleY =
    previewReady && warpedPreviewImage ? warpedPreviewImage.naturalHeight / logicalHeight : 1
  const displayWidth = previewReady && warpedPreviewImage ? warpedPreviewImage.naturalWidth : width
  const displayHeight = previewReady && warpedPreviewImage ? warpedPreviewImage.naturalHeight : height
  const fitScale = Math.min(
    viewSize.w / Math.max(displayWidth, 1),
    viewSize.h / Math.max(displayHeight, 1),
    1,
  )
  const contentBBox = useMemo(() => {
    if (!previewReady || !warpedPreviewImage || !correctionTransform) return null
    const logical = estimatePreviewContentBBox(
      warpedPreviewImage,
      Math.round(logicalWidth),
      Math.round(logicalHeight),
    )
    if (!logical) return null
    return {
      x: logical.x * texScaleX,
      y: logical.y * texScaleY,
      w: logical.w * texScaleX,
      h: logical.h * texScaleY,
      frac: logical.frac,
    }
  }, [previewReady, warpedPreviewImage, correctionTransform, logicalWidth, logicalHeight, texScaleX, texScaleY])
  const CONTENT_PAD = 24
  const correctionFitScale = useMemo(() => {
    if (!previewReady || !correctionTransform || !contentBBox) return null
    return Math.min(
      viewSize.w / Math.max(contentBBox.w + CONTENT_PAD * 2, 1),
      viewSize.h / Math.max(contentBBox.h + CONTENT_PAD * 2, 1),
      1,
    )
  }, [previewReady, correctionTransform, contentBBox, viewSize])
  const activeFitScale = correctionFitScale ?? fitScale
  const totalScale = scale * activeFitScale

  const toLayerCoords = useCallback(
    (logical: [number, number]): [number, number] => [
      logical[0] * texScaleX,
      logical[1] * texScaleY,
    ],
    [texScaleX, texScaleY],
  )

  const toDisplayCoords = useCallback(
    (original: [number, number]): [number, number] =>
      toLayerCoords(mapPointToDisplay(original, activeTransform)),
    [activeTransform, toLayerCoords],
  )

  const toOriginalCoords = useCallback(
    (layer: [number, number]): [number, number] => {
      const logical: [number, number] = [layer[0] / texScaleX, layer[1] / texScaleY]
      return mapPointToOriginal(logical, activeTransform)
    },
    [activeTransform, texScaleX, texScaleY],
  )

  const axisMarkToLayer = useCallback(
    (key: AxisBoundKey, pixel: [number, number]): [number, number] => {
      if (!previewReady || !calibration || !correctionTransform || !isMeshTransform(correctionTransform)) {
        return toDisplayCoords(pixel)
      }
      return toLayerCoords(mapAxisBoundToDisplay(key, pixel, calibration, correctionTransform))
    },
    [previewReady, calibration, correctionTransform, toDisplayCoords, toLayerCoords],
  )

  const axisMarkFromLayer = useCallback(
    (key: AxisBoundKey, layer: [number, number]): [number, number] => {
      if (!previewReady || !calibration || !correctionTransform || !isMeshTransform(correctionTransform)) {
        return toOriginalCoords(layer)
      }
      const logical: [number, number] = [layer[0] / texScaleX, layer[1] / texScaleY]
      return mapDisplayToAxisBound(key, logical, calibration, correctionTransform)
    },
    [previewReady, calibration, correctionTransform, toOriginalCoords, texScaleX, texScaleY],
  )

  useEffect(() => {
    if (!imageUrl) return
    const img = new window.Image()
    img.src = imageUrl
    img.onload = () => setImage(img)
  }, [imageUrl])

  useEffect(() => {
    if (!image || !correctionTransform) {
      setWarpedPreviewImage(null)
      setWarpingPreview(false)
      return
    }
    setWarpedPreviewImage(null)
    setWarpingPreview(true)
    let cancelled = false
    const useMesh = isMeshTransform(correctionTransform)
    void (async () => {
      try {
        const sourceSize = { width, height }
        const canvas = useMesh
          ? await warpImageMeshToCanvas(image, correctionTransform, sourceSize)
          : await warpImageToCanvas(image, correctionTransform, sourceSize)
        if (cancelled) return
        const previewImg = await canvasToDisplayImage(canvas)
        if (cancelled) return
        setWarpedPreviewImage(previewImg)
      } catch (err) {
        if (cancelled) return
        setWarpedPreviewImage(null)
      } finally {
        if (!cancelled) setWarpingPreview(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [image, correctionTransform, width, height])

  useEffect(() => {
    previewFramedRef.current = false
    setStagePos({ x: 0, y: 0 })
    setScale(1)
  }, [imageUrl, width, height, correctionTransform])

  useEffect(() => {
    if (!previewReady || !warpedPreviewImage || !correctionTransform || !contentBBox || !correctionFitScale)
      return
    if (previewFramedRef.current) return
    previewFramedRef.current = true
    const cx = contentBBox.x + contentBBox.w / 2
    const cy = contentBBox.y + contentBBox.h / 2
    setScale(1)
    setStagePos({
      x: viewSize.w / 2 - cx * correctionFitScale,
      y: viewSize.h / 2 - cy * correctionFitScale,
    })
  }, [previewReady, warpedPreviewImage, correctionTransform, contentBBox, correctionFitScale, viewSize])

  useEffect(() => {
    konvaImageRef.current?.getLayer()?.batchDraw()
  }, [warpedPreviewImage, image, correctionTransform])

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        spaceDownRef.current = true
        setSpacePan(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false
        setSpacePan(false)
      }
    }
    const onBlur = () => {
      spaceDownRef.current = false
      setSpacePan(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    if (addPointMode && !spaceDownRef.current) setStageDraggable(false)
    else if (!addPointMode) setStageDraggable(true)
  }, [addPointMode])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      middlePanRef.current = {
        pointerX: e.clientX - rect.left,
        pointerY: e.clientY - rect.top,
        stageX: stagePosRef.current.x,
        stageY: stagePosRef.current.y,
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const pan = middlePanRef.current
      if (!pan) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setStagePos({
        x: pan.stageX + (x - pan.pointerX),
        y: pan.stageY + (y - pan.pointerY),
      })
    }

    const endMiddlePan = (e: MouseEvent) => {
      if (e.button === 1) middlePanRef.current = null
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', endMiddlePan)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', endMiddlePan)
    }
  }, [])

  const toImageCoords = useCallback(
    (stageX: number, stageY: number): [number, number] => {
      const x = (stageX - stagePos.x) / totalScale
      const y = (stageY - stagePos.y) / totalScale
      return [x, y]
    },
    [totalScale, stagePos],
  )

  const displayPixel = useCallback(
    (pt: Point): [number, number] => {
      const base = toDisplayCoords(pt.pixel)
      if (!groupDrag || !selectedPointIds.includes(pt.id)) return base
      const start = groupDrag.starts.get(pt.id)
      if (!start) return base
      return [start[0] + groupDrag.dx, start[1] + groupDrag.dy]
    },
    [groupDrag, selectedPointIds, toDisplayCoords],
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
    const oldTotalScale = oldScale * activeFitScale
    const newTotalScale = newScale * activeFitScale
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
    if (!isBackgroundTarget(e.target)) return
    if (e.evt.button !== 0) return

    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)

    const panGesture = spaceDownRef.current
    if (panGesture) {
      setStageDraggable(true)
      return
    }
    if (axisPlaceStep) {
      onAxisPlaceClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (addPointMode && placementCurveId) {
      onAddPoint(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }

    setMarquee({
      start: [x, y],
      additive: e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey,
    })
    setMarqueeBox(null)
    setStageDraggable(false)
  }

  const handleStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return
    setStagePos({ x: e.target.x(), y: e.target.y() })
    setStageDraggable(true)
  }

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    if (e.target.getClassName() === 'Text') return
    if (!isBackgroundTarget(e.target)) return
    if (axisPlaceStep || addPointMode) return
    onClearSelection()
  }

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)

    if (!marquee) return
    setMarqueeBox({
      x: Math.min(marquee.start[0], x),
      y: Math.min(marquee.start[1], y),
      w: Math.abs(x - marquee.start[0]),
      h: Math.abs(y - marquee.start[1]),
    })
  }

  const handleMouseUp = () => {
    if (marqueeBox && marqueeBox.w > MARQUEE_MIN && marqueeBox.h > MARQUEE_MIN && marquee) {
      const ids = pointsInRect(curves, marqueeBox, (pt) => toDisplayCoords(pt.pixel))
      if (ids.length) onSelectPoints(ids, marquee.additive)
      else if (!marquee.additive) onClearSelection()
      suppressNextClickRef.current = true
    }
    setMarquee(null)
    setMarqueeBox(null)
    setStageDraggable(!addPointMode && !axisPlaceStep && spaceDownRef.current)
  }

  const prepareGroupDrag = (pt: Point) => {
    if (!selectedSet.has(pt.id) || !multiSelected) return
    setGroupDrag({
      anchorId: pt.id,
      starts: collectSelectedStarts(curves, selectedPointIds, toDisplayCoords),
      dx: 0,
      dy: 0,
    })
  }

  const handlePointPointerDown = (pt: Point, e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return
    e.cancelBubble = true
    const additive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey
    if (additive) {
      onSelectPoint(pt.id, true)
      return
    }
    if (!selectedSet.has(pt.id)) {
      onSelectPoint(pt.id, false)
      return
    }
    setStageDraggable(false)
    prepareGroupDrag(pt)
  }

  const movePointDrag = (pt: Point, e: KonvaEventObject<DragEvent>) => {
    if (!groupDrag || pt.id !== groupDrag.anchorId) return
    const start = groupDrag.starts.get(pt.id)
    if (!start) return
    const dx = e.target.x() - start[0]
    const dy = e.target.y() - start[1]
    setGroupDrag((current) => (current ? { ...current, dx, dy } : null))
    e.target.position({ x: start[0] + dx, y: start[1] + dy })
  }

  const endPointDrag = (pt: Point, e: KonvaEventObject<DragEvent>) => {
    setStageDraggable(true)
    if (groupDrag && selectedSet.has(pt.id) && multiSelected) {
      const moves = selectedPointIds
        .map((id) => {
          const start = groupDrag.starts.get(id)
          if (!start) return null
          return {
            pointId: id,
            pixel: toOriginalCoords([
              start[0] + groupDrag.dx,
              start[1] + groupDrag.dy,
            ] as [number, number]),
          }
        })
        .filter((m): m is { pointId: string; pixel: [number, number] } => m !== null)
      setGroupDrag(null)
      onMovePoints(moves)
      return
    }
    setGroupDrag(null)
    onMovePoint(pt.id, toOriginalCoords([e.target.x(), e.target.y()]))
  }

  const imageSource = previewReady ? warpedPreviewImage : image
  const previewImageKey = previewReady
    ? `warped-${warpedPreviewImage!.naturalWidth}x${warpedPreviewImage!.naturalHeight}`
    : 'original'

  return (
    <div className="flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <PlotInteractionHint
        addPointMode={addPointMode}
        axisPlaceStep={axisPlaceStep}
        correctionPreview={previewReady}
        warpingPreview={warpingPreview}
        meshEditing={showMeshGrid}
      />
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
      <Stage
        width={viewSize.w}
        height={viewSize.h}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        draggable={stageDraggable && (!addPointMode || spacePan) && !axisPlaceStep}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={totalScale}
        scaleY={totalScale}
        onDragEnd={handleStageDragEnd}
      >
        <Layer onMouseDown={handleStageMouseDown}>
          {imageSource && (
            <KonvaImage
              ref={konvaImageRef}
              key={previewImageKey}
              image={imageSource}
              width={displayWidth}
              height={displayHeight}
            />
          )}
          {curves.map(
            (curve) =>
              curve.visible &&
              curve.points.map((pt) => {
                const [px, py] = displayPixel(pt)
                return (
                  <DraggablePoint
                    key={pt.id}
                    x={px}
                    y={py}
                    point={pt}
                    color={curve.color}
                    selected={selectedSet.has(pt.id)}
                    scale={totalScale}
                    onPointerDown={(e) => handlePointPointerDown(pt, e)}
                    onDragStart={() => {
                      setStageDraggable(false)
                      prepareGroupDrag(pt)
                    }}
                    onDragMove={(e) => movePointDrag(pt, e)}
                    onDragEnd={(e) => endPointDrag(pt, e)}
                    onDelete={() => onDeletePoint(pt.id)}
                  />
                )
              }),
          )}
          {marqueeBox && (
            <Rect
              x={marqueeBox.x}
              y={marqueeBox.y}
              width={marqueeBox.w}
              height={marqueeBox.h}
              stroke="#fbbf24"
              dash={[4, 4]}
              strokeWidth={2 / totalScale}
              fill="rgba(251, 191, 36, 0.12)"
            />
          )}
          {axisBounds &&
            (Object.entries(axisBounds) as [AxisBoundKey, (typeof axisBounds)['xmin']][]).map(
              ([key, bound]) => (
                <CalibrationMark
                  key={key}
                  label={key.toUpperCase()}
                  pixel={axisMarkToLayer(key, bound.pixel)}
                  color={key.startsWith('x') ? '#22d3ee' : '#e879f9'}
                  scale={totalScale}
                  active={axisPlaceStep === key}
                  onDragStart={() => setStageDraggable(false)}
                  onDragEnd={(px) => {
                    setStageDraggable(true)
                    onMoveCalibrationMark(key, axisMarkFromLayer(key, px))
                  }}
                />
              ),
            )}
          {showMeshGrid && meshGrid && onUpdateMeshVertex && (
            <MeshGridOverlay
              mesh={meshGrid}
              scale={totalScale}
              onUpdateVertex={onUpdateMeshVertex}
              onDragStart={() => setStageDraggable(false)}
              onDragEnd={() => setStageDraggable(true)}
            />
          )}
        </Layer>
      </Stage>
      </div>
    </div>
  )
}

function PlotInteractionHint({
  addPointMode,
  axisPlaceStep,
  correctionPreview,
  warpingPreview,
  meshEditing,
}: {
  addPointMode: boolean
  axisPlaceStep: AxisBoundKey | null
  correctionPreview?: boolean
  warpingPreview?: boolean
  meshEditing?: boolean
}) {
  let text: string
  const panHint = 'Middle-drag or Space + left-drag: pan · Wheel: zoom'
  if (axisPlaceStep) {
    text = `Click on the plot: ${AXIS_PLACE_LABELS[axisPlaceStep]} · ${panHint}`
  } else if (addPointMode) {
    text = `Left-click to place points on the first visible curve. Delete/Backspace: undo last point. ${panHint}`
  } else if (meshEditing) {
    text = `Drag boundary vertices to match plot curvature · Drag tangent handles to adjust edge direction · ${panHint}`
  } else {
    text = `Left-click point: select · Shift/Ctrl + click: add/remove from selection · Left-drag empty area: box-select · Shift/Ctrl + drag box: add to selection · Drag selected point(s): move · Delete/Backspace or double-click: delete · Left-click empty: clear selection · ${panHint}`
  }
  if (warpingPreview) text = `Building correction preview… · ${text}`
  else if (correctionPreview) text = `Correction preview · ${text}`

  return (
    <p
      className="shrink-0 border-b border-slate-700/80 bg-slate-800/90 px-2 py-1.5 text-[10px] leading-snug text-slate-400"
      title={text}
    >
      {text}
    </p>
  )
}

function CalibrationMark({
  label,
  pixel,
  color,
  scale,
  active,
  onDragStart,
  onDragEnd,
}: {
  label: string
  pixel: [number, number]
  color: string
  scale: number
  active?: boolean
  onDragStart: () => void
  onDragEnd: (pixel: [number, number]) => void
}) {
  const r = (active ? 10 : 8) / scale
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
      <Circle
        radius={r}
        fill={color}
        stroke={active ? '#fbbf24' : '#fff'}
        strokeWidth={(active ? 3 : 2) / scale}
      />
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
  x,
  y,
  point,
  color,
  selected,
  scale,
  onPointerDown,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDelete,
}: {
  x: number
  y: number
  point: Point
  color: string
  selected: boolean
  scale: number
  onPointerDown: (e: KonvaEventObject<MouseEvent>) => void
  onDragStart: () => void
  onDragMove: (e: KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void
  onDelete: () => void
}) {
  const radius = (selected ? 7 : 5) / scale
  const stroke = selected ? '#fff' : color
  const showUserRing = point.origin === 'user' && !selected
  const strokeWidth = (selected ? 2.5 : 2) / scale

  return (
    <Group
      x={x}
      y={y}
      draggable
      onMouseDown={onPointerDown}
      onDblClick={(e) => {
        e.cancelBubble = true
        onDelete()
      }}
      onDragStart={(e) => {
        e.cancelBubble = true
        onDragStart()
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        onDragMove(e)
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onDragEnd(e)
      }}
    >
      {showUserRing && (
        <Circle
          radius={radius + 2 / scale}
          stroke="#fbbf24"
          strokeWidth={1.5 / scale}
          fill="transparent"
          listening={false}
        />
      )}
      <Circle
        radius={radius}
        fill="transparent"
        stroke={stroke}
        strokeWidth={strokeWidth}
        hitStrokeWidth={14 / scale}
      />
    </Group>
  )
}
