import { levelOf, xpIntoLevel, XP_PER_LEVEL, type Progress } from '../lib/progress.ts'

/** Level, total XP (with the bar to the next level) and the day streak. Shared by Home and Practice. */
export function ProgressStats({ progress }: { progress: Progress }) {
  const pct = xpIntoLevel(progress.xp)
  return (
    <>
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
    </>
  )
}
