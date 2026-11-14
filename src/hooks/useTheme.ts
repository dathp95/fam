import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'fam.theme'

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Explicit choice overrides the system preference; until chosen, follows the system. */
export function useTheme() {
  const [stored, setStored] = useState<Theme | null>(readStored)
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches)

  useEffect(() => {
    const q = darkQuery()
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    q.addEventListener('change', onChange)
    return () => q.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (stored) root.dataset.theme = stored
    else delete root.dataset.theme
  }, [stored])

  const theme: Theme = stored ?? (systemDark ? 'dark' : 'light')

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setStored(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* ignore */
    }
  }, [theme])

  return { theme, toggle }
}
