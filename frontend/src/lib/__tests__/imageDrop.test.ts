import { describe, expect, it } from 'vitest'
import { fileFromDrop, handleRootFileDragOver, handleRootFileDrop } from '../imageDrop'

function dt(opts: { files?: File[]; types?: string[] }): DataTransfer {
  return { files: opts.files ?? [], types: opts.types ?? [] } as unknown as DataTransfer
}

function png(): File {
  return new File([new Uint8Array([1])], 'plot.png', { type: 'image/png' })
}

function pdf(): File {
  return new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
}

describe('fileFromDrop', () => {
  it('returns the first image file and ignores non-images', () => {
    expect(fileFromDrop(dt({ files: [pdf(), png()] }))?.name).toBe('plot.png')
    expect(fileFromDrop(dt({ files: [pdf()] }))).toBeNull()
    expect(fileFromDrop(null)).toBeNull()
  })
})

describe('handleRootFileDragOver', () => {
  it('prevents default when types includes Files', () => {
    let prevented = false
    handleRootFileDragOver({
      dataTransfer: dt({ types: ['Files'] }),
      preventDefault: () => {
        prevented = true
      },
    })
    expect(prevented).toBe(true)
  })

  it('does not prevent default when there are no files', () => {
    let prevented = false
    handleRootFileDragOver({
      dataTransfer: dt({ types: ['text/plain'] }),
      preventDefault: () => {
        prevented = true
      },
    })
    expect(prevented).toBe(false)
  })
})

describe('handleRootFileDrop', () => {
  it('prevents default when busy and does not upload', () => {
    let prevented = false
    const uploaded: File[] = []
    handleRootFileDrop(
      {
        dataTransfer: dt({ files: [png()], types: ['Files'] }),
        preventDefault: () => {
          prevented = true
        },
      },
      true,
      (file) => {
        uploaded.push(file)
      },
    )
    expect(prevented).toBe(true)
    expect(uploaded).toEqual([])
  })

  it('prevents default and uploads when not busy', () => {
    let prevented = false
    const uploaded: File[] = []
    handleRootFileDrop(
      {
        dataTransfer: dt({ files: [png()], types: ['Files'] }),
        preventDefault: () => {
          prevented = true
        },
      },
      false,
      (file) => {
        uploaded.push(file)
      },
    )
    expect(prevented).toBe(true)
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].name).toBe('plot.png')
  })
})

