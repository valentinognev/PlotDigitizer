export function fileFromDrop(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}

export function dropHasFiles(data: DataTransfer | null): boolean {
  if (!data) return false
  if (Array.from(data.types ?? []).includes('Files')) return true
  return fileFromDrop(data) !== null
}

type DropEvent = {
  dataTransfer: DataTransfer | null
  preventDefault: () => void
}

export function handleRootFileDragOver(e: DropEvent): void {
  if (!dropHasFiles(e.dataTransfer)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

export function handleRootFileDrop(
  e: DropEvent,
  busy: boolean,
  upload: (file: File) => void,
): void {
  if (!dropHasFiles(e.dataTransfer)) return
  e.preventDefault()
  if (busy) return
  const file = fileFromDrop(e.dataTransfer)
  if (file) upload(file)
}
