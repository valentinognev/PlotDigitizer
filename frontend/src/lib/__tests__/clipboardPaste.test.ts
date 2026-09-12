import { describe, expect, it } from 'vitest'
import {
  fileFromClipboardData,
  handleClipboardPaste,
  isEditablePasteTarget,
} from '../clipboardPaste'

type FakeItem = {
  kind: string
  type: string
  getAsFile: () => File | null
}

function clipboardData(items: FakeItem[]): DataTransfer {
  return { items } as unknown as DataTransfer
}

function imageFile(type: string, name = 'paste.bin'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

function el(tagName: string, extra: Record<string, unknown> = {}): EventTarget {
  return { tagName, ...extra } as unknown as EventTarget
}

describe('isEditablePasteTarget', () => {
  it('treats input, textarea, select, and contenteditable as editable; body is not', () => {
    expect(isEditablePasteTarget(el('INPUT'))).toBe(true)
    expect(isEditablePasteTarget(el('TEXTAREA'))).toBe(true)
    expect(isEditablePasteTarget(el('SELECT'))).toBe(true)
    expect(isEditablePasteTarget(el('DIV', { isContentEditable: true }))).toBe(true)

    expect(isEditablePasteTarget(el('BODY'))).toBe(false)
    expect(isEditablePasteTarget(null)).toBe(false)
    expect(isEditablePasteTarget({ nodeType: 3 } as unknown as EventTarget)).toBe(false)
  })
})

describe('fileFromClipboardData', () => {
  it('returns a File named clipboard.png from an image/png clipboard item', () => {
    const file = fileFromClipboardData(
      clipboardData([
        { kind: 'file', type: 'image/png', getAsFile: () => imageFile('image/png', 'shot.png') },
      ]),
    )
    expect(file).toBeInstanceOf(File)
    expect(file?.name).toBe('clipboard.png')
    expect(file?.type).toBe('image/png')
  })

  it('names jpeg clipboard.jpg and webp clipboard.webp', () => {
    const jpeg = fileFromClipboardData(
      clipboardData([
        { kind: 'file', type: 'image/jpeg', getAsFile: () => imageFile('image/jpeg', 'photo.jpeg') },
      ]),
    )
    expect(jpeg?.name).toBe('clipboard.jpg')
    expect(jpeg?.type).toBe('image/jpeg')

    const webp = fileFromClipboardData(
      clipboardData([
        { kind: 'file', type: 'image/webp', getAsFile: () => imageFile('image/webp', 'photo.webp') },
      ]),
    )
    expect(webp?.name).toBe('clipboard.webp')
    expect(webp?.type).toBe('image/webp')
  })

  it('returns null when there is no image item', () => {
    expect(fileFromClipboardData(null)).toBeNull()
    expect(
      fileFromClipboardData(
        clipboardData([
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'application/pdf', getAsFile: () => imageFile('application/pdf') },
        ]),
      ),
    ).toBeNull()
  })

  it('returns null when getAsFile returns null for the image item', () => {
    expect(
      fileFromClipboardData(
        clipboardData([{ kind: 'file', type: 'image/png', getAsFile: () => null }]),
      ),
    ).toBeNull()
  })
})

describe('handleClipboardPaste', () => {
  it('does not upload when pasting into an input', () => {
    const uploaded = { current: null as File | null }
    let prevented = false
    const handled = handleClipboardPaste(
      {
        target: el('INPUT'),
        clipboardData: clipboardData([
          { kind: 'file', type: 'image/png', getAsFile: () => imageFile('image/png') },
        ]),
        preventDefault: () => {
          prevented = true
        },
      },
      (file) => {
        uploaded.current = file
      },
    )
    expect(handled).toBe(false)
    expect(uploaded.current).toBeNull()
    expect(prevented).toBe(false)
  })

  it('prevents default and uploads when pasting an image on the body', () => {
    const uploaded = { current: null as File | null }
    let prevented = false
    const handled = handleClipboardPaste(
      {
        target: el('BODY'),
        clipboardData: clipboardData([
          { kind: 'file', type: 'image/png', getAsFile: () => imageFile('image/png') },
        ]),
        preventDefault: () => {
          prevented = true
        },
      },
      (file) => {
        uploaded.current = file
      },
    )
    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(uploaded.current).toBeInstanceOf(File)
    expect(uploaded.current?.name).toBe('clipboard.png')
  })
})
