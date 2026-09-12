import type { Scale } from '../types'
import { CalibrationError } from './transform2d'

const MS_PER_DAY = 86400 * 1000

const DATE_RE =
  /^(\d{4})([/-])(\d{1,2})\2(\d{1,2})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

export type AxisTokenKind = 'number' | 'date'

function invalidToken(): never {
  throw new CalibrationError(
    'Invalid axis token',
    'Enter a number or a date like YYYY/MM/DD',
  )
}

export function parseAxisToken(text: string): [number, AxisTokenKind] {
  const raw = text.trim()
  if (!raw) invalidToken()

  const dateMatch = DATE_RE.exec(raw)
  if (dateMatch) {
    const year = Number(dateMatch[1])
    const month = Number(dateMatch[3])
    const day = Number(dateMatch[4])
    const hour = dateMatch[5] !== undefined ? Number(dateMatch[5]) : 0
    const minute = dateMatch[6] !== undefined ? Number(dateMatch[6]) : 0
    const second = dateMatch[7] !== undefined ? Number(dateMatch[7]) : 0
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
      invalidToken()
    }
    const ms = Date.UTC(year, month - 1, day, hour, minute, second)
    const check = new Date(ms)
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day ||
      check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute ||
      check.getUTCSeconds() !== second
    ) {
      invalidToken()
    }
    return [ms / MS_PER_DAY, 'date']
  }

  if (!NUMBER_RE.test(raw)) invalidToken()
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new CalibrationError(
      'Invalid axis token',
      'Enter a finite number or a date like YYYY/MM/DD',
    )
  }
  return [value, 'number']
}

export function formatUnixDays(value: number, pattern: string): string {
  if (!Number.isFinite(value)) {
    throw new CalibrationError('Invalid unix-days value', 'Unix days must be a finite number')
  }
  const dt = new Date(value * MS_PER_DAY)
  const replacements: Array<[string, string]> = [
    ['YYYY', String(dt.getUTCFullYear()).padStart(4, '0')],
    ['MM', String(dt.getUTCMonth() + 1).padStart(2, '0')],
    ['DD', String(dt.getUTCDate()).padStart(2, '0')],
    ['hh', String(dt.getUTCHours()).padStart(2, '0')],
    ['mm', String(dt.getUTCMinutes()).padStart(2, '0')],
    ['ss', String(dt.getUTCSeconds()).padStart(2, '0')],
  ]
  let out = pattern
  for (const [token, repl] of replacements) {
    out = out.split(token).join(repl)
  }
  return out
}

export function formatBoundValue(value: number | null, scale: Scale): string {
  if (value == null) return ''
  if (scale === 'date') {
    const pattern = Math.abs(value - Math.round(value)) > 1e-6 ? 'YYYY/MM/DD hh:mm:ss' : 'YYYY/MM/DD'
    return formatUnixDays(value, pattern)
  }
  return String(value)
}

export function parseBoundValue(raw: string, scale: Scale): number {
  const [value, kind] = parseAxisToken(raw)
  if (scale === 'log' && kind === 'date') {
    throw new CalibrationError(
      'Log and date cannot be used on the same axis',
      'Choose either log or date',
    )
  }
  if (scale === 'log' && value <= 0) {
    throw new CalibrationError(
      'Log scale requires values > 0',
      'Enter a value greater than zero',
    )
  }
  return value
}
