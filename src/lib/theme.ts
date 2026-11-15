/** Theme mode: an explicit light/dark choice, or "system" (no data-theme attribute, follows the OS). */

export type ThemeMode = 'light' | 'dark' | 'system'

/** Stored value -> mode. Anything unknown (or missing) means "system". */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

/** The data-theme attribute for a mode: "light" / "dark", or null (remove it) for "system". */
export const dataThemeFor = (mode: ThemeMode): 'light' | 'dark' | null => (mode === 'system' ? null : mode)

/** The theme actually shown: an explicit choice, or the OS preference for "system". */
export const resolveTheme = (mode: ThemeMode, systemDark: boolean): 'light' | 'dark' =>
  mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

/** One tap: dark -> light, light -> dark (becomes an explicit choice even when it was "system"). */
export const toggledMode = (mode: ThemeMode, systemDark: boolean): 'light' | 'dark' =>
  resolveTheme(mode, systemDark) === 'dark' ? 'light' : 'dark'
