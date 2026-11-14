/** User-configurable keyboard shortcut for "Nghe lại" (desktop), persisted in localStorage. */

export interface Shortcut {
  /** KeyboardEvent.code, e.g. "KeyR", "Tab", "Space" (layout independent, unaffected by Alt). */
  code: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

type KeyEventLike = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

const KEY = 'fam.shortcut'

export const DEFAULT_SHORTCUT: Shortcut = { code: 'KeyR', ctrl: false, alt: true, shift: false, meta: false }

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'])

export const isModifierKey = (e: Pick<KeyboardEvent, 'key'>) => MODIFIER_KEYS.has(e.key)

/** A shortcut needs at least one modifier, so it never hijacks normal typing or plain Tab. */
export const isValidShortcut = (s: Shortcut) => s.ctrl || s.alt || s.shift || s.meta

export function shortcutFromEvent(e: KeyEventLike): Shortcut {
  return { code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }
}

export function matchesShortcut(e: KeyEventLike, s: Shortcut): boolean {
  return (
    !isModifierKey(e) &&
    e.code === s.code &&
    e.ctrlKey === s.ctrl &&
    e.altKey === s.alt &&
    e.shiftKey === s.shift &&
    e.metaKey === s.meta
  )
}

export function formatShortcut(s: Shortcut): string {
  const key = s.code.replace(/^Key/, '').replace(/^Digit/, '')
  return [s.ctrl && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', s.meta && 'Meta', key]
    .filter(Boolean)
    .join('+')
}

export function loadShortcut(): Shortcut {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const s = raw as Partial<Shortcut>
      if (
        typeof s.code === 'string' &&
        s.code &&
        typeof s.ctrl === 'boolean' &&
        typeof s.alt === 'boolean' &&
        typeof s.shift === 'boolean' &&
        typeof s.meta === 'boolean'
      ) {
        const loaded = s as Shortcut
        if (isValidShortcut(loaded)) return loaded
      }
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_SHORTCUT
}

export function saveShortcut(s: Shortcut): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
