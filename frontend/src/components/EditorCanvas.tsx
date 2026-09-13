import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { calibrationMarkVisual } from '../lib/calibrationMark'
import { getAxisBounds, type AxisBoundKey } from '../lib/transform'
import { AXIS_PLACE_LABELS, showFourBoundMarks } from '../lib/calibration'
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
import { AxesCheckerOverlay } from './AxesCheckerOverlay'
import { MaskOverlay } from './MaskOverlay'
import { CandidateOverlay } from './CandidateOverlay'
import type { MaskView } from './FilterPanel'
import type { SegmentLite } from '../lib/segments'
import { flattenPolyline, nearestSegment } from '../lib/segments'
import { boxFromDrag, isMaskCanvasMode } from '../lib/regionMask'
import { IDLE_CURSOR_READOUT } from '../lib/cursorReadout'
import { hoverPixelFromClient } from '../lib/magnifier'
import type { Calibration, CanvasMode, Curve, MatchCandidate, Point, RegionBox } from '../types'

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
  canvasMode: CanvasMode
  candidates?: MatchCandidate[]
  onPointMatchSample: (pixel: [number, number]) => void
  onPointMatchAcceptCurrent: () => void
  onPointMatchRejectCurrent: () => void
  onAxisPointClick?: (pixel: [number, number]) => void
  onMoveAxisPoint?: (id: string, pixel: [number, number]) => void
  onMoveScaleBar?: (which: 'a' | 'b', pixel: [number, number]) => void
  showAxesChecker?: boolean
  axesCheckerChangedAt?: number
  axesCheckerNow?: number
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
  onPickColor?: (pixel: [number, number]) => void
  maskUrl?: string | null
  maskView?: MaskView
  segments: SegmentLite[]
  onSegmentFillClick: (pixel: [number, number]) => void
  onAddRegionBox?: (box: RegionBox) => void
  onAddRegionStroke?: (mode: 'pen' | 'erase', points: [number, number][]) => void
  onHoverPixel: (pixel: [number, number] | null) => void
  cursorReadout?: string
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
  canvasMode,
  candidates,
  onPointMatchSample,
  onPointMatchAcceptCurrent,
  onPointMatchRejectCurrent,
  onAxisPointClick,
  onMoveAxisPoint,
  onMoveScaleBar,
  showAxesChecker,
  axesCheckerChangedAt,
  axesCheckerNow,
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
  onPickColor,
  maskUrl = null,
  maskView = 'none',
  segments,
  onSegmentFillClick,
  onAddRegionBox,
  onAddRegionStroke,
  onHoverPixel,
  cursorReadout,
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
  const [hoverSegIndex, setHoverSegIndex] = useState<number | null>(null)
  const [maskBox, setMaskBox] = useState<ImageBox | null>(null)
  const [maskStroke, setMaskStroke] = useState<[number, number][] | null>(null)
  const maskBoxStartRef = useRef<[number, number] | null>(null)
  const objectDragRef = useRef(false)
  const filling = canvasMode === 'segment-fill'
  const masking = isMaskCanvasMode(canvasMode)

  useEffect(() => {
    if (!filling) setHoverSegIndex(null)
  }, [filling])

  useEffect(() => {
    if (masking) return
    setMaskBox(null)
    setMaskStroke(null)
    maskBoxStartRef.current = null
  }, [masking])

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
    setStageDraggable(canvasMode === 'select' || spaceDownRef.current)
  }, [canvasMode])

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

  const syncHoverFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return
      onHoverPixel(
        hoverPixelFromClient(
          clientX,
          clientY,
          el.getBoundingClientRect(),
          stagePos,
          totalScale,
          toOriginalCoords,
        ),
      )
    },
    [onHoverPixel, stagePos, totalScale, toOriginalCoords],
  )

  const clearHoverIfIdle = useCallback(
    (buttons: number) => {
      if (buttons) return
      onHoverPixel(null)
    },
    [onHoverPixel],
  )

  const alignObjectDrag = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      objectDragRef.current = true
      const stage = e.target.getStage()
      const pos = stage?.getPointerPosition()
      if (!pos) {
        onHoverPixel(toOriginalCoords([e.target.x(), e.target.y()]))
        return
      }
      const layer = toImageCoords(pos.x, pos.y)
      e.target.position({ x: layer[0], y: layer[1] })
      onHoverPixel(toOriginalCoords(layer))
    },
    [onHoverPixel, toImageCoords, toOriginalCoords],
  )

  const endObjectDrag = useCallback(() => {
    objectDragRef.current = false
  }, [])

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
    if (!masking && !isBackgroundTarget(e.target)) return
    if (e.evt.button !== 0 && !(canvasMode === 'point-match' && e.evt.button === 2)) return

    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)

    const panGesture = spaceDownRef.current
    if (panGesture) {
      setStageDraggable(true)
      return
    }
    if (canvasMode === 'mask-box') {
      maskBoxStartRef.current = [x, y]
      setMaskBox({ x, y, w: 0, h: 0 })
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'mask-pen' || canvasMode === 'mask-erase') {
      setMaskStroke([[x, y]])
      setStageDraggable(false)
      return
    }
    if (filling) {
      onSegmentFillClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (axisPlaceStep) {
      onAxisPlaceClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'axis' && onAxisPointClick) {
      onAxisPointClick(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'point-match') {
      const original = toOriginalCoords([x, y])
      if (e.evt.button === 2) {
        onPointMatchRejectCurrent()
        setStageDraggable(false)
        return
      }
      if ((candidates?.length ?? 0) > 0) {
        onPointMatchAcceptCurrent()
      } else {
        onPointMatchSample(original)
      }
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'place' && placementCurveId) {
      onAddPoint(toOriginalCoords([x, y]))
      setStageDraggable(false)
      return
    }
    if (canvasMode === 'pick-color' && onPickColor) {
      onPickColor(toOriginalCoords([x, y]))
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
    if (axisPlaceStep || canvasMode !== 'select') return
    onClearSelection()
  }

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!pos) return
    const [x, y] = toImageCoords(pos.x, pos.y)
    if (!objectDragRef.current) onHoverPixel(toOriginalCoords([x, y]))

    if (filling) {
      const hit = nearestSegment(segments, toOriginalCoords([x, y]), 12)
      setHoverSegIndex(hit ? hit.index : null)
      return
    }

    if (canvasMode === 'mask-box' && maskBoxStartRef.current) {
      setMaskBox(boxFromDrag(maskBoxStartRef.current, [x, y]))
      return
    }
    if (maskStroke) {
      setMaskStroke((prev) => (prev ? [...prev, [x, y]] : prev))
      return
    }

    if (!marquee) return
    setMarqueeBox({
      x: Math.min(marquee.start[0], x),
      y: Math.min(marquee.start[1], y),
      w: Math.abs(x - marquee.start[0]),
      h: Math.abs(y - marquee.start[1]),
    })
  }

  const handleMouseUp = () => {
    if (canvasMode === 'mask-box' && maskBox && maskBoxStartRef.current) {
      if (maskBox.w > MARQUEE_MIN && maskBox.h > MARQUEE_MIN) {
        const a = toOriginalCoords([maskBox.x, maskBox.y])
        const b = toOriginalCoords([maskBox.x + maskBox.w, maskBox.y + maskBox.h])
        onAddRegionBox?.(boxFromDrag(a, b))
        suppressNextClickRef.current = true
      }
      setMaskBox(null)
      maskBoxStartRef.current = null
    }
    if (maskStroke && (canvasMode === 'mask-pen' || canvasMode === 'mask-erase')) {
      const mode = canvasMode === 'mask-erase' ? 'erase' : 'pen'
      if (maskStroke.length >= 1) {
        onAddRegionStroke?.(
          mode,
          maskStroke.map((p) => toOriginalCoords(p)),
        )
        suppressNextClickRef.current = true
      }
      setMaskStroke(null)
    }
    if (marqueeBox && marqueeBox.w > MARQUEE_MIN && marqueeBox.h > MARQUEE_MIN && marquee) {
      const ids = pointsInRect(curves, marqueeBox, (pt) => toDisplayCoords(pt.pixel))
      if (ids.length) onSelectPoints(ids, marquee.additive)
      else if (!marquee.additive) onClearSelection()
      suppressNextClickRef.current = true
    }
    setMarquee(null)
    setMarqueeBox(null)
    setStageDraggable(
      !filling && !masking && canvasMode !== 'place' && !axisPlaceStep && spaceDownRef.current,
    )
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
    alignObjectDrag(e)
    if (!groupDrag || pt.id !== groupDrag.anchorId) return
    const start = groupDrag.starts.get(pt.id)
    if (!start) return
    const dx = e.target.x() - start[0]
    const dy = e.target.y() - start[1]
    setGroupDrag((current) => (current ? { ...current, dx, dy } : null))
    e.target.position({ x: start[0] + dx, y: start[1] + dy })
  }

  const endPointDrag = (pt: Point, e: KonvaEventObject<DragEvent>) => {
    endObjectDrag()
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
        canvasMode={canvasMode}
        axisPlaceStep={axisPlaceStep}
        correctionPreview={previewReady}
        warpingPreview={warpingPreview}
        meshEditing={showMeshGrid}
        segmentFill={filling}
        cursorReadout={cursorReadout}
      />
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden"
        onPointerMove={(e) => {
          if (objectDragRef.current) return
          syncHoverFromClient(e.clientX, e.clientY)
        }}
        onPointerLeave={(e) => clearHoverIfIdle(e.buttons)}
      >
      <Stage
        width={viewSize.w}
        height={viewSize.h}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={(e) => clearHoverIfIdle(e.evt.buttons)}
        onMouseUp={handleMouseUp}
        draggable={
          stageDraggable && (canvasMode === 'select' || spacePan) && !axisPlaceStep && !filling && !masking
        }
        x={stagePos.x}
        y={stagePos.y}
        scaleX={totalScale}
        scaleY={totalScale}
        onDragEnd={handleStageDragEnd}
        onContextMenu={(e) => {
          e.evt.preventDefault()
        }}
      >
        <Layer onMouseDown={handleStageMouseDown}>
          {imageSource && maskView !== 'mask' && (
            <KonvaImage
              ref={konvaImageRef}
              key={previewImageKey}
              image={imageSource}
              width={displayWidth}
              height={displayHeight}
            />
          )}
          {maskUrl && maskView !== 'none' && (
            <MaskOverlay
              url={maskUrl}
              width={displayWidth}
              height={displayHeight}
              opacity={maskView === 'mask' ? 1 : 0.45}
            />
          )}
          {curves.map((curve) => {
            if (!curve.visible) return null
            const pts = curve.points.map((pt) => displayPixel(pt)).flat()
            const isScatter = curve.connect_as === 'scatter'
            return (
              <Group key={curve.id} listening={!masking}>
                {!isScatter && pts.length >= 4 && (
                  <Line
                    points={pts}
                    stroke={curve.color}
                    strokeWidth={1.5 / totalScale}
                    lineJoin="round"
                    lineCap="round"
                    listening={false}
                  />
                )}
                {curve.points.map((pt) => {
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
                      caption={
                        calibration?.coords_type === 'bar' && pt.label ? pt.label : undefined
                      }
                      onPointerDown={(e) => handlePointPointerDown(pt, e)}
                      onDragStart={(e) => {
                        setStageDraggable(false)
                        prepareGroupDrag(pt)
                        alignObjectDrag(e)
                      }}
                      onDragMove={(e) => movePointDrag(pt, e)}
                      onDragEnd={(e) => endPointDrag(pt, e)}
                      onDelete={() => onDeletePoint(pt.id)}
                    />
                  )
                })}
              </Group>
            )
          })}
          {canvasMode === 'point-match' && (candidates?.length ?? 0) > 0 && (
            <CandidateOverlay
              candidates={candidates!}
              scale={totalScale}
              toDisplay={toDisplayCoords}
            />
          )}
          {filling &&
            segments.map((seg) => {
              const pts = flattenPolyline(seg.points.map((p) => toDisplayCoords(p)))
              const active = hoverSegIndex === seg.index
              return (
                <Line
                  key={seg.index}
                  points={pts}
                  stroke={active ? '#38bdf8' : '#38bdf866'}
                  strokeWidth={(active ? 4 : 2) / totalScale}
                  listening={false}
                  lineCap="round"
                  lineJoin="round"
                />
              )
            })}
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
          {maskBox && (
            <Rect
              x={maskBox.x}
              y={maskBox.y}
              width={maskBox.w}
              height={maskBox.h}
              stroke="#22d3ee"
              strokeWidth={2 / totalScale}
              fill="rgba(34, 211, 238, 0.18)"
              listening={false}
            />
          )}
          {maskStroke && maskStroke.length >= 1 && (
            <Line
              points={maskStroke.flat()}
              stroke={canvasMode === 'mask-erase' ? '#fb7185' : '#22d3ee'}
              strokeWidth={3 / totalScale}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}
          {showFourBoundMarks(calibration) &&
            axisBounds &&
            (Object.entries(axisBounds) as [AxisBoundKey, (typeof axisBounds)['xmin']][]).map(
              ([key, bound]) => (
                <CalibrationMark
                  key={key}
                  label={key.toUpperCase()}
                  pixel={axisMarkToLayer(key, bound.pixel)}
                  color={key.startsWith('x') ? '#22d3ee' : '#e879f9'}
                  scale={totalScale}
                  hollow
                  active={axisPlaceStep === key}
                  onDragStart={() => setStageDraggable(false)}
                  onDragMove={alignObjectDrag}
                  onDragEnd={(px) => {
                    endObjectDrag()
                    setStageDraggable(true)
                    onMoveCalibrationMark(key, axisMarkFromLayer(key, px))
                  }}
                />
              ),
            )}
          {(calibration?.coords_type === 'map' || calibration?.coords_type === 'bar'
            ? []
            : (calibration?.axis_points ?? [])
          ).map((pt, i) => (
            <CalibrationMark
              key={pt.id}
              label={`#${i + 1}`}
              pixel={toDisplayCoords(pt.pixel)}
              color="#fbbf24"
              scale={totalScale}
              onDragStart={() => setStageDraggable(false)}
              onDragMove={alignObjectDrag}
              onDragEnd={(px) => {
                endObjectDrag()
                setStageDraggable(true)
                onMoveAxisPoint?.(pt.id, toOriginalCoords(px))
              }}
            />
          ))}
          {calibration?.coords_type === 'map' && calibration.scale_bar && (
            <>
              <CalibrationMark
                label="A"
                pixel={toDisplayCoords(calibration.scale_bar.pixel_a)}
                color="#34d399"
                scale={totalScale}
                active={true}
                onDragStart={() => setStageDraggable(false)}
                onDragMove={alignObjectDrag}
                onDragEnd={(px) => {
                    endObjectDrag()
                    setStageDraggable(true)
                  onMoveScaleBar?.('a', toOriginalCoords(px))
                }}
              />
              <CalibrationMark
                label="B"
                pixel={toDisplayCoords(calibration.scale_bar.pixel_b)}
                color="#34d399"
                scale={totalScale}
                active={true}
                onDragStart={() => setStageDraggable(false)}
                onDragMove={alignObjectDrag}
                onDragEnd={(px) => {
                    endObjectDrag()
                    setStageDraggable(true)
                  onMoveScaleBar?.('b', toOriginalCoords(px))
                }}
              />
            </>
          )}
          {calibration?.coords_type === 'bar' && calibration.y.ref_points[0] && (
            <>
              <CalibrationMark
                label="P1"
                pixel={toDisplayCoords(calibration.y.ref_points[0].pixel)}
                color="#34d399"
                scale={totalScale}
                active={true}
                onDragStart={() => setStageDraggable(false)}
                onDragMove={alignObjectDrag}
                onDragEnd={(px) => {
                    endObjectDrag()
                    setStageDraggable(true)
                  onMoveScaleBar?.('a', toOriginalCoords(px))
                }}
              />
              {calibration.y.ref_points[1] && (
                <CalibrationMark
                  label="P2"
                  pixel={toDisplayCoords(calibration.y.ref_points[1].pixel)}
                  color="#34d399"
                  scale={totalScale}
                  active={true}
                  onDragStart={() => setStageDraggable(false)}
                  onDragMove={alignObjectDrag}
                  onDragEnd={(px) => {
                    endObjectDrag()
                    setStageDraggable(true)
                    onMoveScaleBar?.('b', toOriginalCoords(px))
                  }}
                />
              )}
            </>
          )}
          {showMeshGrid && meshGrid && onUpdateMeshVertex && (
            <MeshGridOverlay
              mesh={meshGrid}
              scale={totalScale}
              onUpdateVertex={onUpdateMeshVertex}
              onDragStart={() => setStageDraggable(false)}
              onHoverFromDrag={alignObjectDrag}
              onDragEnd={() => {
                endObjectDrag()
                setStageDraggable(true)
              }}
            />
          )}
          <AxesCheckerOverlay
            calibration={calibration}
            imageWidth={width}
            imageHeight={height}
            enabled={showAxesChecker ?? true}
            changedAtMs={axesCheckerChangedAt ?? 0}
            nowMs={axesCheckerNow ?? 0}
            scale={totalScale}
          />
        </Layer>
      </Stage>
      </div>
    </div>
  )
}

function PlotInteractionHint({
  canvasMode,
  axisPlaceStep,
  correctionPreview,
  warpingPreview,
  meshEditing,
  segmentFill,
  cursorReadout = IDLE_CURSOR_READOUT,
}: {
  canvasMode: CanvasMode
  axisPlaceStep: AxisBoundKey | null
  correctionPreview?: boolean
  warpingPreview?: boolean
  meshEditing?: boolean
  segmentFill?: boolean
  cursorReadout?: string
}) {
  let text: string
  const panHint = 'Middle-drag or Space + left-drag: pan · Wheel: zoom'
  if (axisPlaceStep) {
    text = `Click on the plot: ${AXIS_PLACE_LABELS[axisPlaceStep]} · ${panHint}`
  } else if (canvasMode === 'pick-color') {
    text = `Click the plot to sample a curve colour. ${panHint}`
  } else if (canvasMode === 'axis') {
    text = `Left-click to place an axis point (type values in the Calibration panel). ${panHint}`
  } else if (canvasMode === 'place') {
    text = `Left-click to place points on the first visible curve. Delete/Backspace: undo last point. ${panHint}`
  } else if (canvasMode === 'point-match') {
    text = `Click a sample marker, then Enter/click accept · Esc/right-click reject · Shift+Enter accept all at/above current score · ${panHint}`
  } else if (canvasMode === 'mask-box') {
    text = `Drag a box to keep that region of the curve mask. Esc: exit. ${panHint}`
  } else if (canvasMode === 'mask-pen') {
    text = `Draw to add ink to the curve region mask. Esc: exit. ${panHint}`
  } else if (canvasMode === 'mask-erase') {
    text = `Draw to erase from the curve region mask. Esc: exit. ${panHint}`
  } else if (segmentFill) {
    text = `Click a highlighted stroke to drop evenly spaced points. Esc: exit. ${panHint}`
  } else if (meshEditing) {
    text = `Drag boundary vertices to match plot curvature · Drag tangent handles to adjust edge direction · ${panHint}`
  } else {
    text = `Left-click point: select · Shift/Ctrl + click: add/remove from selection · Left-drag empty area: box-select · Shift/Ctrl + drag box: add to selection · Drag selected point(s): move · Arrow keys: nudge 1 px (Shift: 10) · Delete/Backspace or double-click: delete · Left-click empty: clear selection · ${panHint}`
  }
  if (warpingPreview) text = `Building correction preview… · ${text}`
  else if (correctionPreview) text = `Correction preview · ${text}`

  return (
    <>
      <p
        className="shrink-0 border-b border-slate-700/80 bg-slate-800/90 px-2 py-1.5 text-[10px] leading-snug text-slate-400"
        title={text}
      >
        {text}
      </p>
      <p className="shrink-0 overflow-hidden border-b border-slate-700/80 bg-slate-800/90 px-2 py-0.5 text-left font-mono text-[10px] tabular-nums whitespace-nowrap text-slate-300">
        {cursorReadout}
      </p>
    </>
  )
}

function CalibrationMark({
  label,
  pixel,
  color,
  scale,
  hollow,
  active,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  label: string
  pixel: [number, number]
  color: string
  scale: number
  hollow?: boolean
  active?: boolean
  onDragStart: () => void
  onDragMove?: (e: KonvaEventObject<DragEvent>) => void
  onDragEnd: (pixel: [number, number]) => void
}) {
  const visual = calibrationMarkVisual({
    hollow: hollow ?? false,
    active: active ?? false,
    color,
    scale,
  })
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
        onDragMove?.(e)
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        onDragMove?.(e)
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onDragEnd([e.target.x(), e.target.y()])
      }}
    >
      <Circle
        radius={visual.radius}
        fill={visual.fill}
        stroke={visual.stroke}
        strokeWidth={visual.strokeWidth}
        hitStrokeWidth={visual.hitStrokeWidth}
      />
      {visual.cross && (
        <>
          <Line
            points={visual.cross.horizontal}
            stroke={visual.cross.stroke}
            strokeWidth={visual.cross.strokeWidth}
            listening={false}
          />
          <Line
            points={visual.cross.vertical}
            stroke={visual.cross.stroke}
            strokeWidth={visual.cross.strokeWidth}
            listening={false}
          />
        </>
      )}
      <Text
        x={visual.radius + 2 / scale}
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
  caption,
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
  caption?: string
  onPointerDown: (e: KonvaEventObject<MouseEvent>) => void
  onDragStart: (e: KonvaEventObject<DragEvent>) => void
  onDragMove: (e: KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void
  onDelete: () => void
}) {
  const radius = (selected ? 7 : 5) / scale
  const stroke = selected ? '#fff' : color
  const showUserRing = point.origin === 'user' && !selected
  const strokeWidth = (selected ? 2.5 : 2) / scale
  const fontSize = 11 / scale

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
        onDragStart(e)
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
      {caption ? (
        <Text
          x={radius + 2 / scale}
          y={-fontSize / 2}
          text={caption}
          fontSize={fontSize}
          fill={color}
          listening={false}
        />
      ) : null}
    </Group>
  )
}
