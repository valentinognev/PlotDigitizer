import type { ImageSource } from '../types'

const NO_IMAGE = 'No image loaded'

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/** Display label for the current session image: stored path, else filename. */
export function imageSourceLabel(source: ImageSource | null | undefined): string {
  const path = trimOrEmpty(source?.path)
  if (path) return path
  const filename = trimOrEmpty(source?.filename)
  if (filename) return filename
  return NO_IMAGE
}
