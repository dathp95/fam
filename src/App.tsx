import { useCallback, useEffect, useState } from 'react'
import { Home } from './components/Home.tsx'
import { NewLesson } from './components/NewLesson.tsx'
import { Practice } from './components/Practice.tsx'
import { Result } from './components/Result.tsx'
import { Review } from './components/Review.tsx'
import { TopBar } from './components/TopBar.tsx'
import { useTheme } from './hooks/useTheme.ts'
import { loadProgress, recordAnswer, saveProgress, type Progress } from './lib/progress.ts'
import { SAMPLE_LESSON } from './lib/samples.ts'
import { deleteLesson, getMedia, listLessons, requestPersistence, saveLesson } from './lib/storage.ts'
import type { Draft, Lesson, MediaLesson } from './lib/types.ts'

type View =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'review'; draft: Draft }
  | { name: 'practice'; lesson: Lesson; media: Blob | null; run: number }
  | { name: 'result'; lesson: Lesson; media: Blob | null; run: number; scores: number[]; gained: number }

export default function App() {
  const { theme, toggle } = useTheme()
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [saved, setSaved] = useState<MediaLesson[]>([])
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
    saveProgress(progress)
  }, [progress])

  const goHome = () => setView({ name: 'home' })

  async function loadMedia(lesson: Lesson): Promise<Blob | null | undefined> {
    if (lesson.kind === 'tts') return null
    try {
      const blob = await getMedia(lesson.id)
      if (!blob) setMessage('Không tìm thấy file audio của bài này.')
      return blob
    } catch {
      setMessage('Không mở được file audio của bài này.')
      return undefined
    }
  }

  async function start(lesson: Lesson) {
    setMessage('')
    const media = await loadMedia(lesson)
    if (media === undefined) return
    setView({ name: 'practice', lesson, media, run: 0 })
  }

  async function edit(lesson: Lesson) {
    if (lesson.kind !== 'media') return
    setMessage('')
    const media = await loadMedia(lesson)
    if (!media) return
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

  async function remove(lesson: Lesson) {
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

  return (
    <div className="wrap">
      <TopBar progress={progress} theme={theme} onToggleTheme={toggle} />
      {view.name === 'home' && (
        <Home
          lessons={[SAMPLE_LESSON, ...saved]}
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
      {view.name === 'practice' && (
        <Practice
          key={view.run}
          lesson={view.lesson}
          media={view.media}
          onAnswered={onAnswered}
          onQuit={goHome}
          onFinish={(scores, gained) => setView({ ...view, name: 'result', scores, gained })}
        />
      )}
      {view.name === 'result' && (
        <Result
          scores={view.scores}
          gained={view.gained}
          onAgain={() =>
            setView({ name: 'practice', lesson: view.lesson, media: view.media, run: view.run + 1 })
          }
          onHome={goHome}
        />
      )}
    </div>
  )
}
