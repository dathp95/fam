import { isSeriesComplete, bonusLessonId } from '../lib/series.ts'
import { revealedTiles, type Progress } from '../lib/progress.ts'
import type { Series, StaticLesson } from '../lib/types.ts'
import { Picture } from './Picture.tsx'

interface Props {
  series: Series
  /** Lessons currently in the catalog; some of series.lessonIds may be missing. */
  lessons: StaticLesson[]
  progress: Progress
  onStartBonus: () => void
}

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url)

export function PictureCard({ series, lessons, progress, onStartBonus }: Props) {
  const revealed = revealedTiles(series, progress)
  const total = series.grid.cols * series.grid.rows
  const complete = isSeriesComplete(series, progress)
  const byId = new Map(lessons.map((l) => [l.id, l]))
  const bonusDone = Object.hasOwn(progress.lessonsDone, bonusLessonId(series.id))
  const { credit } = series.image

  return (
    <div className="card stack picture-card">
      <div className="row between">
        <h3>{series.title}</h3>
        <span className="tag">{series.level}</span>
      </div>
      <Picture series={series} revealed={revealed} />
      <p className="muted" role="status">
        Đã mở {revealed.length}/{total} mảnh
      </p>

      {complete && (
        <div className="stack">
          <div>
            <h3 className="group-title">Giới thiệu bức tranh</h3>
            <ul className="intro">
              {series.intro.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <p className="muted">
            Nguồn ảnh: {credit.text}
            {isHttpUrl(credit.url) && (
              <>
                {' '}
                <a href={credit.url} target="_blank" rel="noreferrer noopener">
                  Xem trang của bảo tàng
                </a>
              </>
            )}
          </p>
          <div className="row">
            <button className="btn primary" onClick={onStartBonus}>
              Bài thưởng: đọc về bức tranh
            </button>
            {bonusDone && <span className="tag">Đã hoàn thành</span>}
          </div>
        </div>
      )}

      <details className="series-lessons">
        <summary>Các bài trong chuỗi</summary>
        <ol>
          {series.lessonIds.map((id) => {
            const lesson = byId.get(id)
            const done = Object.hasOwn(progress.lessonsDone, id)
            return (
              <li key={id}>
                {lesson ? lesson.title : <span className="muted">Chưa có bài</span>}
                {done && <span className="tag">Đã qua</span>}
              </li>
            )
          })}
        </ol>
      </details>
    </div>
  )
}
