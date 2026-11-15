import { useEffect, useState } from 'react'
import { applyUpdate, hasWaitingUpdate, onUpdateAvailable } from '../lib/pwa.ts'

/** Small non-blocking notice when a new version is ready. Reloads only after the learner taps "Tải lại". */
export function UpdateBanner() {
  const [available, setAvailable] = useState(hasWaitingUpdate)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => onUpdateAvailable(() => setAvailable(true)), [])

  if (!available || dismissed) return null
  return (
    <div className="update-banner" role="status">
      <span>Có bản mới</span>
      <button className="btn primary" onClick={applyUpdate}>
        Tải lại
      </button>
      <button className="btn link" onClick={() => setDismissed(true)} aria-label="Để sau">
        ✕
      </button>
    </div>
  )
}
