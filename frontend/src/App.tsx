import { useCallback, useEffect, useState } from 'react'
import {
  clearProviderKey,
  detectSession,
  getSettings,
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
import { CalibrationPanel } from './components/CalibrationPanel'
import { CurveList } from './components/CurveList'
import { EditorCanvas } from './components/EditorCanvas'
import { ExportPanel } from './components/ExportPanel'
import { PreviewChart } from './components/PreviewChart'
import { SettingsPanel } from './components/SettingsPanel'
import { isCalibrationValid } from './lib/transform'
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
  const [busy, setBusy] = useState(false)
  const [draftCalibration, setDraftCalibration] = useState<Calibration | null>(null)

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s)
        setSelectedProvider(s.active_provider)
      })
      .catch(() => toast('Could not load settings'))
  }, [])

  useEffect(() => {
    if (session?.calibration) setDraftCalibration(session.calibration)
  }, [session?.calibration])

  useEffect(() => {
    if (session?.curves.length && !activeCurveId) {
      setActiveCurveId(session.curves[0].id)
    }
  }, [session?.curves, activeCurveId])

  const run = useCallback(async (fn: () => Promise<Session>) => {
    setBusy(true)
    try {
      const s = await fn()
      setSession(s)
      toast('Done')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleUpload = async (file: File) => {
    setBusy(true)
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
    run(() =>
      refineSession(session.id, {
        region: bbox,
        curve_id: activeCurveId ?? undefined,
      }),
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
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
                onClick={() => run(() => undoSession(session.id))}
                className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
              >
                Undo
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => redoSession(session.id))}
                className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600 disabled:opacity-50"
              >
                Redo
              </button>
            </>
          )}
        </div>
      </header>

      <p id="toast" className="min-h-[1.25rem] px-4 py-1 text-center text-xs text-amber-300" />

      <main className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_1fr_300px]">
        <div className="flex min-h-[420px] flex-col gap-3">
          <EditorCanvas
            imageUrl={imageUrl}
            width={session?.image_meta.width ?? 800}
            height={session?.image_meta.height ?? 500}
            curves={session?.curves ?? []}
            activeCurveId={activeCurveId}
            regionMode={regionMode}
            onRegion={handleRegion}
            onAddPoint={handleAddPoint}
            onMovePoint={handleMovePoint}
            onSelectPoint={setSelectedPointId}
            selectedPointId={selectedPointId}
            onDeletePoint={handleDeletePoint}
          />
        </div>

        <div className="flex min-h-[320px] flex-col">
          <PreviewChart curves={session?.curves ?? []} calibration={calibration} />
        </div>

        <aside className="flex flex-col gap-3 overflow-y-auto">
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
            onDetect={() => session && run(() => detectSession(session.id))}
            onRefineText={() =>
              session &&
              run(() =>
                refineSession(session.id, {
                  instruction: textHint,
                  curve_id: activeCurveId ?? undefined,
                }),
              )
            }
            onResample={() =>
              session &&
              activeCurveId &&
              run(() => resampleSession(session.id, activeCurveId, resampleCount))
            }
            onRedetect={() =>
              session &&
              activeCurveId &&
              run(() =>
                refineSession(session.id, {
                  curve_id: activeCurveId,
                  redetect_curve: true,
                  instruction: 'Re-detect this entire curve',
                }),
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
              run(() => setCalibration(session.id, { ...draftCalibration, source: manualCalibration ? 'manual' : draftCalibration.source }))
            }
          />
          <CurveList
            curves={session?.curves ?? []}
            activeCurveId={activeCurveId}
            selectedPointId={selectedPointId}
            onActiveChange={setActiveCurveId}
            onCurveChange={syncCurves}
            onReassignPoint={handleReassign}
          />
          <ExportPanel
            sessionId={session?.id ?? null}
            canExport={!!session && isCalibrationValid(calibration)}
          />
        </aside>
      </main>
    </div>
  )
}
