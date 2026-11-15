import { useCallback, useEffect, useState } from 'react'
import { dataThemeFor, parseThemeMode, type ThemeMode } from '../lib/theme.ts'

const KEY = 'fam.theme'

function readStored(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(KEY))
  } catch {
    return 'system'
  }
}

/**
 * Light / dark / system. The choice is saved in localStorage and applied as data-theme on <html>
 * ("system" removes the attribute so the CSS follows prefers-color-scheme). index.html applies the
 * saved value before first paint, so there is no flash.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readStored)

  useEffect(() => {
    const root = document.documentElement
    const value = dataThemeFor(mode)
    if (value) root.dataset.theme = value
    else delete root.dataset.theme
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      /* storage may be disabled */
    }
  }, [])

  return { mode, setMode }
}
