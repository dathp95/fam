import { describe, expect, it } from 'vitest'
import { dataThemeFor, parseThemeMode, THEME_MODES } from './theme.ts'

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

  it('offers light, dark and system', () => {
    expect([...THEME_MODES]).toEqual(['light', 'dark', 'system'])
  })
})
