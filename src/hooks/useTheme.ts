import { useCallback, useEffect, useState } from 'react'
import { dataThemeFor, parseThemeMode, resolveTheme, toggledMode, type ThemeMode } from '../lib/theme.ts'

const KEY = 'fam.theme'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function readStored(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(KEY))
  } catch {
    return 'system'
  }
}

/**
 * Light or dark, with one `toggle`. Until the learner taps it, the OS preference decides; after that
 * the choice is saved in localStorage and applied as data-theme on <html>. index.html applies the
 * saved value before first paint, so there is no flash.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStored)
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches)

  useEffect(() => {
    const q = darkQuery()
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    q.addEventListener('change', onChange)
    return () => q.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const value = dataThemeFor(mode)
    if (value) root.dataset.theme = value
    else delete root.dataset.theme
  }, [mode])

  const toggle = useCallback(() => {
    const next = toggledMode(mode, systemDark)
    setMode(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* storage may be disabled */
    }
  }, [mode, systemDark])

  return { theme: resolveTheme(mode, systemDark), toggle }
}
