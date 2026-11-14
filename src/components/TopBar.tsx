import { LANGUAGES, DEFAULT_LANGUAGE_ID } from '../lib/languages.ts'
import { levelOf, xpIntoLevel, XP_PER_LEVEL, type Progress } from '../lib/progress.ts'
import type { Theme } from '../hooks/useTheme.ts'

interface Props {
  progress: Progress
  theme: Theme
  onToggleTheme: () => void
}

export function TopBar({ progress, theme, onToggleTheme }: Props) {
  const pct = xpIntoLevel(progress.xp)
  return (
    <header className="top">
      <div className="brand">
        FAM<small>Nghe chép chính tả · {LANGUAGES[DEFAULT_LANGUAGE_ID].name}</small>
      </div>
      <div className="stat">
        <b>Lv {levelOf(progress.xp)}</b>
        <span>Cấp độ</span>
      </div>
      <div className="stat">
        <div className="xpbar" role="img" aria-label="Tiến độ lên cấp">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span>
          {progress.xp} XP · còn {XP_PER_LEVEL - pct} lên cấp
        </span>
      </div>
      <div className="stat">
        <b>{progress.streak} ngày</b>
        <span>Chuỗi liên tiếp</span>
      </div>
      <button className="btn theme" onClick={onToggleTheme} aria-label="Đổi chế độ sáng/tối">
        {theme === 'dark' ? '☀ Sáng' : '☾ Tối'}
      </button>
    </header>
  )
}
