import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUT,
  formatShortcut,
  isValidShortcut,
  matchesShortcut,
  shortcutFromEvent,
} from './shortcut.ts'

const ev = (over: Partial<Parameters<typeof matchesShortcut>[0]> = {}) => ({
  code: 'KeyR',
  key: 'r',
  ctrlKey: false,
  altKey: true,
  shiftKey: false,
  metaKey: false,
  ...over,
})

describe('shortcut', () => {
  it('matches the exact combination only', () => {
    expect(matchesShortcut(ev(), DEFAULT_SHORTCUT)).toBe(true)
    expect(matchesShortcut(ev({ shiftKey: true }), DEFAULT_SHORTCUT)).toBe(false)
    expect(matchesShortcut(ev({ code: 'KeyT' }), DEFAULT_SHORTCUT)).toBe(false)
    expect(matchesShortcut(ev({ altKey: false }), DEFAULT_SHORTCUT)).toBe(false)
  })

  it('ignores presses of the modifier key itself', () => {
    const s = { code: 'AltLeft', ctrl: false, alt: true, shift: false, meta: false }
    expect(matchesShortcut(ev({ code: 'AltLeft', key: 'Alt' }), s)).toBe(false)
  })

  it('formats for display', () => {
    expect(formatShortcut(DEFAULT_SHORTCUT)).toBe('Alt+R')
    expect(formatShortcut({ code: 'Tab', ctrl: true, alt: false, shift: true, meta: false })).toBe('Ctrl+Shift+Tab')
    expect(formatShortcut({ code: 'Digit1', ctrl: true, alt: false, shift: false, meta: false })).toBe('Ctrl+1')
  })

  it('requires at least one modifier', () => {
    expect(isValidShortcut(shortcutFromEvent(ev({ altKey: false })))).toBe(false)
    expect(isValidShortcut(shortcutFromEvent(ev()))).toBe(true)
  })
})
