/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  formatBoundValue,
  formatUnixDays,
  parseAxisToken,
  parseBoundValue,
  shouldLiveCommitBound,
} from '../dates'
import { CalibrationError } from '../transform2d'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'backend',
  'tests',
  'fixtures',
  'date_parity.json',
)

describe('parseAxisToken', () => {
  it('parses a plain number', () => {
    const [value, kind] = parseAxisToken('1.5')
    expect(kind).toBe('number')
    expect(value).toBeCloseTo(1.5, 9)
  })

  it('parses YYYY/MM/DD as unix days', () => {
    const [value, kind] = parseAxisToken('2020/01/15')
    expect(kind).toBe('date')
    expect(value).toBeCloseTo(18276.0, 9)
  })

  it('accepts hyphen datetime tokens', () => {
    const [value, kind] = parseAxisToken('2020-01-15 12:00:00')
    expect(kind).toBe('date')
    expect(value).toBeCloseTo(18276.5, 9)
  })

  it('throws CalibrationError on invalid tokens', () => {
    expect(() => parseAxisToken('not-a-date')).toThrow(CalibrationError)
    expect(() => parseAxisToken('2020/13/01')).toThrow(CalibrationError)
    expect(() => parseAxisToken('2020/01-15')).toThrow(CalibrationError)
    expect(() => parseAxisToken('2020-01-15T12:00:00')).toThrow(CalibrationError)
    expect(() => parseAxisToken('')).toThrow(CalibrationError)
  })
})

describe('formatUnixDays', () => {
  it('formats date-only with YYYY/MM/DD', () => {
    expect(formatUnixDays(18276.0, 'YYYY/MM/DD')).toBe('2020/01/15')
    expect(formatUnixDays(0.0, 'YYYY/MM/DD')).toBe('1970/01/01')
  })

  it('formats a time part with YYYY/MM/DD hh:mm:ss', () => {
    expect(formatUnixDays(18276.5, 'YYYY/MM/DD hh:mm:ss')).toBe('2020/01/15 12:00:00')
  })
})

describe('parse/format round-trip', () => {
  it('round-trips a date-only token', () => {
    const [value, kind] = parseAxisToken('2020/01/15')
    expect(kind).toBe('date')
    expect(formatUnixDays(value, 'YYYY/MM/DD')).toBe('2020/01/15')
  })

  it('round-trips a datetime token with the time pattern', () => {
    const [value, kind] = parseAxisToken('2020-01-15 12:00:00')
    expect(kind).toBe('date')
    expect(formatUnixDays(value, 'YYYY/MM/DD hh:mm:ss')).toBe('2020/01/15 12:00:00')
  })
})

describe('date_parity.json', () => {
  it('agrees with Python fixture to 1e-9', () => {
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      cases: Array<{ text: string; unix_days: number; pattern: string }>
    }
    expect(payload.cases.length).toBeGreaterThan(0)
    for (const cse of payload.cases) {
      const [value, kind] = parseAxisToken(cse.text)
      expect(kind).toBe('date')
      expect(value, cse.text).toBeCloseTo(cse.unix_days, 9)
      expect(formatUnixDays(cse.unix_days, cse.pattern)).toBe(cse.text)
    }
  })
})

describe('BoundInput date scale', () => {
  it('displays unix days as YYYY/MM/DD', () => {
    expect(formatBoundValue(18276.0, 'date')).toBe('2020/01/15')
    expect(formatBoundValue(18276.5, 'date')).toBe('2020/01/15 12:00:00')
    expect(formatBoundValue(12.5, 'linear')).toBe('12.5')
  })

  it('commits a date token to unix days', () => {
    expect(parseBoundValue('2020/01/15', 'date')).toBeCloseTo(18276.0, 9)
  })

  it('rejects a date token on a log axis', () => {
    expect(() => parseBoundValue('2020/01/15', 'log')).toThrow(CalibrationError)
    expect(() => parseBoundValue('2020/01/15', 'log')).toThrow(/Log and date/)
  })
})

describe('date BoundInput live-commit policy', () => {
  it('does not live-commit date-scale keystrokes, including number prefixes', () => {
    for (const raw of ['2', '20', '2020', '2020/', '2020/01', '2020/01/1', '2020/01/15']) {
      expect(shouldLiveCommitBound(raw, 'date'), raw).toBe(false)
    }
  })

  it('keeps YYYY/MM/DD keystrokes in draft instead of rewriting to unix-days dates', () => {
    // Old live-commit policy treats "2" as unix-days 2 → "1970/01/03"
    // and "2020/01/1" as a complete date → "2020/01/01", blocking "2020/01/15".
    expect(formatBoundValue(parseBoundValue('2', 'date'), 'date')).toBe('1970/01/03')
    expect(formatBoundValue(parseBoundValue('2020/01/1', 'date'), 'date')).toBe('2020/01/01')
    for (const raw of ['2', '20', '202', '2020', '2020/', '2020/0', '2020/01', '2020/01/', '2020/01/1']) {
      const live = shouldLiveCommitBound(raw, 'date')
      const draft = live ? formatBoundValue(parseBoundValue(raw, 'date'), 'date') : raw
      expect(draft, raw).toBe(raw)
      expect(live, raw).toBe(false)
    }
  })

  it('still live-commits finished numbers on linear and log', () => {
    expect(shouldLiveCommitBound('12.5', 'linear')).toBe(true)
    expect(shouldLiveCommitBound('10', 'log')).toBe(true)
    expect(shouldLiveCommitBound('12.', 'linear')).toBe(false)
    expect(shouldLiveCommitBound('-', 'linear')).toBe(false)
  })
})
