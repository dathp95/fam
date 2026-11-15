/** Theme mode: an explicit light/dark choice, or "system" (no data-theme attribute, follows the OS). */

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']
export const THEME_LABELS: Record<ThemeMode, string> = { light: 'Sáng', dark: 'Tối', system: 'Theo hệ thống' }

/** Stored value -> mode. Anything unknown (or missing) means "system". */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

/** The data-theme attribute for a mode: "light" / "dark", or null (remove it) for "system". */
export const dataThemeFor = (mode: ThemeMode): 'light' | 'dark' | null => (mode === 'system' ? null : mode)
