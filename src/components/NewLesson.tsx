import { useState } from 'react'
import { analyzeMedia } from '../lib/media.ts'
import { alignSentences, splitSentences } from '../lib/segment.ts'
import { DEFAULT_LANGUAGE_ID } from '../lib/languages.ts'
import { uid } from '../lib/id.ts'
import type { Draft } from '../lib/types.ts'

interface Props {
  onCancel: () => void
  onAnalyzed: (draft: Draft) => void
}

export function NewLesson({ onCancel, onAnalyzed }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function make() {
    setError('')
    if (!file) return setError('Hãy chọn một file audio hoặc video.')
    const texts = splitSentences(text)
    if (!texts.length) return setError('Hãy dán nội dung (transcript) tiếng Anh của file.')
    setBusy(true)
    try {
      const { duration, silences } = await analyzeMedia(file)
      onAnalyzed({
        id: uid('u'),
        title: file.name.replace(/\.[^.]+$/, ''),
        langId: DEFAULT_LANGUAGE_ID,
        createdAt: Date.now(),
        media: file,
        duration,
        sentences: alignSentences(texts, duration, silences),
        timing: silences.length > 0 ? 'snapped' : 'estimated',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được bài.')
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <button className="btn link" onClick={onCancel}>
        ← Quay lại
      </button>
      <h2>Tạo bài từ file</h2>
      <div className="card stack">
        <div className="field">
          <label htmlFor="file">1. Chọn file audio hoặc video</label>
          <input
            id="file"
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx">2. Dán nội dung tiếng Anh của file</label>
          <textarea
            id="tx"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dán transcript vào đây. Web sẽ tách thành từng câu và ước lượng thời điểm bắt đầu/kết thúc của mỗi câu. Bạn có thể chỉnh lại ở bước tiếp theo."
          />
          <span className="muted">
            Tự động nhận dạng giọng nói (không cần dán chữ) sẽ là bước tiếp theo.
          </span>
        </div>
        <div className="row">
          <button className="btn primary" onClick={make} disabled={busy}>
            {busy ? 'Đang xử lý…' : 'Tách câu'}
          </button>
          <span className="status" role="status">
            {busy ? 'Đang đọc file và tách câu…' : ''}
          </span>
        </div>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
