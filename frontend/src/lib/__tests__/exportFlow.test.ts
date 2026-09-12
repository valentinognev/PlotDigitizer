import { describe, expect, it, vi } from 'vitest'
import { runSessionExport, sidecarPngFilename } from '../exportFlow'

describe('sidecarPngFilename', () => {
  it('replaces a .csv extension with .png', () => {
    expect(sidecarPngFilename('plot.csv')).toBe('plot.png')
  })

  it('replaces a .CSV extension with lowercase .png', () => {
    expect(sidecarPngFilename('plot.CSV')).toBe('plot.png')
  })

  it('keeps a multi-word stem when replacing .csv', () => {
    expect(sidecarPngFilename('plot_digitizer.csv')).toBe('plot_digitizer.png')
  })

  it('appends .png when the filename has no extension', () => {
    expect(sidecarPngFilename('figure')).toBe('figure.png')
  })
})


describe('runSessionExport', () => {
  it('awaits onBeforeExport before triggering the export', async () => {
    const order: string[] = []
    const onBeforeExport = vi.fn(async () => {
      order.push('flush-start')
      await Promise.resolve()
      order.push('flush-end')
    })
    const triggerExport = vi.fn(async () => {
      order.push('export')
    })

    await runSessionExport('json', { onBeforeExport, triggerExport })

    expect(order).toEqual(['flush-start', 'flush-end', 'export'])
    expect(triggerExport).toHaveBeenCalledWith('json')
  })

  it('still exports (best-effort) when onBeforeExport rejects', async () => {
    const onBeforeExport = vi.fn().mockRejectedValue(new Error('flush failed'))
    const triggerExport = vi.fn(async () => {})

    await expect(runSessionExport('csv', { onBeforeExport, triggerExport })).resolves.toBeUndefined()

    expect(triggerExport).toHaveBeenCalledWith('csv')
  })

  it('exports directly when onBeforeExport is not provided', async () => {
    const triggerExport = vi.fn(async () => {})

    await runSessionExport('json', { triggerExport })

    expect(triggerExport).toHaveBeenCalledWith('json')
  })

  it('propagates a triggerExport failure', async () => {
    const onBeforeExport = vi.fn(async () => {})
    const triggerExport = vi.fn().mockRejectedValue(new Error('export failed'))

    await expect(runSessionExport('csv', { onBeforeExport, triggerExport })).rejects.toThrow(
      'export failed',
    )
  })
})
