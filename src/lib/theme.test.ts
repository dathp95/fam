import { describe, expect, it } from 'vitest'
import { dataThemeFor, parseThemeMode, resolveTheme, toggledMode } from './theme.ts'

describe('theme mode', () => {
  it('reads a stored light or dark choice', () => {
    expect(parseThemeMode('light')).toBe('light')
    expect(parseThemeMode('dark')).toBe('dark')
  })

  it('treats missing or unknown values as system', () => {
    for (const v of [null, undefined, '', 'system', 'blue', 'LIGHT']) expect(parseThemeMode(v)).toBe('system')
  })

  it('sets data-theme only for an explicit choice', () => {
    expect(dataThemeFor('light')).toBe('light')
    expect(dataThemeFor('dark')).toBe('dark')
    expect(dataThemeFor('system')).toBeNull()
  })

  it('resolves system to the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('toggles dark to light and light to dark', () => {
    expect(toggledMode('dark', false)).toBe('light')
    expect(toggledMode('light', true)).toBe('dark')
  })

  it('toggles from "system" based on what is currently shown', () => {
    expect(toggledMode('system', true)).toBe('light')
    expect(toggledMode('system', false)).toBe('dark')
  })
})
