import { LANGUAGES, DEFAULT_LANGUAGE_ID } from '../lib/languages.ts'
import type { Progress } from '../lib/progress.ts'
import type { Theme } from '../hooks/useTheme.ts'
import { ProgressStats } from './ProgressStats.tsx'

interface Props {
  progress: Progress
  theme: Theme
  onToggleTheme: () => void
}

export function TopBar({ progress, theme, onToggleTheme }: Props) {
  return (
    <header className="top">
      <div className="brand">
        FAM<small>Nghe chép chính tả · {LANGUAGES[DEFAULT_LANGUAGE_ID].name}</small>
      </div>
      <ProgressStats progress={progress} />
      <button className="btn theme" onClick={onToggleTheme} aria-label="Đổi chế độ sáng/tối">
        {theme === 'dark' ? '☀ Sáng' : '☾ Tối'}
      </button>
    </header>
  )
}
