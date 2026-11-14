import { averageScore } from '../lib/diff.ts'
import { PASS_SCORE } from '../lib/progress.ts'
import type { RevealOutcome } from '../lib/series.ts'
import { Picture } from './Picture.tsx'

interface Props {
  scores: number[]
  gained: number
  /** Picture-reveal result when the lesson belongs to a series, otherwise null. */
  outcome: RevealOutcome | null
  onAgain: () => void
  onHome: () => void
}

export function Result({ scores, gained, outcome, onAgain, onHome }: Props) {
  const avg = averageScore(scores)
  const perfect = scores.filter((x) => x === 100).length
  return (
    <div className="stack">
      <div className="card stack">
        <h2>Hoàn thành bài học</h2>
        <div className="row">
          <div className="score">{avg}</div>
          <div>
            <div className="muted">Điểm trung bình</div>
            <div className="gain">+{gained} XP</div>
          </div>
        </div>
        <p className="muted">
          {perfect}/{scores.length} câu chính xác hoàn toàn.
        </p>

        {outcome?.kind === 'opened' && (
          <div className="stack" role="status">
            <p className="gain">
              Bạn vừa mở mảnh thứ {outcome.count}/{outcome.series.grid.cols * outcome.series.grid.rows}
            </p>
            <Picture series={outcome.series} revealed={outcome.revealed} fresh={outcome.fresh} />
            {outcome.complete && (
              <p className="muted">Bạn đã mở hết bức tranh! Về trang chính để làm bài thưởng.</p>
            )}
          </div>
        )}
        {outcome?.kind === 'full' && (
          <p className="muted">Bạn đã mở hết bức tranh rồi. Về trang chính để làm bài thưởng.</p>
        )}
        {outcome?.kind === 'failed' && (
          <p className="muted" role="status">
            Cần điểm trung bình từ {PASS_SCORE} để mở mảnh tranh.
          </p>
        )}

        <div className="row">
          <button className="btn primary" onClick={onAgain}>
            Luyện lại
          </button>
          <button className="btn" onClick={onHome}>
            Về trang chính
          </button>
        </div>
      </div>
    </div>
  )
}
