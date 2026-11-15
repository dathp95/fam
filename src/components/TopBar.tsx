import { FamLogo } from './brand/FamLogo.tsx'
import { LANGUAGES, DEFAULT_LANGUAGE_ID } from '../lib/languages.ts'
import type { Progress } from '../lib/progress.ts'
import { THEME_LABELS, THEME_MODES, type ThemeMode } from '../lib/theme.ts'
import { ProgressStats } from './ProgressStats.tsx'

interface Props {
  progress: Progress
  mode: ThemeMode
  onSetTheme: (mode: ThemeMode) => void
  /** Tapping the logo goes back to the home screen. */
  onHome: () => void
}

export function TopBar({ progress, mode, onSetTheme, onHome }: Props) {
  return (
    <header className="top">
      <button className="brand" onClick={onHome} aria-label="FAM, về trang chủ">
        <FamLogo variant="wordmark" height={36} />
        <small>Nghe chép chính tả · {LANGUAGES[DEFAULT_LANGUAGE_ID].name}</small>
      </button>
      <ProgressStats progress={progress} />
      <div className="theme-switch" role="group" aria-label="Giao diện">
        {THEME_MODES.map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => onSetTheme(m)}>
            {THEME_LABELS[m]}
          </button>
        ))}
      </div>
    </header>
  )
}
