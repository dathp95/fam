import { useSyncExternalStore } from 'react'

/** The part of the page that is really visible (excludes the on-screen keyboard). */
export interface VisualViewportBox {
  /** Visible height in px. */
  height: number
  /** Offset of the visible area from the top of the layout viewport (iOS scrolls it up with the keyboard). */
  top: number
  /** True when something like the on-screen keyboard covers a big part of the window. */
  keyboard: boolean
}

const KEYBOARD_MIN_PX = 120
const NONE: VisualViewportBox = { height: 0, top: 0, keyboard: false }

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport
  vv?.addEventListener('resize', onChange)
  vv?.addEventListener('scroll', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    vv?.removeEventListener('resize', onChange)
    vv?.removeEventListener('scroll', onChange)
    window.removeEventListener('resize', onChange)
  }
}

// useSyncExternalStore needs a stable snapshot: keep the last object until a value changes.
let cache: VisualViewportBox = NONE

function getSnapshot(): VisualViewportBox {
  const vv = window.visualViewport
  const next: VisualViewportBox =
    vv && vv.scale <= 1.01 // pinch-zoomed: ignore, fall back to the CSS defaults
      ? {
          height: Math.round(vv.height),
          top: Math.round(vv.offsetTop),
          keyboard: window.innerHeight - vv.height > KEYBOARD_MIN_PX,
        }
      : NONE
  if (next.height !== cache.height || next.top !== cache.top || next.keyboard !== cache.keyboard) cache = next
  return cache
}

/**
 * Size and position of the visible area. 100dvh does not follow the on-screen keyboard everywhere
 * (iOS lets the keyboard cover the page), but visualViewport does. Returns null when unavailable,
 * so the CSS falls back to 100dvh.
 */
export function useVisualViewport(): VisualViewportBox | null {
  const box = useSyncExternalStore(subscribe, getSnapshot, () => NONE)
  return box.height > 0 ? box : null
}
