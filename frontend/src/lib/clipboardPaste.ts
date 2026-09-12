function tagNameOf(target: object): string | null {
  const tag = (target as { tagName?: unknown }).tagName
  return typeof tag === 'string' ? tag.toUpperCase() : null
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== 'object') return false
  const tag = tagNameOf(target)
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === null) return false
  return Boolean((target as HTMLElement).isContentEditable)
}

function clipboardFileName(type: string): string {
  if (type === 'image/jpeg') return 'clipboard.jpg'
  if (type === 'image/webp') return 'clipboard.webp'
  return 'clipboard.png'
}

export function fileFromClipboardData(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (!file) return null
    return new File([file], clipboardFileName(file.type), { type: file.type })
  }
  return null
}

export function handleClipboardPaste(
  e: { target: EventTarget | null; clipboardData: DataTransfer | null; preventDefault: () => void },
  upload: (file: File) => void,
): boolean {
  if (isEditablePasteTarget(e.target)) return false
  const file = fileFromClipboardData(e.clipboardData)
  if (!file) return false
  e.preventDefault()
  upload(file)
  return true
}
