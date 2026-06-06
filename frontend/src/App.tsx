import { useCallback, useEffect, useState } from 'react'
import {
  clearProviderKey,
  detectSession,
  getLastSession,
  getSettings,
  waitForBackend,
  cvImproveCurve,
  improveCurveFromHints,
  removeCurveFromPlot,
  patchCurves,
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
import { curvesLookGrayscale, rainbowColors } from './lib/colors'
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
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [textHint, setTextHint] = useState('')
  const [regionMode, setRegionMode] = useState(false)
  const [resampleCount, setResampleCount] = useState(50)
  const [manualCalibration, setManualCalibration] = useState(false)
  const [useAiMode, setUseAiMode] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [draftCalibration, setDraftCalibration] = useState<Calibration | null>(null)

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
              setSession(s)
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

  useEffect(() => {
    if (session?.calibration) setDraftCalibration(session.calibration)
  }, [session?.calibration])

  useEffect(() => {
    if (session?.curves.length && !activeCurveId) {
      setActiveCurveId(session.curves[0].id)
    }
  }, [session?.curves, activeCurveId])

  useEffect(() => {
    if (!session?.id || !curvesLookGrayscale(session.curves)) return
    const colors = rainbowColors(session.curves.length)
    const needsUpdate = session.curves.some(
      (c, i) => c.color.toLowerCase() !== colors[i].toLowerCase(),
    )
    if (!needsUpdate) return
    patchCurves(session.id, {
      curves: session.curves.map((c, i) => ({ ...c, color: colors[i] })),
    })
      .then(setSession)
      .catch(() => {})
  }, [session?.id, session?.curves])

  const run = useCallback(async (fn: () => Promise<Session>, message = 'Working…') => {
    setBusy(true)
    setBusyMessage(message)
    try {
      const s = await fn()
      setSession(s)
      toast('Done')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
      setBusyMessage(null)
    }
  }, [])

  const handleUpload = async (file: File) => {
    setBusy(true)
    setBusyMessage('Uploading image…')
    try {
      const s = await uploadSession(file)
      setSession(s)
      setActiveCurveId(null)
      setSelectedPointId(null)
      toast('Image uploaded')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      setBusyMessage(null)
    }
  }

  const syncCurves = (curves: Session['curves']) => {
    if (!session) return
    run(() => patchCurves(session.id, { curves }))
  }

  const handleMovePoint = (pointId: string, pixel: [number, number]) => {
    if (!session) return
    run(() =>
      patchCurves(session.id, {
        point_patches: [{ point_id: pointId, pixel, origin: 'user' }],
      }),
    )
  }

  const handleAddPoint = (pixel: [number, number]) => {
    if (!session || !activeCurveId) return
    run(() =>
      patchCurves(session.id, {
        add_point: pixel,
        add_to_curve_id: activeCurveId,
      }),
    )
  }

  const handleDeletePoint = (pointId: string) => {
    if (!session) return
    run(() =>
      patchCurves(session.id, {
        point_patches: [{ point_id: pointId, delete: true }],
      }),
    )
    setSelectedPointId(null)
  }

  const handleReassign = (pointId: string, toCurveId: string) => {
    if (!session) return
    run(() =>
      patchCurves(session.id, {
        point_patches: [{ point_id: pointId, curve_id: toCurveId, origin: 'user' }],
      }),
    )
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

  const handleMoveCalibrationMark = (key: AxisBoundKey, pixel: [number, number]) => {
    if (!draftCalibration) return
    setDraftCalibration(updateAxisBound(draftCalibration, key, { pixel }))
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
          onToggleRegion={() => setRegionMode((v) => !v)}
          busyMessage={busyMessage}
          onDetect={() => session && run(() => detectSession(session.id), 'Detecting curves with AI…')}
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
          onToggleManual={setManualCalibration}
          onChange={setDraftCalibration}
          onSave={() =>
            session &&
            draftCalibration &&
            run(
              () =>
                setCalibration(session.id, {
                  ...draftCalibration,
                  source: manualCalibration ? 'manual' : draftCalibration.source,
                }),
              'Saving calibration…',
            )
          }
        />
        <ExportPanel
          compact
          sessionId={session?.id ?? null}
          canExport={!!session && isCalibrationValid(calibration)}
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
              activeCurveId={activeCurveId}
              regionMode={regionMode}
              calibration={calibration}
              manualCalibration={manualCalibration}
              onMoveCalibrationMark={handleMoveCalibrationMark}
              onRegion={handleRegion}
              onAddPoint={handleAddPoint}
              onMovePoint={handleMovePoint}
              onSelectPoint={setSelectedPointId}
              selectedPointId={selectedPointId}
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
            selectedPointId={selectedPointId}
            busy={busy}
            useAi={useAiMode}
            onUseAiChange={setUseAiMode}
            onActiveChange={setActiveCurveId}
            onCurveChange={syncCurves}
            onReassignPoint={handleReassign}
            onImprove={(curveId) =>
              session &&
              run(
                () =>
                  useAiMode
                    ? improveCurveFromHints(session.id, curveId)
                    : cvImproveCurve(session.id, curveId),
                useAiMode ? 'AI improving curve…' : 'CV improving curve…',
              )
            }
            onRemoveFromPlot={(curveId) =>
              session &&
              run(
                () => removeCurveFromPlot(session.id, curveId, useAiMode),
                useAiMode
                  ? 'AI removing curve from plot image…'
                  : 'Removing curve from plot image…',
              )
            }
          />
        </aside>
      </main>
    </div>
  )
}
