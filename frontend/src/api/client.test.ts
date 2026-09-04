import { describe, expect, it } from 'vitest'
import { shouldRevertSessionOnPrefsError } from './client'

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
