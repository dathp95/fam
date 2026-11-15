import type { LoadedCatalog } from '../lib/catalog.ts'
import { currentLesson, HOME_TABS, stepTab, type HomeTab } from '../lib/homeTabs.ts'
import { groupStaticLessons } from '../lib/lessonGroups.ts'
import { bonusLessonId, buildBonusLesson } from '../lib/pictures.ts'
import { PASS_SCORE, type LessonDone, type Progress } from '../lib/progress.ts'
import { LESSON_SOURCES, type LessonSourceId } from '../lib/sources.ts'
import type { Lesson, MediaLesson, Picture, StaticLesson } from '../lib/types.ts'
import { Album } from './Album.tsx'
import { PictureCard } from './PictureCard.tsx'

interface Props {
  progress: Progress
  /** Lessons the user created from their own files. */
  userLessons: MediaLesson[]
  /** Show "Chọn nguồn bài" and the (possibly empty) "Bài của bạn" section. Off for regular learners. */
  showSources: boolean
  /** null while the catalog is still loading. */
  catalog: LoadedCatalog | null
  loading: boolean
  message: string
  onStart: (lesson: Lesson) => void
  onEdit: (lesson: MediaLesson) => void
  onDelete: (lesson: MediaLesson) => void
  onNew: () => void
  /** Completed pictures (the album), oldest first. */
  album: Picture[]
  tab: HomeTab
  onTab: (tab: HomeTab) => void
}

const CATALOG_SECTION_ID = 'catalog-section'

export function Home({
  progress,
  userLessons,
  showSources,
  catalog,
  loading,
  message,
  onStart,
  onEdit,
  onDelete,
  onNew,
  album,
  tab,
  onTab,
}: Props) {
  function pickSource(id: LessonSourceId) {
    switch (id) {
      case 'catalog':
        document.getElementById(CATALOG_SECTION_ID)?.scrollIntoView({ block: 'start' })
        break
      case 'upload':
        onNew()
        break
      case 'auto':
      case 'link':
        break // not available yet
    }
  }

  // Level -> lessons by `order`; a single level has no heading.
  const levels = catalog ? groupStaticLessons(catalog.lessons) : []
  const isDone = (id: string) => Object.hasOwn(progress.lessonsDone, id)
  const rowFor = (l: StaticLesson) => (
    <StaticLessonCard
      key={l.id}
      lesson={l}
      done={isDone(l.id) ? progress.lessonsDone[l.id] : undefined}
      attempts={Object.hasOwn(progress.history, l.id) ? progress.history[l.id] : undefined}
      onStart={() => onStart(l)}
    />
  )
  // The lesson to continue, and the picture being uncovered (missing while the catalog loads).
  const current = catalog ? currentLesson(catalog.lessons, isDone) : undefined
  const activePicture = progress.picture ? catalog?.pictures.find((p) => p.id === progress.picture?.id) : undefined

  // Lessons the user already saved stay reachable even when the picker is hidden.
  const showMine = showSources || userLessons.length > 0

  return (
    <div className="stack">
      <div
        className="tabs"
        role="tablist"
        aria-label="Màn hình chính"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const next = stepTab(tab, e.key === 'ArrowRight' ? 1 : -1)
          onTab(next)
          document.getElementById(`tab-${next}`)?.focus()
        }}
      >
        {HOME_TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="home-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="stack" id="home-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'learning' && (
          <>
            {catalog === null && <p className="status">Đang tải…</p>}
            {catalog?.error && <p className="muted">{catalog.error}</p>}
            {catalog && !catalog.error && !current && <p className="muted">Chưa có bài có sẵn.</p>}
            {current && rowFor(current)}
            {activePicture && progress.picture && (
              <PictureCard
                picture={activePicture}
                state={progress.picture}
                bonusDone={isDone(bonusLessonId(activePicture.id))}
                onStartBonus={() => onStart(buildBonusLesson(activePicture))}
              />
            )}
          </>
        )}

        {tab === 'lessons' && (
          <>
            {showSources && (
              <section className="stack" aria-labelledby="sources-title">
                <h2 id="sources-title">Chọn nguồn bài</h2>
                <div className="sources">
                  {LESSON_SOURCES.map((s) => (
                    <button key={s.id} className="card source" disabled={!s.available} onClick={() => pickSource(s.id)}>
                      <span className="source-label">
                        {s.label}
                        {!s.available && <span className="tag">Sắp có</span>}
                      </span>
                      <span className="muted">{s.description}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="stack" id={CATALOG_SECTION_ID}>
              {catalog === null && <p className="status">Đang tải bài có sẵn…</p>}
              {catalog?.error && <p className="muted">{catalog.error}</p>}
              {catalog && !catalog.error && levels.length === 0 && <p className="muted">Chưa có bài có sẵn.</p>}
              {levels.map((g) => (
                <div className="stack" key={g.level}>
                  {levels.length > 1 && <h3 className="group-title">{g.level}</h3>}
                  {g.lessons.map(rowFor)}
                </div>
              ))}
            </div>

          {showMine && (
            <section className="stack" aria-labelledby="mine-title">
              <h2 id="mine-title">Bài của bạn</h2>
              {loading && <p className="status">Đang tải bài học đã lưu…</p>}
              {!loading && userLessons.length === 0 && (
                <p className="muted">Chưa có bài nào. Chọn "Tải file của bạn" ở trên để tạo bài.</p>
              )}
              {userLessons.map((l) => (
                <div className="card lesson" key={l.id}>
                  <div>
                    <h3>{l.title}</h3>
                    <span className="muted">{l.sentences.length} câu </span>
                    <span className="tag">File của bạn</span>
                  </div>
                  <div className="row">
                    <button className="btn" onClick={() => onEdit(l)}>
                      Chỉnh sửa
                    </button>
                    <button className="btn" onClick={() => onDelete(l)}>
                      Xóa
                    </button>
                    <button className="btn primary" onClick={() => onStart(l)}>
                      Luyện tập
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          </>
        )}

        {tab === 'album' && (
          <Album
            pictures={album}
            total={catalog?.pictures.length ?? 0}
            bonusDone={(id) => isDone(bonusLessonId(id))}
            onStartBonus={(picture) => onStart(buildBonusLesson(picture))}
          />
        )}
      </div>

      {message && (
        <p className="err" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

function StaticLessonCard({
  lesson: l,
  done,
  attempts,
  onStart,
}: {
  lesson: StaticLesson
  done: LessonDone | undefined
  attempts: number[] | undefined
  onStart: () => void
}) {
  return (
    <div className={`card lesson${done ? ' done' : ''}`}>
      <div>
        <h3>{l.title}</h3>
        <span className="muted">{l.sentences.length} câu</span>
        {attempts && attempts.length > 0 && <AttemptSquares scores={attempts} />}
      </div>
      <div className="row">
        {done ? <span className="tag">Đã qua · {done.best}</span> : <span className="muted" aria-hidden="true">›</span>}
        <button className="btn primary" onClick={onStart}>
          Luyện tập
        </button>
      </div>
    </div>
  )
}

/** Squares shown per lesson row; older attempts are summarised as "+N". */
const MAX_SQUARES = 10

/** Colour class of an attempt: below the pass mark, passed, or excellent. */
const scoreClass = (score: number) => (score < PASS_SCORE ? 'low' : score < 90 ? 'mid' : 'high')

function AttemptSquares({ scores }: { scores: number[] }) {
  const hidden = Math.max(0, scores.length - MAX_SQUARES)
  return (
    <div className="attempts" role="group" aria-label={`${scores.length} lần luyện`}>
      {hidden > 0 && <span className="attempts-more">+{hidden}</span>}
      {scores.slice(hidden).map((score, i) => {
        const label = `Lần ${hidden + i + 1}: ${Math.round(score)} điểm`
        return <span key={hidden + i} className={`attempt ${scoreClass(score)}`} title={label} aria-label={label} role="img" />
      })}
    </div>
  )
}
