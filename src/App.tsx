import { useCallback, useEffect, useState } from 'react'
import { Album } from './components/Album.tsx'
import { Home } from './components/Home.tsx'
import { NewLesson } from './components/NewLesson.tsx'
import { Practice } from './components/Practice.tsx'
import { Result } from './components/Result.tsx'
import { Review } from './components/Review.tsx'
import { TopBar } from './components/TopBar.tsx'
import { useTheme } from './hooks/useTheme.ts'
import { assetUrl, loadCatalog, type LoadedCatalog } from './lib/catalog.ts'
import { averageScore } from './lib/diff.ts'
import { isSourcePickerVisible } from './lib/features.ts'
import { ALL_TILES, bonusLessonId, bonusPictureId, buildBonusLesson, isBonusLesson, revealedTiles } from './lib/pictures.ts'
import {
  advancePicture,
  albumPictures,
  ensureActivePicture,
  loadProgress,
  recordAnswer,
  recordAttempt,
  recordLessonDone,
  recordPicturePass,
  saveProgress,
  type PictureOutcome,
  type Progress,
} from './lib/progress.ts'
import { deleteLesson, getMedia, listLessons, requestPersistence, saveLesson } from './lib/storage.ts'
import type { Draft, Lesson, MediaLesson, PlaybackSource } from './lib/types.ts'

type View =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'album' }
  | { name: 'review'; draft: Draft }
  | { name: 'practice'; lesson: Lesson; source: PlaybackSource; run: number }
  | {
      name: 'result'
      lesson: Lesson
      source: PlaybackSource
      run: number
      scores: number[]
      gained: number
      outcome: PictureOutcome | null
    }

export default function App() {
  const { theme, toggle } = useTheme()
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [saved, setSaved] = useState<MediaLesson[]>([])
  const [catalog, setCatalog] = useState<LoadedCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [view, setView] = useState<View>({ name: 'home' })

  const refresh = useCallback(async () => {
    try {
      setSaved(await listLessons())
    } catch {
      setMessage('Không đọc được các bài đã lưu (trình duyệt có thể đang chặn lưu trữ).')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    requestPersistence()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    void loadCatalog().then((c) => {
      if (cancelled) return
      for (const w of c.warnings) console.warn(`[catalog] ${w}`)
      setCatalog(c)
      // Make sure there is a covered picture to show on Home.
      setProgress((p) => ensureActivePicture(p, c.pictures))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  // A new screen always starts at the top (iOS may leave the page scrolled after the keyboard closes).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view.name])

  const goHome = () => setView({ name: 'home' })

  /** Resolve where audio comes from: nothing (TTS), a URL (static) or a stored Blob (media). */
  async function loadSource(lesson: Lesson): Promise<PlaybackSource | undefined> {
    switch (lesson.kind) {
      case 'tts':
        return null
      case 'static':
        return assetUrl(lesson.audioUrl)
      case 'media':
        try {
          const blob = await getMedia(lesson.id)
          if (!blob) {
            setMessage('Không tìm thấy file audio của bài này.')
            return undefined
          }
          return blob
        } catch {
          setMessage('Không mở được file audio của bài này.')
          return undefined
        }
    }
  }

  /** A finished picture is replaced by a new, covered one as soon as another lesson starts. */
  function beginAttempt(lesson: Lesson) {
    if (catalog && !isBonusLesson(lesson.id)) setProgress((p) => advancePicture(p, catalog.pictures))
  }

  async function start(lesson: Lesson) {
    setMessage('')
    const source = await loadSource(lesson)
    if (source === undefined) return
    beginAttempt(lesson)
    setView({ name: 'practice', lesson, source, run: 0 })
  }

  async function edit(lesson: MediaLesson) {
    setMessage('')
    const media = await loadSource(lesson)
    if (!(media instanceof Blob)) return
    setView({
      name: 'review',
      draft: {
        id: lesson.id,
        title: lesson.title,
        langId: lesson.langId,
        createdAt: lesson.createdAt,
        media,
        duration: lesson.duration,
        sentences: lesson.sentences,
        timing: 'saved',
      },
    })
  }

  async function remove(lesson: MediaLesson) {
    if (!window.confirm(`Xóa bài "${lesson.title}"?`)) return
    try {
      await deleteLesson(lesson.id)
      await refresh()
    } catch {
      setMessage('Không xóa được bài học.')
    }
  }

  async function saveDraft(lesson: MediaLesson, media: Blob) {
    await saveLesson(lesson, media)
    await refresh()
    goHome()
  }

  function onAnswered(xp: number) {
    setProgress((p) => recordAnswer(p, xp))
  }

  /**
   * Remember the score and, unless this was the bonus lesson, let a pass (average ≥ PASS_SCORE)
   * open the next tile of the current picture.
   */
  function finishLesson(lesson: Lesson, scores: number[]): PictureOutcome | null {
    const avg = averageScore(scores)
    let next = recordLessonDone(recordAttempt(progress, lesson.id, avg), lesson.id, avg)
    let outcome: PictureOutcome | null = null
    if (catalog && !isBonusLesson(lesson.id)) {
      const pass = recordPicturePass(next, catalog.pictures, avg)
      next = pass.progress
      outcome = pass.outcome
    }
    setProgress(next)
    return outcome
  }

  // The practice screen is full-height and has its own header, so it is rendered outside .wrap.
  if (view.name === 'practice') {
    // The picture as it is BEFORE this attempt: tiles only open when the lesson ends. A bonus lesson
    // shows its own (finished) picture, whichever one is being uncovered now.
    const bonusId = bonusPictureId(view.lesson.id)
    const active = bonusId
      ? catalog?.pictures.find((p) => p.id === bonusId)
      : progress.picture
        ? catalog?.pictures.find((p) => p.id === progress.picture?.id)
        : undefined
    return (
      <Practice
        key={view.run}
        lesson={view.lesson}
        source={view.source}
        progress={progress}
        picture={active ?? null}
        revealed={bonusId ? ALL_TILES : revealedTiles(progress.picture)}
        onAnswered={onAnswered}
        onQuit={goHome}
        onFinish={(scores, gained) => {
          // Even if the picture bookkeeping fails, still show the result screen.
          let outcome: PictureOutcome | null = null
          try {
            outcome = finishLesson(view.lesson, scores)
          } catch (e) {
            console.error('Could not record the finished lesson:', e)
          }
          setView({ ...view, name: 'result', scores, gained, outcome })
        }}
      />
    )
  }

  return (
    <div className="wrap">
      <TopBar progress={progress} theme={theme} onToggleTheme={toggle} />
      {view.name === 'home' && (
        <Home
          progress={progress}
          userLessons={saved}
          showSources={isSourcePickerVisible(window.location.search)}
          catalog={catalog}
          loading={loading}
          message={message}
          onStart={start}
          onEdit={edit}
          onDelete={remove}
          onNew={() => setView({ name: 'new' })}
          album={albumPictures(progress, catalog?.pictures ?? [])}
          onOpenAlbum={() => setView({ name: 'album' })}
        />
      )}
      {view.name === 'album' && (
        <Album
          pictures={albumPictures(progress, catalog?.pictures ?? [])}
          total={catalog?.pictures.length ?? 0}
          bonusDone={(id) => Object.hasOwn(progress.lessonsDone, bonusLessonId(id))}
          onStartBonus={(picture) => void start(buildBonusLesson(picture))}
          onBack={goHome}
        />
      )}
      {view.name === 'new' && (
        <NewLesson onCancel={goHome} onAnalyzed={(draft) => setView({ name: 'review', draft })} />
      )}
      {view.name === 'review' && <Review draft={view.draft} onSave={saveDraft} onCancel={goHome} catalogLessons={catalog?.lessons ?? []} />}
      {view.name === 'result' && (
        <Result
          scores={view.scores}
          gained={view.gained}
          outcome={view.outcome}
          onAgain={() => {
            beginAttempt(view.lesson)
            setView({ name: 'practice', lesson: view.lesson, source: view.source, run: view.run + 1 })
          }}
          onHome={goHome}
        />
      )}
    </div>
  )
}
