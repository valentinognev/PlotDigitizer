import { describe, expect, it } from 'vitest'
import { fileFromDrop } from '../imageDrop'

function dt(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer
}

it('returns the first image file and ignores non-images', () => {
  const png = new File([new Uint8Array([1])], 'plot.png', { type: 'image/png' })
  const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
  expect(fileFromDrop(dt([pdf, png]))?.name).toBe('plot.png')
  expect(fileFromDrop(dt([pdf]))).toBeNull()
  expect(fileFromDrop(null)).toBeNull()
})
