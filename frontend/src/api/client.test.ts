import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldRevertSessionOnPrefsError, triggerSessionExport } from './client'

describe('shouldRevertSessionOnPrefsError', () => {
  it('does not revert last-session UI on calibration_invalid during axis placement', () => {
    const err = Object.assign(new Error('Incomplete calibration'), { code: 'calibration_invalid' })
    expect(shouldRevertSessionOnPrefsError(err)).toBe(false)
  })

  it('reverts on other preference failures', () => {
    expect(shouldRevertSessionOnPrefsError(new Error('timeout'))).toBe(true)
    expect(shouldRevertSessionOnPrefsError(Object.assign(new Error('nope'), { code: 'internal' }))).toBe(
      true,
    )
  })
})

describe('triggerSessionExport', () => {
  const payload = new Blob(['curve-data'], { type: 'text/csv' })
  let savePicker: ReturnType<typeof vi.fn>
  let createWritable: ReturnType<typeof vi.fn>
  let writableWrite: ReturnType<typeof vi.fn>
  let writableClose: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>
  let createObjectURL: ReturnType<typeof vi.fn>
  const anchors: Array<{
    href: string
    download: string
    click: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }> = []
  const forms: Array<{ submit: ReturnType<typeof vi.fn> }> = []

  function okResponse(filename: string, body: Blob = payload) {
    return {
      ok: true,
      blob: vi.fn().mockResolvedValue(body),
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-disposition' ? `attachment; filename="${filename}"` : null,
      },
    }
  }

  beforeEach(() => {
    anchors.length = 0
    forms.length = 0
    writableWrite = vi.fn().mockResolvedValue(undefined)
    writableClose = vi.fn().mockResolvedValue(undefined)
    createWritable = vi.fn().mockResolvedValue({ write: writableWrite, close: writableClose })
    savePicker = vi.fn().mockResolvedValue({
      createWritable,
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    fetchMock = vi.fn().mockResolvedValue(okResponse('figure.pdproj.json'))
    createObjectURL = vi.fn(() => 'blob:export')
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { showSaveFilePicker: savePicker })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') {
          const a = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() }
          anchors.push(a)
          return a
        }
        if (tag === 'form') {
          const form = {
            method: '',
            action: '',
            target: '',
            style: { display: '' },
            appendChild: vi.fn(),
            submit: vi.fn(),
            remove: vi.fn(),
          }
          forms.push(form)
          return form
        }
        return { type: '', name: '', value: '' }
      }),
      body: { appendChild: vi.fn() },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes through showSaveFilePicker when the browser allows it', async () => {
    await triggerSessionExport('sess', 'json')

    expect(savePicker).toHaveBeenCalledTimes(1)
    expect(createWritable).toHaveBeenCalledTimes(1)
    expect(writableWrite).toHaveBeenCalledWith(payload)
    expect(writableClose).toHaveBeenCalledTimes(1)
    expect(anchors).toHaveLength(0)
    expect(forms).toHaveLength(0)
  })

  function imageResponse(ok = true, message = 'no image') {
    const png = new Blob(['png-bytes'], { type: 'image/png' })
    return {
      ok,
      statusText: 'Not Found',
      blob: vi.fn().mockResolvedValue(png),
      json: vi.fn().mockResolvedValue({ error: { message } }),
      headers: { get: () => null },
    }
  }

  function mockExportAndImage(exportFilename: string, imageOk = true) {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/image')) {
        return Promise.resolve(imageResponse(imageOk))
      }
      return Promise.resolve(okResponse(exportFilename))
    })
  }

  it('downloads a csv blob when showSaveFilePicker is missing', async () => {
    vi.stubGlobal('window', {})
    mockExportAndImage('plot_digitizer.csv')

    await triggerSessionExport('sess', 'csv')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/sessions/sess/export?format=csv'))
    expect(anchors.map((a) => a.download)).toContain('plot_digitizer.csv')
    const csvAnchor = anchors.find((a) => a.download === 'plot_digitizer.csv')
    expect(csvAnchor?.click).toHaveBeenCalledTimes(1)
    expect(forms).toHaveLength(0)
  })

  it('blob-download CSV also downloads a PNG sidecar named from the CSV stem', async () => {
    vi.stubGlobal('window', {})
    mockExportAndImage('plot_digitizer.csv')

    await triggerSessionExport('sess', 'csv')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/sessions/sess/export?format=csv'))
    expect(fetchMock).toHaveBeenCalledWith('/sessions/sess/image')
    expect(anchors.map((a) => a.download)).toEqual(['plot_digitizer.csv', 'plot_digitizer.png'])
  })

  it('JSON blob-download does not fetch the plot image or download a PNG', async () => {
    vi.stubGlobal('window', {})
    fetchMock.mockResolvedValue(okResponse('plot_digitizer.pdproj.json'))

    await triggerSessionExport('sess', 'json')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/sessions/sess/export?format=json'))
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/image'))
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.download).toBe('plot_digitizer.pdproj.json')
  })

  it('does not fetch a PNG sidecar when the user cancels the save picker', async () => {
    savePicker.mockRejectedValue(Object.assign(new Error('canceled'), { name: 'AbortError' }))

    await triggerSessionExport('sess', 'csv')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(anchors).toHaveLength(0)
  })

  it('writes the PNG sidecar through the picker parent directory handle', async () => {
    const pngWrite = vi.fn().mockResolvedValue(undefined)
    const pngClose = vi.fn().mockResolvedValue(undefined)
    const pngCreateWritable = vi.fn().mockResolvedValue({ write: pngWrite, close: pngClose })
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable: pngCreateWritable })
    const getParent = vi.fn().mockResolvedValue({ getFileHandle })
    savePicker.mockResolvedValue({
      createWritable,
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getParent,
    })
    mockExportAndImage('plot_digitizer.csv')

    await triggerSessionExport('sess', 'csv')

    expect(getParent).toHaveBeenCalled()
    expect(getFileHandle).toHaveBeenCalledWith('plot_digitizer.png', { create: true })
    expect(pngWrite).toHaveBeenCalledWith(expect.any(Blob))
    expect(pngClose).toHaveBeenCalledTimes(1)
    expect(anchors).toHaveLength(0)
  })

  it('names the PNG sidecar from the picked file stem, not Content-Disposition', async () => {
    const pngWrite = vi.fn().mockResolvedValue(undefined)
    const pngClose = vi.fn().mockResolvedValue(undefined)
    const pngCreateWritable = vi.fn().mockResolvedValue({ write: pngWrite, close: pngClose })
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable: pngCreateWritable })
    const getParent = vi.fn().mockResolvedValue({ getFileHandle })
    savePicker.mockResolvedValue({
      name: 'my-figure.csv',
      createWritable,
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getParent,
    })
    mockExportAndImage('plot_digitizer.csv')

    await triggerSessionExport('sess', 'csv')

    expect(getFileHandle).toHaveBeenCalledWith('my-figure.png', { create: true })
    expect(getFileHandle).not.toHaveBeenCalledWith('plot_digitizer.png', { create: true })
    expect(anchors).toHaveLength(0)
  })

  it('rejects with a sidecar error when CSV saved but the image fetch fails', async () => {
    vi.stubGlobal('window', {})
    mockExportAndImage('plot_digitizer.csv', false)

    await expect(triggerSessionExport('sess', 'csv')).rejects.toThrow(
      /^CSV saved, but the PNG sidecar failed:/,
    )
    expect(anchors.map((a) => a.download)).toContain('plot_digitizer.csv')
  })

  it('falls back to a blob download when createWritable is not allowed', async () => {
    createWritable.mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))
    fetchMock.mockResolvedValue(okResponse('figure.pdproj.json'))

    await triggerSessionExport('sess', 'json')

    expect(savePicker).toHaveBeenCalledTimes(1)
    expect(anchors[0]?.download).toBe('figure.pdproj.json')
    expect(anchors[0]?.click).toHaveBeenCalledTimes(1)
    expect(forms).toHaveLength(0)
  })

  it('does not download when the user cancels the save picker', async () => {
    savePicker.mockRejectedValue(Object.assign(new Error('canceled'), { name: 'AbortError' }))

    await triggerSessionExport('sess', 'json')

    expect(anchors).toHaveLength(0)
    expect(forms).toHaveLength(0)
  })
})
