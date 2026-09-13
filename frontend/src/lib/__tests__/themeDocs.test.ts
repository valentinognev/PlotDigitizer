/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const updates = readFileSync(join(repo, 'UPDATES.md'), 'utf8')

describe('UPDATES.md 2.20.0', () => {
  it('records the day skin and header switch as the newest entry', () => {
    const changelog = updates.split('## Changelog')[1] ?? ''
    const firstEntry = changelog.split(/^## \[/m)[1] ?? ''
    expect(firstEntry.startsWith('2.20.0]')).toBe(true)
    expect(firstEntry.toLowerCase()).toContain('day')
    expect(firstEntry.toLowerCase()).toContain('night')
    expect(firstEntry.toLowerCase()).toMatch(/header|top/)
  })
})
