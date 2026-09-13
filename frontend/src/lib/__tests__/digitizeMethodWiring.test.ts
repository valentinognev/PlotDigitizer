/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
const tabs = readFileSync(join(srcRoot, 'components/DigitizeMethodTabs.tsx'), 'utf8')
const panel = readFileSync(join(srcRoot, 'components/AutoDigitizePanel.tsx'), 'utf8')

describe('DigitizeMethodTabs', () => {
  it('is a tablist driven by DIGITIZE_METHOD_TABS', () => {
    expect(tabs).toContain("role=\"tablist\"")
    expect(tabs).toContain('DIGITIZE_METHOD_TABS')
    expect(tabs).toContain('aria-selected')
  })
})

describe('App digitize method wiring', () => {
  it('defaults to DEFAULT_DIGITIZE_METHOD and resets on session identity change', () => {
    expect(app).toContain('DigitizeMethodTabs')
    expect(app).toContain('useState<DigitizeMethod>(DEFAULT_DIGITIZE_METHOD)')
    expect(app).toMatch(/if \(next !== null\)[\s\S]*setDigitizeMethod\(DEFAULT_DIGITIZE_METHOD\)/)
  })

  it('clamps canvas mode when switching method and when landing on digitize', () => {
    expect(app).toContain('canvasModeAllowedOnDigitizeMethod')
    expect(app).toMatch(
      /handleDigitizeMethodChange[\s\S]*canvasModeAllowedOnDigitizeMethod\(next, canvasMode\)/,
    )
    expect(app).toMatch(
      /handleWorkflowStageChange[\s\S]*canvasModeAllowedOnDigitizeMethod\(digitizeMethod/,
    )
    expect(app).toMatch(
      /if \(next !== null\)[\s\S]*canvasModeAllowedOnDigitizeMethod\(DEFAULT_DIGITIZE_METHOD/,
    )
  })

  it('puts the magnifier below the figure, left-aligned, not in the aside', () => {
    const canvas = app.indexOf('<EditorCanvas')
    const mag = app.indexOf('<MagnifierView')
    const aside = app.indexOf('<aside')
    expect(canvas).toBeGreaterThan(0)
    expect(mag).toBeGreaterThan(canvas)
    expect(aside).toBeGreaterThan(mag)
    expect(app.slice(aside)).not.toContain('<MagnifierView')
    const well = app.slice(app.lastIndexOf('<div', mag), mag)
    expect(well).toContain('justify-start')
    expect(well).toContain('h-[160px]')
  })

  it('puts method tabs then only the selected panel', () => {
    const methodTabs = app.indexOf('<DigitizeMethodTabs')
    const auto = app.indexOf('<AutoDigitizePanel')
    const curves = app.indexOf('<CurveList')
    expect(methodTabs).toBeGreaterThan(0)
    expect(auto).toBeGreaterThan(methodTabs)
    expect(curves).toBeGreaterThan(auto)
    expect(app).toContain('digitizeMethodChrome(digitizeMethod)')
    expect(app).toContain('chrome.showAutoDigitize && methodChrome.showAutoDigitize')
    expect(app).toContain('chrome.showCurveList && methodChrome.showCurveList')
    expect(app).toContain('chrome.showAutoDigitize || chrome.showCurveList')
  })

  it('does not persist digitizeMethod on the session workspace', () => {
    expect(app).not.toMatch(/workspace:[\s\S]{0,200}digitizeMethod/)
    expect(app).not.toMatch(/digitize_method/)
  })
})

describe('AutoDigitizePanel height', () => {
  it('fills the tab pane and scrolls', () => {
    expect(panel).toMatch(/<section className="[^"]*flex-1[^"]*min-h-0[^"]*overflow-y-auto/)
  })
})
