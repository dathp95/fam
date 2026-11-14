import { useEffect, useState } from 'react'
import {
  DEFAULT_SHORTCUT,
  formatShortcut,
  isModifierKey,
  isValidShortcut,
  shortcutFromEvent,
  type Shortcut,
} from '../lib/shortcut.ts'

interface Props {
  value: Shortcut
  onChange: (s: Shortcut) => void
}

/** Lets the user record a new key combination for "Nghe lại". */
export function ShortcutSetting({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!recording) return
    // Capture phase + stopPropagation so the combo is not also treated as "play".
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        setError('')
        return
      }
      if (isModifierKey(e)) return // wait for the main key
      const s = shortcutFromEvent(e)
      if (!isValidShortcut(s)) {
        setError('Hãy giữ ít nhất một phím Ctrl, Alt hoặc Shift khi bấm.')
        return
      }
      onChange(s)
      setRecording(false)
      setError('')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, onChange])

  return (
    <details className="shortcut">
      <summary>Phím tắt "Nghe lại" (máy tính)</summary>
      <div className="stack">
        <div className="row">
          <span>Hiện tại:</span>
          <kbd>{formatShortcut(value)}</kbd>
          <button className="btn" onClick={() => { setError(''); setRecording((r) => !r) }}>
            {recording ? 'Đang chờ… (Esc để hủy)' : 'Đổi phím tắt'}
          </button>
          <button className="btn" onClick={() => onChange(DEFAULT_SHORTCUT)} disabled={recording}>
            Mặc định
          </button>
        </div>
        {recording && <p className="status" role="status">Bấm tổ hợp phím bạn muốn dùng, ví dụ Ctrl+Shift+R.</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <p className="muted">
          Ctrl+Tab và Alt+Tab do trình duyệt/hệ điều hành giữ nên không dùng được. Shift+Tab sẽ thay thế việc quay
          lại ô trước.
        </p>
      </div>
    </details>
  )
}
