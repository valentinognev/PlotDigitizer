import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearProviderKey,
  detectSession,
  getLastSession,
  getSettings,
  waitForBackend,
  cvImproveCurve,
  importCurves,
  loadProject,
  patchCurves,
  patchSessionPreferences,
  refineSession,
  resampleSession,
  setCalibration,
  undoSession,
  redoSession,
  updateSettings,
  uploadSession,
} from './api/client'
import { AIAssistBar } from './components/AIAssistBar'
import { ProgressBar } from './components/ProgressBar'
import { CalibrationPanel } from './components/CalibrationPanel'
import { CurveList } from './components/CurveList'
import { EditorCanvas } from './components/EditorCanvas'
import { ExportPanel } from './components/ExportPanel'
import { PreviewChart } from './components/PreviewChart'
import { SettingsPanel } from './components/SettingsPanel'
import { firstVisibleCurve } from './lib/curves'
import { DEFAULT_POINT_COUNT } from './lib/constants'
import { curvesNeedDistinctColors, rainbowColors } from './lib/colors'
import {
  addPoint as addPointLocal,
  deletePoints as deletePointsLocal,
  patchPointsPixel,
  reassignPoints as reassignPointsLocal,
} from './lib/sessionPatch'
import { mergePreferencesUpdate, mergeSessionUpdate } from './lib/sessionMerge'
import { isCalibrationValid, updateAxisBound, type AxisBoundKey } from './lib/transform'
import type { Calibration, ProviderName, Session, SettingsPublic } from './types'

function toast(message: string) {
  const el = document.getElementById('toast')
  if (el) el.textContent = message
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [settings, setSettings] = useState<SettingsPublic | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>('openai')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [activeCurveId, setActiveCurveId] = useState<string | null>(null)
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([])
  const [textHint, setTextHint] = useState('')
  const [regionMode, setRegionMode] = useState(false)
  const [addPointMode, setAddPointMode] = useState(false)
  const [resampleCount, setResampleCount] = useState(DEFAULT_POINT_COUNT)
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [draftCalibration, setDraftCalibration] = useState<Calibration | null>(null)
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
    if (ws?.text_hint !== undefined) setTextHint(ws.text_hint)
    if (ws?.resample_count !== undefined) setResampleCount(ws.resample_count)
  }, [])

  const syncSessionUi = useCallback(
    (s: Session | null) => {
      setSession(s)
      setDraftCalibration(s?.calibration ?? null)
      applyWorkspaceFromSession(s)
    },
    [applyWorkspaceFromSession],
  )

  const manualCalibration = session?.manual_calibration ?? false

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setInitializing(true)
      setBusyMessage('Connecting to server…')
      try {
        await waitForBackend()

        try {
          const s = await getSettings()
          if (!cancelled) {
            setSettings(s)
            setSelectedProvider(s.active_provider)
          }
        } catch {
          if (!cancelled) toast('Could not load settings')
        }

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
  }, [])

  // Restore calibration draft when switching sessions — not on every curve edit.
  useEffect(() => {
    pendingPrefsPatch.current = {}
    setDraftCalibration(session?.calibration ?? null)
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
    patchCurves(session.id, { curves: colored })
      .catch(() => {})
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
    (options?: { debounceMs?: number }) => {
      const sessionId = session?.id
      if (!sessionId) return

      const workspace = {
        active_curve_id: activeCurveId,
        text_hint: textHint,
        resample_count: resampleCount,
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
    [session?.id, activeCurveId, textHint, resampleCount],
  )

  useEffect(() => {
    if (!session?.id) return
    if (!workspaceAutosaveReady.current) {
      workspaceAutosaveReady.current = true
      return
    }
    saveWorkspaceQuiet()
  }, [session?.id, activeCurveId, resampleCount, saveWorkspaceQuiet])

  useEffect(() => {
    if (!session?.id || !workspaceAutosaveReady.current) return
    saveWorkspaceQuiet({ debounceMs: 400 })
  }, [session?.id, textHint, saveWorkspaceQuiet])

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
        ...(patch.manual_calibration !== undefined
          ? { manual_calibration: patch.manual_calibration }
          : {}),
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

  const syncCurves = (curves: Session['curves']) => {
    patchCurvesQuiet({ curves }, (current) => ({ ...current, curves }))
    const active = curves.find((c) => c.id === activeCurveId)
    if (activeCurveId && active && !active.visible) {
      setActiveCurveId(firstVisibleCurve(curves)?.id ?? null)
    }
  }

  const handleMovePoint = (pointId: string, pixel: [number, number]) => {
    handleMovePoints([{ pointId, pixel }])
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

  const handleDeletePoint = (pointId: string) => {
    handleDeletePoints([pointId])
  }

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
      if (addPointMode && placementCurveId) {
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
    addPointMode,
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

  const handleRegion = (bbox: { x: number; y: number; width: number; height: number }) => {
    if (!session) return
    setRegionMode(false)
    run(
      () =>
        refineSession(session.id, {
          region: bbox,
          curve_id: activeCurveId ?? undefined,
        }),
      'Refining region with AI…',
    )
  }

  const handleSaveSettings = () => {
    updateSettings({
      active_provider: selectedProvider,
      provider: selectedProvider,
      api_key: apiKeyInput || undefined,
    })
      .then(setSettings)
      .then(() => {
        setApiKeyInput('')
        toast('Settings saved')
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Save failed'))
  }

  const imageUrl = session ? session.image_url : null
  const calibration = draftCalibration ?? session?.calibration ?? null

  const handleCalibrationChange = (cal: Calibration) => {
    const next: Calibration = {
      ...cal,
      source: manualCalibration ? 'manual' : cal.source,
    }
    savePreferencesQuiet({ calibration: next }, { debounceMs: 300 })
  }

  const handleToggleManual = (enabled: boolean) => {
    savePreferencesQuiet({ manual_calibration: enabled })
  }

  const handleMoveCalibrationMark = (key: AxisBoundKey, pixel: [number, number]) => {
    if (!draftCalibration) return
    const next = updateAxisBound(draftCalibration, key, { pixel })
    savePreferencesQuiet({ calibration: next })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <div>
          <h1 className="text-lg font-bold text-slate-100">PlotDigitizer</h1>
          <p className="text-xs text-slate-400">AI-assisted plot digitization with human correction</p>
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
        <SettingsPanel
          settings={settings}
          apiKeyInput={apiKeyInput}
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
          onApiKeyChange={setApiKeyInput}
          onSave={handleSaveSettings}
          onClearKey={(p) =>
            clearProviderKey(p)
              .then(setSettings)
              .then(() => toast('Key cleared'))
              .catch((e) => toast(e.message))
          }
        />
        <AIAssistBar
          textHint={textHint}
          regionMode={regionMode}
          resampleCount={resampleCount}
          busy={busy}
          onTextHintChange={setTextHint}
          onResampleCountChange={setResampleCount}
          onToggleRegion={() => {
            setRegionMode((v) => !v)
            setAddPointMode(false)
          }}
          busyMessage={busyMessage}
          onDetect={() =>
            session && run(() => detectSession(session.id), 'Detecting axis limits…')
          }
          onRefineText={() =>
            session &&
            run(
              () =>
                refineSession(session.id, {
                  instruction: textHint,
                  curve_id: activeCurveId ?? undefined,
                }),
              'Refining with AI…',
            )
          }
          onResample={() =>
            session &&
            activeCurveId &&
            run(
              () => resampleSession(session.id, activeCurveId, resampleCount),
              'Resampling curve…',
            )
          }
          onRedetect={() =>
            session &&
            activeCurveId &&
            run(
              () =>
                refineSession(session.id, {
                  curve_id: activeCurveId,
                  redetect_curve: true,
                  instruction: 'Re-detect this entire curve',
                }),
              'Re-detecting curve…',
            )
          }
          activeCurveId={activeCurveId}
        />
        <CalibrationPanel
          calibration={calibration}
          manualMode={manualCalibration}
          onToggleManual={handleToggleManual}
          onChange={handleCalibrationChange}
          onSave={() =>
            session &&
            draftCalibration &&
            run(
              () =>
                setCalibration(
                  session.id,
                  {
                    ...draftCalibration,
                    source: manualCalibration ? 'manual' : draftCalibration.source,
                  },
                  manualCalibration,
                ),
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
              setAddPointMode(false)
              setRegionMode(false)
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
              curves={session?.curves ?? []}
              placementCurveId={placementCurveId}
              addPointMode={addPointMode}
              regionMode={regionMode}
              calibration={calibration}
              manualCalibration={manualCalibration}
              onMoveCalibrationMark={handleMoveCalibrationMark}
              onRegion={handleRegion}
              onAddPoint={handleAddPoint}
              onMovePoint={handleMovePoint}
              onMovePoints={handleMovePoints}
              onSelectPoint={handleSelectPoint}
              onSelectPoints={handleSelectPoints}
              onClearSelection={() => setSelectedPointIds([])}
              selectedPointIds={selectedPointIds}
              onDeletePoint={handleDeletePoint}
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
            onActiveChange={setActiveCurveId}
            addPointMode={addPointMode}
            onAddPointModeChange={setAddPointMode}
            onCurveChange={syncCurves}
            onReassignPoints={handleReassign}
            onImprove={(curveId) =>
              session &&
              run(() => cvImproveCurve(session.id, curveId), 'Improving curve…')
            }
          />
        </aside>
      </main>
    </div>
  )
}
