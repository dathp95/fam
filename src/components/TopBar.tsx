import { FamLogo } from './brand/FamLogo.tsx'
import { LANGUAGES, DEFAULT_LANGUAGE_ID } from '../lib/languages.ts'
import type { Progress } from '../lib/progress.ts'
import { ProgressStats } from './ProgressStats.tsx'

interface Props {
  progress: Progress
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  /** Tapping the logo goes back to the home screen. */
  onHome: () => void
}

export function TopBar({ progress, theme, onToggleTheme, onHome }: Props) {
  return (
    <header className="top">
      <button className="brand" onClick={onHome} aria-label="FAM, về trang chủ">
        <FamLogo variant="wordmark" height={36} />
        <small>Nghe chép chính tả · {LANGUAGES[DEFAULT_LANGUAGE_ID].name}</small>
      </button>
      <ProgressStats progress={progress} />
      <button
        className="theme-toggle"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      >
        <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌕'}</span>
      </button>
    </header>
  )
}
