import { useCallback, useEffect, useState } from 'react'
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
import { isBonusLesson, revealedTiles } from './lib/pictures.ts'
import {
  ensureActivePicture,
  loadProgress,
  recordAnswer,
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

  async function start(lesson: Lesson) {
    setMessage('')
    const source = await loadSource(lesson)
    if (source === undefined) return
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
    let next = recordLessonDone(progress, lesson.id, avg)
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
    // The picture as it is BEFORE this attempt: tiles only open when the lesson ends.
    const active = progress.picture ? catalog?.pictures.find((p) => p.id === progress.picture?.id) : undefined
    return (
      <Practice
        key={view.run}
        lesson={view.lesson}
        source={view.source}
        progress={progress}
        picture={active ?? null}
        revealed={revealedTiles(progress.picture)}
        onAnswered={onAnswered}
        onQuit={goHome}
        onFinish={(scores, gained) =>
          setView({ ...view, name: 'result', scores, gained, outcome: finishLesson(view.lesson, scores) })
        }
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
        />
      )}
      {view.name === 'new' && (
        <NewLesson onCancel={goHome} onAnalyzed={(draft) => setView({ name: 'review', draft })} />
      )}
      {view.name === 'review' && <Review draft={view.draft} onSave={saveDraft} onCancel={goHome} />}
      {view.name === 'result' && (
        <Result
          scores={view.scores}
          gained={view.gained}
          outcome={view.outcome}
          onAgain={() =>
            setView({ name: 'practice', lesson: view.lesson, source: view.source, run: view.run + 1 })
          }
          onHome={goHome}
        />
      )}
    </div>
  )
}
