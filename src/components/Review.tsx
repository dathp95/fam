import { useRef, useState } from 'react'
import { useSegmentPlayer } from '../hooks/useSegmentPlayer.ts'
import { buildStaticLesson, downloadJson } from '../lib/export.ts'
import { getLanguage } from '../lib/languages.ts'
import { mergeSentences, splitSentenceAt } from '../lib/segment.ts'
import { LEVELS, type Draft, type MediaLesson, type TimedSentence } from '../lib/types.ts'

/** Optional publishing info for "Xuất bài (JSON)"; all fields are plain text inputs. */
interface PublishForm {
  id: string
  level: string
  topic: string
  sourceName: string
  sourceUrl: string
  sourceLicense: string
  seriesId: string
  order: string
  audioUrl: string
}

const EMPTY_PUBLISH: PublishForm = {
  id: '',
  level: '',
  topic: '',
  sourceName: '',
  sourceUrl: '',
  sourceLicense: '',
  seriesId: '',
  order: '',
  audioUrl: '',
}

interface Props {
  draft: Draft
  onSave: (lesson: MediaLesson, media: Blob) => Promise<void>
  onCancel: () => void
}

const TIMING_NOTE: Record<Draft['timing'], string> = {
  snapped: 'Thời điểm đã được căn theo các quãng im lặng. Hãy nghe thử và chỉnh lại nếu lệch.',
  estimated:
    'Không phát hiện được quãng im lặng, nên thời điểm chỉ ước lượng theo độ dài chữ. Hãy nghe thử và chỉnh lại.',
  saved: 'Chỉnh chữ và thời điểm của từng câu, rồi lưu lại.',
}

function problem(s: TimedSentence, duration: number, hasWords: boolean): string {
  if (!hasWords) return 'Câu này chưa có chữ.'
  if (s.start < 0 || s.end > duration + 0.01) return `Thời gian phải nằm trong 0–${duration.toFixed(1)} giây.`
  if (s.end <= s.start) return 'Thời điểm kết thúc phải sau thời điểm bắt đầu.'
  return ''
}

export function Review({ draft, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(draft.title)
  const [sentences, setSentences] = useState(draft.sentences)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [publish, setPublish] = useState<PublishForm>(EMPTY_PUBLISH)
  const [exportError, setExportError] = useState('')
  const [exportNote, setExportNote] = useState('')
  const player = useSegmentPlayer(draft.media)
  const lang = getLanguage(draft.langId)

  const update = (i: number, patch: Partial<TimedSentence>) =>
    setSentences((list) => list.map((s, k) => (k === i ? { ...s, ...patch } : s)))

  const problems = sentences.map((s) =>
    problem(s, draft.duration, lang.tokenize(s.text).length > 0),
  )
  const invalid = problems.some(Boolean) || sentences.length === 0

  function merge(i: number) {
    setSentences((list) => [
      ...list.slice(0, i),
      mergeSentences(list[i], list[i + 1]),
      ...list.slice(i + 2),
    ])
  }

  function split(i: number, caret: number) {
    const parts = splitSentenceAt(sentences[i], caret)
    if (!parts) return setError('Câu này quá ngắn để tách.')
    setError('')
    setSentences((list) => [...list.slice(0, i), ...parts, ...list.slice(i + 1)])
  }

  function remove(i: number) {
    setSentences((list) => list.filter((_, k) => k !== i))
  }

  const setField = (key: keyof PublishForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPublish((p) => ({ ...p, [key]: e.target.value }))

  function exportJson() {
    setExportError('')
    setExportNote('')
    const result = buildStaticLesson({
      id: publish.id,
      title,
      langId: draft.langId,
      createdAt: draft.createdAt,
      duration: draft.duration,
      sentences,
      level: publish.level,
      topic: publish.topic,
      source: { name: publish.sourceName, url: publish.sourceUrl, license: publish.sourceLicense },
      seriesId: publish.seriesId,
      order: publish.order,
      audioUrl: publish.audioUrl,
    })
    if (!result.ok) return setExportError(result.error)
    downloadJson(`${result.value.id}.json`, result.value)
    setExportNote(
      `Đã tải ${result.value.id}.json. Đặt file audio vào public/${result.value.audioUrl} rồi dán nội dung vào mảng "lessons" trong public/lessons/index.json.`,
    )
  }

  async function save() {
    setSaving(true)
    setError('')
    player.stop()
    const lesson: MediaLesson = {
      id: draft.id,
      kind: 'media',
      title: title.trim() || 'Bài chưa đặt tên',
      langId: draft.langId,
      createdAt: draft.createdAt,
      duration: draft.duration,
      sentences: sentences.map((s) => ({ ...s, text: s.text.trim() })),
    }
    try {
      await onSave(lesson, draft.media)
    } catch {
      setError('Không lưu được bài học. Trình duyệt có thể đang chặn lưu trữ hoặc đã hết dung lượng.')
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <button className="btn link" onClick={onCancel}>
        ← Hủy
      </button>
      <h2>Xem lại các câu</h2>
      <p className="muted">
        {TIMING_NOTE[draft.timing]} Độ dài file: {draft.duration.toFixed(1)} giây.
      </p>
      <div className="card field">
        <label htmlFor="title">Tên bài</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <ol className="review-list">
        {sentences.map((s, i) => (
          <ReviewRow
            key={s.id}
            index={i}
            sentence={s}
            problem={problems[i]}
            isLast={i === sentences.length - 1}
            canRemove={sentences.length > 1}
            onChange={(patch) => update(i, patch)}
            onPlay={() => player.play(s.start, s.end)}
            onMerge={() => merge(i)}
            onSplit={(caret) => split(i, caret)}
            onRemove={() => remove(i)}
          />
        ))}
      </ol>
      <details className="publish">
        <summary>Thông tin xuất bản (tùy chọn)</summary>
        <div className="form">
          <label>
            Trình độ
            <select value={publish.level} onChange={setField('level')}>
              <option value="">Chọn…</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chủ đề (topic)
            <input type="text" value={publish.topic} onChange={setField('topic')} />
          </label>
          <label>
            Tên nguồn
            <input type="text" value={publish.sourceName} onChange={setField('sourceName')} />
          </label>
          <label>
            Giấy phép
            <input type="text" value={publish.sourceLicense} onChange={setField('sourceLicense')} />
          </label>
          <label className="wide">
            Đường dẫn nguồn (http/https)
            <input type="text" inputMode="url" value={publish.sourceUrl} onChange={setField('sourceUrl')} />
          </label>
          <label className="wide">
            Đường dẫn audio trong public/ (audioUrl)
            <input
              type="text"
              placeholder="lessons/voa/l01.mp3"
              value={publish.audioUrl}
              onChange={setField('audioUrl')}
            />
          </label>
          <label>
            Mã chuỗi (seriesId)
            <input type="text" value={publish.seriesId} onChange={setField('seriesId')} />
          </label>
          <label>
            Thứ tự trong chuỗi (order)
            <input type="number" min="1" step="1" value={publish.order} onChange={setField('order')} />
          </label>
          <label className="wide">
            Mã bài (id), bỏ trống để lấy từ audioUrl
            <input type="text" value={publish.id} onChange={setField('id')} />
          </label>
          <div className="row wide">
            <button className="btn" onClick={exportJson}>
              Xuất bài (JSON)
            </button>
          </div>
          {exportError && (
            <p className="err wide" role="alert">
              {exportError}
            </p>
          )}
          {exportNote && (
            <p className="status wide" role="status">
              {exportNote}
            </p>
          )}
        </div>
      </details>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" onClick={save} disabled={invalid || saving}>
          {saving ? 'Đang lưu…' : `Lưu bài (${sentences.length} câu)`}
        </button>
        <button className="btn" onClick={onCancel} disabled={saving}>
          Hủy
        </button>
        {invalid && !saving && <span className="status">Sửa các lỗi màu đỏ để lưu.</span>}
      </div>
    </div>
  )
}

interface RowProps {
  index: number
  sentence: TimedSentence
  problem: string
  isLast: boolean
  canRemove: boolean
  onChange: (patch: Partial<TimedSentence>) => void
  onPlay: () => void
  onMerge: () => void
  onSplit: (caret: number) => void
  onRemove: () => void
}

function ReviewRow({ index, sentence: s, problem, isLast, canRemove, onChange, onPlay, onMerge, onSplit, onRemove }: RowProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const n = index + 1
  const time = (key: 'start' | 'end') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.valueAsNumber
    if (Number.isFinite(v)) onChange(key === 'start' ? { start: v } : { end: v })
  }
  return (
    <li className="card review-row">
      <div className="row between">
        <b>Câu {n}</b>
        <button className="btn" onClick={onPlay}>
          ▶ Nghe thử
        </button>
      </div>
      <textarea
        ref={ref}
        rows={2}
        aria-label={`Nội dung câu ${n}`}
        value={s.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <div className="times">
        <label>
          Bắt đầu (giây)
          <input type="number" step="0.1" min="0" value={s.start} onChange={time('start')} />
        </label>
        <label>
          Kết thúc (giây)
          <input type="number" step="0.1" min="0" value={s.end} onChange={time('end')} />
        </label>
      </div>
      {problem && (
        <p className="err" role="alert">
          {problem}
        </p>
      )}
      <div className="row">
        <button className="btn" onClick={() => onSplit(ref.current?.selectionStart ?? 0)}>
          Tách tại con trỏ
        </button>
        <button className="btn" onClick={onMerge} disabled={isLast}>
          Gộp với câu sau
        </button>
        <button className="btn" onClick={onRemove} disabled={!canRemove}>
          Xóa câu
        </button>
      </div>
    </li>
  )
}
