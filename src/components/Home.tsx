import type { Lesson } from '../lib/types.ts'

interface Props {
  lessons: Lesson[]
  loading: boolean
  message: string
  onStart: (lesson: Lesson) => void
  onEdit: (lesson: Lesson) => void
  onDelete: (lesson: Lesson) => void
  onNew: () => void
}

export function Home({ lessons, loading, message, onStart, onEdit, onDelete, onNew }: Props) {
  return (
    <div className="stack">
      <h2>Bài học</h2>
      {lessons.map((l) => (
        <div className="card lesson" key={l.id}>
          <div>
            <h3>{l.title}</h3>
            <span className="muted">{l.sentences.length} câu </span>
            <span className="tag">{l.kind === 'tts' ? 'Bài mẫu' : 'File của bạn'}</span>
          </div>
          <div className="row">
            {l.kind === 'media' && (
              <>
                <button className="btn" onClick={() => onEdit(l)}>
                  Chỉnh sửa
                </button>
                <button className="btn" onClick={() => onDelete(l)}>
                  Xóa
                </button>
              </>
            )}
            <button className="btn primary" onClick={() => onStart(l)}>
              Luyện tập
            </button>
          </div>
        </div>
      ))}
      {loading && <p className="status">Đang tải bài học đã lưu…</p>}
      {message && (
        <p className="err" role="alert">
          {message}
        </p>
      )}
      <div className="card lesson">
        <div>
          <h3>Tạo bài từ file của bạn</h3>
          <span className="muted">Audio hoặc video ngắn, tối đa khoảng 5 phút.</span>
        </div>
        <button className="btn" onClick={onNew}>
          Tải file lên
        </button>
      </div>
    </div>
  )
}
