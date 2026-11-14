import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport
  vv?.addEventListener('resize', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    vv?.removeEventListener('resize', onChange)
    window.removeEventListener('resize', onChange)
  }
}

/** Height of the visible area in px (0 when unknown or while pinch-zoomed). */
function getHeight(): number {
  const vv = window.visualViewport
  return vv && vv.scale <= 1.01 ? Math.round(vv.height) : 0
}

/**
 * Height of the area that is really visible. 100dvh does not shrink when the on-screen keyboard
 * opens on every browser, but visualViewport does. Returns null when it is not available, so the
 * CSS falls back to 100dvh.
 */
export function useVisualViewportHeight(): number | null {
  const h = useSyncExternalStore(subscribe, getHeight, () => 0)
  return h > 0 ? h : null
}
