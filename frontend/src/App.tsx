import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyUnskew,
  getLastSession,
  waitForBackend,
  cvImproveCurve,
  importCurves,
  loadProject,
  patchCurves,
  patchSessionPreferences,
  resampleSession,
  setCalibration,
  undoSession,
  redoSession,
  uploadSession,
} from './api/client'
import { ProgressBar } from './components/ProgressBar'
import { CalibrationPanel } from './components/CalibrationPanel'
import { UnskewPanel } from './components/UnskewPanel'
import { CurveList } from './components/CurveList'
import { EditorCanvas } from './components/EditorCanvas'
import { ExportPanel } from './components/ExportPanel'
import { PreviewChart } from './components/PreviewChart'
import { firstVisibleCurve } from './lib/curves'
import { DEFAULT_POINT_COUNT } from './lib/constants'
import {
  AXIS_PLACE_ORDER,
  createEmptyCalibration,
  setAxisBoundPixel,
} from './lib/calibration'
import { curvesNeedDistinctColors, rainbowColors } from './lib/colors'
import {
  addPoint as addPointLocal,
  deletePoints as deletePointsLocal,
  patchPointsPixel,
  reassignPoints as reassignPointsLocal,
} from './lib/sessionPatch'
import { mergePreferencesUpdate, mergeSessionUpdate } from './lib/sessionMerge'
import {
  computeMeshWarpTransform,
  DEFAULT_MESH_SECTIONS,
  initMeshFromCalibration,
  isMeshReady,
  isMeshWithinImage,
  MAX_MESH_SECTIONS,
  meshToPayload,
  MIN_MESH_SECTIONS,
  plotQuadFromCalibration,
  plotQuadsMatch,
  remeshToPlotQuad,
  resizeMeshSections,
  restoreMeshFromWorkspace,
  sanitizeMeshForImage,
  type CorrectionTransform,
  type MeshGridState,
  type MeshVertex,
  type PlotQuad,
  type UnskewMode,
} from './lib/meshWarp'
import { isUnskewReady, unskewFromCalibration } from './lib/unskew'
import { appendAxisPoint, setScaleBarPixel } from './lib/axesChecker'
import { getAxisBounds, isCalibrationValid, updateAxisBound, areCalibrationPixelsInImage, type AxisBoundKey } from './lib/transform'
import type { Calibration, CanvasMode, Session } from './types'

function toast(message: string) {
  const el = document.getElementById('toast')
  if (el) el.textContent = message
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [activeCurveId, setActiveCurveId] = useState<string | null>(null)
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([])
  const [preciseMode, setPreciseMode] = useState(false)
  const [scaleBarStep, setScaleBarStep] = useState<'a' | 'b' | null>(null)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('select')
  const [showAxesChecker, setShowAxesChecker] = useState(true)
  const [axesCheckerChangedAt, setAxesCheckerChangedAt] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [axisPlaceStep, setAxisPlaceStep] = useState<AxisBoundKey | null>(null)
  const [resampleCount, setResampleCount] = useState(DEFAULT_POINT_COUNT)
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [draftCalibration, setDraftCalibration] = useState<Calibration | null>(null)
  const [unskewPreview, setUnskewPreview] = useState(false)
  const [unskewMode, setUnskewMode] = useState<UnskewMode>('perspective')
  const [meshGrid, setMeshGrid] = useState<MeshGridState | null>(null)
  /** Calibration plot quad the current mesh is synced to — used to detect calibration
   *  moves (which should remap the mesh) vs. direct mesh-vertex edits (which should not). */
  const meshSyncedQuadRef = useRef<PlotQuad | null>(null)
  const patchSeq = useRef(0)
  const prefsSeq = useRef(0)
  const prefsDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingPrefsPatch = useRef<{
    calibration?: Calibration
    manual_calibration?: boolean
    workspace?: Session['workspace']
  }>({})

  const applyWorkspaceFromSession = useCallback((s: Session | null) => {
    if (!s) {
      setActiveCurveId(null)
      setUnskewMode('perspective')
      setMeshGrid(null)
      meshSyncedQuadRef.current = null
      return
    }
    const ws = s.workspace
    const visible = firstVisibleCurve(s.curves)
    if (
      ws?.active_curve_id &&
      s.curves.some((c) => c.id === ws.active_curve_id && c.visible)
    ) {
      setActiveCurveId(ws.active_curve_id)
    } else if (visible) {
      setActiveCurveId(visible.id)
    } else if (s.curves.length) {
      setActiveCurveId(s.curves[0].id)
    } else {
      setActiveCurveId(null)
    }
    if (ws?.resample_count !== undefined) setResampleCount(ws.resample_count)
    if (ws?.show_axes_checker !== undefined) setShowAxesChecker(ws.show_axes_checker)
    const CANVAS_MODES: readonly CanvasMode[] = [
      'select',
      'place',
      'axis',
      'pick-color',
      'segment-fill',
      'point-match',
    ]
    if (ws?.canvas_mode && CANVAS_MODES.includes(ws.canvas_mode)) {
      setCanvasMode(ws.canvas_mode)
    }
    setUnskewMode(ws?.unskew_mode ?? 'perspective')
    if (s.calibration && ws?.mesh) {
      try {
        setMeshGrid(
          restoreMeshFromWorkspace(
            s.calibration,
            ws.mesh,
            s.image_meta.width,
            s.image_meta.height,
          ),
        )
        // Baseline going forward is "whatever calibration this mesh was loaded with" —
        // not the mesh's own corners, which may be intentionally edited away from it.
        meshSyncedQuadRef.current = plotQuadFromCalibration(s.calibration)
      } catch {
        setMeshGrid(null)
        meshSyncedQuadRef.current = null
      }
    } else {
      setMeshGrid(null)
      meshSyncedQuadRef.current = null
    }
  }, [])

  const syncSessionUi = useCallback(
    (s: Session | null) => {
      setSession(s)
      setDraftCalibration(s?.calibration ?? null)
      applyWorkspaceFromSession(s)
    },
    [applyWorkspaceFromSession],
  )

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setInitializing(true)
      setBusyMessage('Connecting to server…')
      try {
        await waitForBackend()
        if (!cancelled) setBusyMessage('Loading last session…')
        for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
          try {
            const s = await getLastSession()
            if (!cancelled) {
              syncSessionUi(s)
              toast('Restored last session')
            }
            break
          } catch {
            if (attempt < 4) await new Promise((r) => setTimeout(r, 400))
          }
        }
      } finally {
        if (!cancelled) {
          setInitializing(false)
          setBusyMessage(null)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [syncSessionUi])

  useEffect(() => {
    pendingPrefsPatch.current = {}
    setDraftCalibration(session?.calibration ?? null)
    setAxisPlaceStep(null)
    setUnskewPreview(false)
  }, [session?.id])

  useEffect(() => {
    if (!session?.id || !curvesNeedDistinctColors(session.curves)) return
    const colors = rainbowColors(session.curves.length)
    const needsUpdate = session.curves.some(
      (c, i) => c.color.toLowerCase() !== colors[i].toLowerCase(),
    )
    if (!needsUpdate) return
    const colored = session.curves.map((c, i) => ({ ...c, color: colors[i] }))
    setSession((prev) => (prev ? { ...prev, curves: colored } : prev))
    patchCurves(session.id, { curves: colored }).catch(() => {})
  }, [session?.id, session?.curves])

  const run = useCallback(async (fn: () => Promise<Session>, message = 'Working…') => {
    setBusy(true)
    setBusyMessage(message)
    try {
      const s = await fn()
      syncSessionUi(s)
      toast('Done')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
      setBusyMessage(null)
    }
  }, [syncSessionUi])

  const handleUpload = async (file: File) => {
    setBusy(true)
    setBusyMessage('Uploading image…')
    try {
      const s = await uploadSession(file)
      syncSessionUi(s)
      setActiveCurveId(null)
      setSelectedPointIds([])
      setAxisPlaceStep(null)
      setUnskewPreview(false)
      toast('Image uploaded')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      setBusyMessage(null)
    }
  }

  const patchCurvesQuiet = useCallback(
    (
      body: Parameters<typeof patchCurves>[1],
      applyLocal: (current: Session) => Session,
    ) => {
      const sessionId = session?.id
      if (!sessionId) return

      setSession((current) => (current ? applyLocal(current) : current))
      const seq = ++patchSeq.current
      patchCurves(sessionId, body)
        .then((saved) => {
          if (seq === patchSeq.current) {
            setSession((prev) => mergeSessionUpdate(prev, saved))
          }
        })
        .catch((e) => {
          if (seq !== patchSeq.current) return
          toast(e instanceof Error ? e.message : 'Save failed')
          getLastSession()
            .then(syncSessionUi)
            .catch(() => {})
        })
    },
    [session?.id, syncSessionUi],
  )

  const workspaceAutosaveReady = useRef(false)

  useEffect(() => {
    workspaceAutosaveReady.current = false
  }, [session?.id])

  const saveWorkspaceQuiet = useCallback(
    (options?: {
      debounceMs?: number
      meshOverride?: MeshGridState | null
      modeOverride?: UnskewMode
    }) => {
      const sessionId = session?.id
      if (!sessionId) return

      const mode = options?.modeOverride ?? unskewMode
      const meshState = options?.meshOverride !== undefined ? options.meshOverride : meshGrid
      const workspace = {
        active_curve_id: activeCurveId,
        resample_count: resampleCount,
        unskew_mode: mode,
        mesh: meshState ? meshToPayload(meshState) : null,
        canvas_mode: canvasMode,
        show_axes_checker: showAxesChecker,
      }

      pendingPrefsPatch.current = {
        ...pendingPrefsPatch.current,
        workspace,
      }

      const flush = () => {
        const toSend = { ...pendingPrefsPatch.current }
        const seq = ++prefsSeq.current
        patchSessionPreferences(sessionId, toSend)
          .then((saved) => {
            if (seq !== prefsSeq.current) return
            pendingPrefsPatch.current = {}
            setSession((prev) => mergePreferencesUpdate(prev, saved))
          })
          .catch(() => {})
      }

      if (options?.debounceMs) {
        clearTimeout(prefsDebounce.current)
        prefsDebounce.current = setTimeout(flush, options.debounceMs)
      } else {
        clearTimeout(prefsDebounce.current)
        flush()
      }
    },
    [session?.id, activeCurveId, resampleCount, unskewMode, meshGrid, canvasMode, showAxesChecker],
  )

  useEffect(() => {
    if (!session?.id) return
    if (!workspaceAutosaveReady.current) {
      workspaceAutosaveReady.current = true
      return
    }
    saveWorkspaceQuiet()
  }, [session?.id, activeCurveId, resampleCount, saveWorkspaceQuiet])

  const savePreferencesQuiet = useCallback(
    (
      patch: {
        calibration?: Calibration
        manual_calibration?: boolean
        workspace?: Session['workspace']
      },
      options?: { debounceMs?: number },
    ) => {
      const sessionId = session?.id
      if (!sessionId) return

      pendingPrefsPatch.current = { ...pendingPrefsPatch.current, ...patch }

      const applyLocal = (current: Session): Session => ({
        ...current,
        ...(patch.calibration !== undefined ? { calibration: patch.calibration } : {}),
        manual_calibration: true,
      })

      setSession((current) => (current ? applyLocal(current) : current))
      if (patch.calibration !== undefined) setDraftCalibration(patch.calibration)

      const flush = () => {
        const toSend = { ...pendingPrefsPatch.current }
        const seq = ++prefsSeq.current
        patchSessionPreferences(sessionId, toSend)
          .then((saved) => {
            if (seq !== prefsSeq.current) return
            pendingPrefsPatch.current = {}
            setSession((prev) => mergePreferencesUpdate(prev, saved))
            if (saved.calibration) setDraftCalibration(saved.calibration)
          })
          .catch((e) => {
            if (seq !== prefsSeq.current) return
            toast(e instanceof Error ? e.message : 'Calibration save failed')
            getLastSession()
              .then(syncSessionUi)
              .catch(() => {})
          })
      }

      if (options?.debounceMs) {
        clearTimeout(prefsDebounce.current)
        prefsDebounce.current = setTimeout(flush, options.debounceMs)
      } else {
        clearTimeout(prefsDebounce.current)
        flush()
      }
    },
    [session?.id, syncSessionUi],
  )

  /** Await any debounced calibration/workspace patch before apply or other server-critical ops. */
  const flushPreferencesQuiet = useCallback(async (): Promise<void> => {
    const sessionId = session?.id
    if (!sessionId) return
    clearTimeout(prefsDebounce.current)
    const toSend = { ...pendingPrefsPatch.current }
    if (Object.keys(toSend).length === 0) return
    pendingPrefsPatch.current = {}
    const seq = ++prefsSeq.current
    try {
      const saved = await patchSessionPreferences(sessionId, toSend)
      if (seq !== prefsSeq.current) return
      setSession((prev) => mergePreferencesUpdate(prev, saved))
      if (saved.calibration) setDraftCalibration(saved.calibration)
    } catch (e) {
      if (seq !== prefsSeq.current) return
      toast(e instanceof Error ? e.message : 'Calibration save failed')
      throw e
    }
  }, [session?.id])

  const syncCurves = (curves: Session['curves']) => {
    patchCurvesQuiet({ curves }, (current) => ({ ...current, curves }))
    const active = curves.find((c) => c.id === activeCurveId)
    if (activeCurveId && active && !active.visible) {
      setActiveCurveId(firstVisibleCurve(curves)?.id ?? null)
    }
  }

  const handleMovePoints = (moves: Array<{ pointId: string; pixel: [number, number] }>) => {
    if (!moves.length) return
    patchCurvesQuiet(
      {
        point_patches: moves.map(({ pointId, pixel }) => ({
          point_id: pointId,
          pixel,
          origin: 'user' as const,
        })),
      },
      (current) => patchPointsPixel(current, moves),
    )
  }

  const handleSelectPoint = (pointId: string, additive: boolean) => {
    setSelectedPointIds((prev) => {
      if (!additive) return [pointId]
      const next = new Set(prev)
      if (next.has(pointId)) next.delete(pointId)
      else next.add(pointId)
      return [...next]
    })
  }

  const handleSelectPoints = (pointIds: string[], additive: boolean) => {
    setSelectedPointIds((prev) => {
      if (!additive) return pointIds
      const next = new Set(prev)
      for (const id of pointIds) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return [...next]
    })
  }

  const placementCurveId = firstVisibleCurve(session?.curves ?? [])?.id ?? null

  const handleAddPoint = (pixel: [number, number]) => {
    if (!placementCurveId) return
    patchCurvesQuiet(
      { add_point: pixel, add_to_curve_id: placementCurveId },
      (current) => addPointLocal(current, placementCurveId, pixel),
    )
  }

  const handleDeletePoints = useCallback(
    (pointIds: string[]) => {
      if (!pointIds.length) return
      patchCurvesQuiet(
        { point_patches: pointIds.map((point_id) => ({ point_id, delete: true })) },
        (current) => deletePointsLocal(current, pointIds),
      )
      setSelectedPointIds((prev) => prev.filter((id) => !pointIds.includes(id)))
    },
    [patchCurvesQuiet],
  )

  const handleRemoveLastPlacedPoint = useCallback(() => {
    if (!placementCurveId || !session) return false
    const curve = session.curves.find((c) => c.id === placementCurveId)
    const last = curve?.points[curve.points.length - 1]
    if (!last) return false
    handleDeletePoints([last.id])
    return true
  }, [placementCurveId, session, handleDeletePoints])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = e.target
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return
      }
      if (canvasMode === 'place' && placementCurveId) {
        if (handleRemoveLastPlacedPoint()) e.preventDefault()
        return
      }
      if (!selectedPointIds.length) return
      e.preventDefault()
      handleDeletePoints(selectedPointIds)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    selectedPointIds,
    handleDeletePoints,
    canvasMode,
    placementCurveId,
    handleRemoveLastPlacedPoint,
  ])

  const handleReassign = (pointIds: string[], toCurveId: string) => {
    if (!pointIds.length) return
    patchCurvesQuiet(
      {
        point_patches: pointIds.map((point_id) => ({
          point_id,
          curve_id: toCurveId,
          origin: 'user' as const,
        })),
      },
      (current) => reassignPointsLocal(current, pointIds, toCurveId),
    )
    setSelectedPointIds([])
  }

  const imageUrl = session ? session.image_url : null
  const calibration = draftCalibration ?? session?.calibration ?? null
  const imageWidth = session?.image_meta.width ?? 0
  const imageHeight = session?.image_meta.height ?? 0

  useEffect(() => {
    if (!calibration || !meshGrid || imageWidth < 1 || imageHeight < 1) return

    const calibQuad = plotQuadFromCalibration(calibration)
    const syncedQuad = meshSyncedQuadRef.current
    let next = meshGrid
    if (calibQuad && syncedQuad && !plotQuadsMatch(calibQuad, syncedQuad)) {
      // Calibration axis marks moved since the mesh was last synced — remap the whole
      // mesh (positions + tangents) from the quad it was synced to onto the new one, so
      // it stays proportionally aligned instead of stretching against a stale rect.
      // (Compared against the sync baseline, not the mesh's own corners, so that
      // directly dragging a mesh corner is never mistaken for a calibration change.)
      next = remeshToPlotQuad(meshGrid, syncedQuad, calibQuad)
    }
    if (calibQuad && !plotQuadsMatch(calibQuad, syncedQuad)) {
      meshSyncedQuadRef.current = calibQuad
    }

    if (!unskewPreview && !isMeshWithinImage(next, imageWidth, imageHeight)) {
      next = sanitizeMeshForImage(next, calibration, imageWidth, imageHeight)
      toast('Mesh reset — saved vertices were outside the image bounds')
    }

    if (next !== meshGrid) {
      setMeshGrid(next)
      saveWorkspaceQuiet({ meshOverride: next })
    }
  }, [calibration, meshGrid, imageWidth, imageHeight, unskewPreview, saveWorkspaceQuiet])

  const axisBounds = calibration ? getAxisBounds(calibration) : null
  const canToggleUnskewPreview = !!session && !!axisBounds && !busy
  const correctionTransform = useMemo((): CorrectionTransform | null => {
    if (!unskewPreview || !calibration || imageWidth < 1 || imageHeight < 1) {
      return null
    }
    try {
      const t =
        unskewMode === 'mesh' && meshGrid
          ? computeMeshWarpTransform(meshGrid, calibration, imageWidth, imageHeight, {
              sanitize: false,
            })
          : unskewFromCalibration(calibration, imageWidth, imageHeight)
      return t
    } catch (err) {
      return null
    }
  }, [unskewPreview, unskewMode, meshGrid, calibration, imageWidth, imageHeight])

  const correctionReady =
    unskewMode === 'mesh'
      ? isMeshReady(calibration, meshGrid, imageWidth, imageHeight)
      : isUnskewReady(calibration, imageWidth, imageHeight)

  const calPixelsInImage =
    !!calibration && imageWidth > 0 && imageHeight > 0
      ? areCalibrationPixelsInImage(calibration, imageWidth, imageHeight)
      : true

  const unskewStatus = !session
    ? 'Upload an image to begin'
    : !axisBounds
      ? 'Place axis bounds in Calibration first'
      : !calPixelsInImage
        ? 'Axis marks are outside the image — re-place bounds (turn off preview first)'
      : unskewMode === 'mesh' && !meshGrid
        ? 'Switch to Mesh mode — grid initializes from bounds'
        : !correctionReady
          ? 'Bounds set — axis lines must cross for preview'
          : unskewPreview
            ? 'Preview active — click Apply to commit correction'
            : unskewMode === 'mesh'
              ? 'Adjust mesh boundary, then preview correction'
              : 'Ready — enable preview to see correction'
  const canApplyUnskew = unskewPreview && correctionReady && !busy

  const ensureMeshGrid = useCallback(
    (sections: number = meshGrid?.sections ?? DEFAULT_MESH_SECTIONS) => {
      if (!calibration) return null
      try {
        const grid = initMeshFromCalibration(calibration, sections)
        meshSyncedQuadRef.current = plotQuadFromCalibration(calibration)
        return grid
      } catch {
        return null
      }
    },
    [calibration, meshGrid?.sections],
  )

  const handleUnskewModeChange = (mode: UnskewMode) => {
    setUnskewMode(mode)
    let meshOverride: MeshGridState | null | undefined
    if (mode === 'mesh' && !meshGrid && calibration) {
      const grid = ensureMeshGrid()
      if (grid) {
        setMeshGrid(grid)
        meshOverride = grid
      } else {
        toast('Cannot initialize mesh — check calibration bounds')
      }
    }
    if (mode === 'perspective') setUnskewPreview(false)
    saveWorkspaceQuiet({
      modeOverride: mode,
      ...(meshOverride !== undefined ? { meshOverride } : {}),
    })
  }

  const handleToggleUnskewPreview = (on: boolean) => {
    if (!on) {
      setUnskewPreview(false)
      return
    }
    if (!calibration || imageWidth < 1 || imageHeight < 1) return
    try {
      if (unskewMode === 'mesh') {
        const grid = meshGrid ?? ensureMeshGrid()
        if (!grid) throw new Error('Mesh grid unavailable')
        if (!meshGrid) {
          setMeshGrid(grid)
          saveWorkspaceQuiet({ meshOverride: grid, modeOverride: 'mesh' })
        }
        computeMeshWarpTransform(grid, calibration, imageWidth, imageHeight)
      } else {
        unskewFromCalibration(calibration, imageWidth, imageHeight)
      }
      setUnskewPreview(true)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Cannot preview correction')
    }
  }

  const handleApplyUnskew = () => {
    if (!session || !calibration) return
    run(async () => {
      await flushPreferencesQuiet()
      const calPayload = { ...calibration, source: 'manual' as const }
      const body =
        unskewMode === 'mesh' && meshGrid
          ? { mode: 'mesh' as const, mesh: meshToPayload(meshGrid), calibration: calPayload }
          : { mode: 'perspective' as const, calibration: calPayload }
      const s = await applyUnskew(session.id, body)
      setUnskewPreview(false)
      setMeshGrid(null)
      setUnskewMode('perspective')
      saveWorkspaceQuiet({ meshOverride: null, modeOverride: 'perspective' })
      return s
    }, 'Applying correction…')
  }

  const handleUpdateMeshVertex = (row: number, col: number, vertex: MeshVertex) => {
    if (!meshGrid) return
    const vertices = meshGrid.vertices.map((r, ri) =>
      r.map((v, ci) => (ri === row && ci === col ? { ...vertex } : { ...v, position: [...v.position] as [number, number] })),
    )
    setMeshGrid({ ...meshGrid, vertices })
    saveWorkspaceQuiet({ debounceMs: 300 })
  }

  const handleResetMesh = () => {
    if (!calibration) return
    const sections = meshGrid?.sections ?? DEFAULT_MESH_SECTIONS
    const grid = ensureMeshGrid(sections)
    if (!grid) {
      toast('Cannot reset mesh — check calibration bounds')
      return
    }
    setMeshGrid(grid)
    saveWorkspaceQuiet({ meshOverride: grid })
    toast('Mesh reset to calibration bounds')
  }

  const handleMeshSectionsChange = (delta: number) => {
    if (!calibration) return
    const current = meshGrid?.sections ?? DEFAULT_MESH_SECTIONS
    const next = current + delta
    if (next < MIN_MESH_SECTIONS || next > MAX_MESH_SECTIONS) return

    if (!meshGrid) {
      const grid = ensureMeshGrid(next)
      if (!grid) {
        toast('Cannot initialize mesh — check calibration bounds')
        return
      }
      setMeshGrid(grid)
      saveWorkspaceQuiet({ meshOverride: grid })
      return
    }

    try {
      const grid = resizeMeshSections(meshGrid, next)
      setMeshGrid(grid)
      saveWorkspaceQuiet({ meshOverride: grid })
    } catch {
      toast('Cannot resize mesh — check boundary geometry')
    }
  }

  const bumpChecker = () => {
    const t = Date.now()
    setAxesCheckerChangedAt(t)
    setNowMs(t)
  }

  useEffect(() => {
    if (!showAxesChecker) return
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [showAxesChecker, axesCheckerChangedAt])

  const handleCalibrationChange = (cal: Calibration) => {
    savePreferencesQuiet({ calibration: { ...cal, source: 'manual' } }, { debounceMs: 300 })
    bumpChecker()
  }

  const handleMoveCalibrationMark = (key: AxisBoundKey, pixel: [number, number]) => {
    if (!draftCalibration) return
    const next = updateAxisBound(draftCalibration, key, { pixel })
    savePreferencesQuiet({ calibration: next })
    bumpChecker()
  }

  const startAxisPlacement = () => {
    if (!session) return
    const w = session.image_meta.width
    const h = session.image_meta.height
    const cal = draftCalibration ?? createEmptyCalibration(w, h)
    setDraftCalibration(cal)
    savePreferencesQuiet({ calibration: cal, manual_calibration: true })
    setAxisPlaceStep('xmin')
    setPreciseMode(false)
    setScaleBarStep(null)
    setCanvasMode('select')
    setSelectedPointIds([])
  }

  const startPrecisePlacement = () => {
    if (!session) return
    const w = session.image_meta.width
    const h = session.image_meta.height
    const cal = draftCalibration ?? createEmptyCalibration(w, h)
    const coords = cal.coords_type === 'polar' ? ('polar' as const) : ('cartesian' as const)
    const next = { ...cal, coords_type: coords, axis_points: cal.axis_points ?? [] }
    setDraftCalibration(next)
    setPreciseMode(true)
    setAxisPlaceStep(null)
    setScaleBarStep(null)
    setCanvasMode('axis')
    savePreferencesQuiet({
      calibration: next,
      manual_calibration: true,
      workspace: { ...(session.workspace ?? {}), canvas_mode: 'axis', show_axes_checker: showAxesChecker },
    })
  }

  const startScaleBarPlacement = () => {
    if (!session) return
    const w = session.image_meta.width
    const h = session.image_meta.height
    const cal = draftCalibration ?? createEmptyCalibration(w, h)
    const next = { ...cal, coords_type: 'map' as const }
    setDraftCalibration(next)
    setScaleBarStep('a')
    setPreciseMode(false)
    setAxisPlaceStep(null)
    setCanvasMode('axis')
    savePreferencesQuiet({
      calibration: next,
      manual_calibration: true,
      workspace: { ...(session.workspace ?? {}), canvas_mode: 'axis', show_axes_checker: showAxesChecker },
    })
  }

  const handleAxisPointClick = (pixel: [number, number]) => {
    if (!draftCalibration) return
    const coords = draftCalibration.coords_type ?? 'cartesian'
    if (coords === 'map' && scaleBarStep) {
      const next = setScaleBarPixel(draftCalibration, scaleBarStep, pixel)
      setDraftCalibration(next)
      savePreferencesQuiet({ calibration: next, manual_calibration: true })
      bumpChecker()
      setScaleBarStep(scaleBarStep === 'a' ? 'b' : null)
      if (scaleBarStep === 'b') setCanvasMode('select')
      return
    }
    const next = appendAxisPoint(draftCalibration, pixel, null, null)
    setDraftCalibration(next)
    savePreferencesQuiet({ calibration: next, manual_calibration: true })
    bumpChecker()
  }

  const handleMoveAxisPoint = (id: string, pixel: [number, number]) => {
    if (!draftCalibration) return
    const next = {
      ...draftCalibration,
      source: 'manual' as const,
      axis_points: (draftCalibration.axis_points ?? []).map((p) =>
        p.id === id ? { ...p, pixel } : p,
      ),
    }
    setDraftCalibration(next)
    savePreferencesQuiet({ calibration: next, manual_calibration: true })
    bumpChecker()
  }

  const handleMoveScaleBar = (which: 'a' | 'b', pixel: [number, number]) => {
    if (!draftCalibration) return
    const next = setScaleBarPixel(draftCalibration, which, pixel)
    setDraftCalibration(next)
    savePreferencesQuiet({ calibration: next, manual_calibration: true })
    bumpChecker()
  }

  const handleToggleAxesChecker = (show: boolean) => {
    setShowAxesChecker(show)
    if (!session) return
    saveWorkspaceQuiet()
    savePreferencesQuiet({
      workspace: {
        ...(session.workspace ?? {}),
        show_axes_checker: show,
        canvas_mode: canvasMode,
      },
    })
  }

  const handleAxisPlaceClick = (pixel: [number, number]) => {
    if (!axisPlaceStep) return
    const w = session?.image_meta.width ?? 800
    const h = session?.image_meta.height ?? 500
    const base = draftCalibration ?? createEmptyCalibration(w, h)
    const next = setAxisBoundPixel(base, axisPlaceStep, pixel)
    setDraftCalibration(next)
    savePreferencesQuiet({ calibration: next, manual_calibration: true })
    bumpChecker()

    const idx = AXIS_PLACE_ORDER.indexOf(axisPlaceStep)
    if (idx < AXIS_PLACE_ORDER.length - 1) {
      setAxisPlaceStep(AXIS_PLACE_ORDER[idx + 1])
    } else {
      setAxisPlaceStep(null)
      toast('Axis bounds placed — enter numeric values')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <div>
          <h1 className="text-lg font-bold text-slate-100">PlotDigitizer</h1>
          <p className="text-xs text-slate-400">Manual plot digitization</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded bg-slate-700 px-3 py-1.5 text-xs hover:bg-slate-600">
            Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
            />
          </label>
          {session && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => undoSession(session.id), 'Undoing…')}
                className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
              >
                Undo
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => redoSession(session.id), 'Redoing…')}
                className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
              >
                Redo
              </button>
            </>
          )}
        </div>
      </header>

      {(initializing || busy) && busyMessage && (
        <div className="sticky top-0 z-50">
          <ProgressBar message={busyMessage} />
        </div>
      )}

      <p id="toast" className="shrink-0 px-4 py-0.5 text-center text-xs text-amber-300" />

      <div className="shrink-0 flex gap-2 overflow-x-auto border-b border-slate-800 px-2 py-2">
        <UnskewPanel
          mode={unskewMode}
          canTogglePreview={canToggleUnskewPreview}
          previewActive={unskewPreview}
          canApply={canApplyUnskew}
          status={unskewStatus}
          busy={busy}
          canResetMesh={unskewMode === 'mesh' && !!meshGrid}
          onModeChange={handleUnskewModeChange}
          onTogglePreview={handleToggleUnskewPreview}
          onApply={handleApplyUnskew}
          onCancelPreview={() => setUnskewPreview(false)}
          onResetMesh={handleResetMesh}
          meshSections={unskewMode === 'mesh' ? (meshGrid?.sections ?? DEFAULT_MESH_SECTIONS) : undefined}
          minMeshSections={MIN_MESH_SECTIONS}
          maxMeshSections={MAX_MESH_SECTIONS}
          onMeshSectionsChange={handleMeshSectionsChange}
        />
        <CalibrationPanel
          calibration={calibration}
          axisPlaceStep={axisPlaceStep}
          preciseMode={preciseMode}
          scaleBarStep={scaleBarStep}
          showAxesChecker={showAxesChecker}
          onToggleAxesChecker={handleToggleAxesChecker}
          onStartAxisPlacement={startAxisPlacement}
          onStartPrecisePlacement={startPrecisePlacement}
          onStartScaleBarPlacement={startScaleBarPlacement}
          onChange={handleCalibrationChange}
          onSave={() =>
            session &&
            draftCalibration &&
            run(
              () => setCalibration(session.id, { ...draftCalibration, source: 'manual' }),
              'Saving calibration…',
            )
          }
        />
        <ExportPanel
          compact
          sessionId={session?.id ?? null}
          canExportProject={!!session}
          canExportCsv={!!session && isCalibrationValid(calibration)}
          canImport={!!session && isCalibrationValid(calibration)}
          busy={busy}
          onExportError={(message) => toast(message)}
          onLoadProject={(file) =>
            run(async () => {
              const s = await loadProject(file)
              setSelectedPointIds([])
              setCanvasMode('select')
              setAxisPlaceStep(null)
              return s
            }, 'Opening project…')
          }
          onImport={(file) =>
            session &&
            run(async () => {
              const s = await importCurves(session.id, file)
              applyWorkspaceFromSession(s)
              setSelectedPointIds([])
              return s
            }, 'Importing curves…')
          }
        />
      </div>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-2 gap-2 p-2 lg:grid-cols-2 lg:grid-rows-1">
          <div className="min-h-0 overflow-hidden">
            <EditorCanvas
              imageUrl={imageUrl}
              width={session?.image_meta.width ?? 800}
              height={session?.image_meta.height ?? 500}
              correctionTransform={correctionTransform}
              meshGrid={meshGrid}
              showMeshGrid={unskewMode === 'mesh' && !!meshGrid && !unskewPreview}
              onUpdateMeshVertex={handleUpdateMeshVertex}
              curves={session?.curves ?? []}
              placementCurveId={placementCurveId}
              canvasMode={canvasMode}
              onAxisPointClick={handleAxisPointClick}
              onMoveAxisPoint={handleMoveAxisPoint}
              onMoveScaleBar={handleMoveScaleBar}
              showAxesChecker={showAxesChecker}
              axesCheckerChangedAt={axesCheckerChangedAt}
              axesCheckerNow={nowMs}
              axisPlaceStep={axisPlaceStep}
              calibration={calibration}
              onMoveCalibrationMark={handleMoveCalibrationMark}
              onAxisPlaceClick={handleAxisPlaceClick}
              onAddPoint={handleAddPoint}
              onMovePoint={(id, pixel) => handleMovePoints([{ pointId: id, pixel }])}
              onMovePoints={handleMovePoints}
              onSelectPoint={handleSelectPoint}
              onSelectPoints={handleSelectPoints}
              onClearSelection={() => setSelectedPointIds([])}
              selectedPointIds={selectedPointIds}
              onDeletePoint={(id) => handleDeletePoints([id])}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <PreviewChart curves={session?.curves ?? []} calibration={calibration} />
          </div>
        </div>

        <aside className="flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-hidden border-l border-slate-800 p-2">
          <CurveList
            curves={session?.curves ?? []}
            activeCurveId={activeCurveId}
            placementCurveId={placementCurveId}
            selectedPointIds={selectedPointIds}
            busy={busy}
            resampleCount={resampleCount}
            onResampleCountChange={setResampleCount}
            onActiveChange={setActiveCurveId}
            canvasMode={canvasMode}
            onCanvasModeChange={(mode) => {
              setCanvasMode(mode)
              if (mode === 'place') setAxisPlaceStep(null)
            }}
            onCurveChange={syncCurves}
            onReassignPoints={handleReassign}
            onImprove={(curveId) =>
              session && run(() => cvImproveCurve(session.id, curveId), 'Tracing curve…')
            }
            onResample={(curveId) =>
              session &&
              run(
                () => resampleSession(session.id, curveId, resampleCount),
                'Densifying curve…',
              )
            }
          />
        </aside>
      </main>
    </div>
  )
}
