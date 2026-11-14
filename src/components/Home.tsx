import type { LoadedCatalog } from '../lib/catalog.ts'
import { groupStaticLessons, OTHER_GROUP_KEY } from '../lib/lessonGroups.ts'
import type { LessonDone, Progress } from '../lib/progress.ts'
import { buildBonusLesson } from '../lib/series.ts'
import { LESSON_SOURCES, type LessonSourceId } from '../lib/sources.ts'
import type { Lesson, MediaLesson, SampleLesson, StaticLesson } from '../lib/types.ts'
import { PictureCard } from './PictureCard.tsx'

interface Props {
  progress: Progress
  sample: SampleLesson
  /** Lessons the user created from their own files. */
  userLessons: MediaLesson[]
  /** null while the catalog is still loading. */
  catalog: LoadedCatalog | null
  loading: boolean
  message: string
  onStart: (lesson: Lesson) => void
  onEdit: (lesson: MediaLesson) => void
  onDelete: (lesson: MediaLesson) => void
  onNew: () => void
}

const CATALOG_SECTION_ID = 'catalog-section'

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url)

export function Home({ progress, sample, userLessons, catalog, loading, message, onStart, onEdit, onDelete, onNew }: Props) {
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

  const groups = catalog ? groupStaticLessons(catalog.lessons) : []
  const hasSeries = groups.some((g) => g.key !== OTHER_GROUP_KEY)
  const seriesTitle = (seriesId: string) => catalog?.series.find((s) => s.id === seriesId)?.title ?? seriesId

  return (
    <div className="stack">
      <section className="stack" aria-labelledby="sources-title">
        <h2 id="sources-title">Chọn nguồn bài</h2>
        <div className="sources">
          {LESSON_SOURCES.map((s) => (
            <button
              key={s.id}
              className="card source"
              disabled={!s.available}
              onClick={() => pickSource(s.id)}
            >
              <span className="source-label">
                {s.label}
                {!s.available && <span className="tag">Sắp có</span>}
              </span>
              <span className="muted">{s.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="sample-title">
        <h2 id="sample-title">Bài mẫu</h2>
        <div className="card lesson">
          <div>
            <h3>{sample.title}</h3>
            <span className="muted">{sample.sentences.length} câu </span>
            <span className="tag">Bài mẫu</span>
          </div>
          <button className="btn primary" onClick={() => onStart(sample)}>
            Luyện tập
          </button>
        </div>
      </section>

      <section className="stack" id={CATALOG_SECTION_ID} aria-labelledby="catalog-title">
        <h2 id="catalog-title">Bài có sẵn</h2>
        {catalog === null && <p className="status">Đang tải bài có sẵn…</p>}
        {catalog?.error && <p className="muted">{catalog.error}</p>}
        {catalog && !catalog.error && catalog.lessons.length === 0 && (
          <p className="muted">Chưa có bài có sẵn.</p>
        )}
        {catalog?.series.map((s) => (
          <PictureCard
            key={s.id}
            series={s}
            lessons={catalog.lessons}
            progress={progress}
            onStartBonus={() => onStart(buildBonusLesson(s))}
          />
        ))}
        {groups.map((g) => (
          <div className="stack" key={g.key}>
            {(hasSeries || g.key !== OTHER_GROUP_KEY) && (
              <h3 className="group-title">{g.seriesId === null ? 'Khác' : `Chuỗi: ${seriesTitle(g.seriesId)}`}</h3>
            )}
            {g.lessons.map((l) => (
              <StaticLessonCard
                key={l.id}
                lesson={l}
                done={Object.hasOwn(progress.lessonsDone, l.id) ? progress.lessonsDone[l.id] : undefined}
                onStart={() => onStart(l)}
              />
            ))}
          </div>
        ))}
      </section>

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
        {message && (
          <p className="err" role="alert">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}

function StaticLessonCard({
  lesson: l,
  done,
  onStart,
}: {
  lesson: StaticLesson
  done: LessonDone | undefined
  onStart: () => void
}) {
  return (
    <div className="card lesson">
      <div>
        <h3>{l.title}</h3>
        <div className="meta">
          <span className="tag">{l.level}</span>
          <span className="tag">{l.topic}</span>
          <span className="muted">{l.sentences.length} câu</span>
          {done && <span className="tag">Đã qua · {done.best}</span>}
        </div>
        <div className="muted">
          Nguồn:{' '}
          {isHttpUrl(l.source.url) ? (
            <a href={l.source.url} target="_blank" rel="noreferrer noopener">
              {l.source.name}
            </a>
          ) : (
            l.source.name
          )}{' '}
          · {l.source.license}
        </div>
      </div>
      <button className="btn primary" onClick={onStart}>
        Luyện tập
      </button>
    </div>
  )
}
