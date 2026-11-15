import { useEffect, useRef, useState } from 'react'
import { stepIndex, swipeDirection } from '../lib/album.ts'
import { assetUrl } from '../lib/catalog.ts'
import { ALL_TILES, PICTURE_TILES } from '../lib/pictures.ts'
import type { Picture } from '../lib/types.ts'
import { PictureCard } from './PictureCard.tsx'

interface Props {
  /** Completed pictures that are still in the catalog, oldest first. */
  pictures: Picture[]
  /** Number of pictures in the whole collection. */
  total: number
  bonusDone: (pictureId: string) => boolean
  onStartBonus: (picture: Picture) => void
}

/** The pictures the learner has completed: a grid, and a detail view (with ‹ ›) for each one. */
export function Album({ pictures, total, bonusDone, onStartBonus }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const index = pictures.findIndex((p) => p.id === openId)
  const selected = index >= 0 ? pictures[index] : undefined

  function go(delta: number) {
    const next = pictures[stepIndex(index, delta, pictures.length)]
    if (next && next.id !== openId) {
      setOpenId(next.id)
      window.scrollTo(0, 0)
    }
  }

  // ← / → on a keyboard (not while typing in a field).
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (selected) {
    return (
      <div
        className="stack album-detail"
        onTouchStart={(e) => {
          const t = e.touches[0]
          touchStart.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current
          touchStart.current = null
          const t = e.changedTouches[0]
          if (start) go(swipeDirection(t.clientX - start.x, t.clientY - start.y))
        }}
      >
        <div className="row between album-nav">
          <button className="btn link" onClick={() => setOpenId(null)}>
            ← Quay lại
          </button>
          <div className="row album-arrows">
            <button className="btn" onClick={() => go(-1)} disabled={index === 0} aria-label="Tranh trước">
              ‹
            </button>
            <span className="muted" aria-live="polite">
              {index + 1} / {pictures.length}
            </span>
            <button
              className="btn"
              onClick={() => go(1)}
              disabled={index === pictures.length - 1}
              aria-label="Tranh sau"
            >
              ›
            </button>
          </div>
        </div>
        <PictureCard
          picture={selected}
          state={{ id: selected.id, opened: PICTURE_TILES, order: ALL_TILES }}
          bonusDone={bonusDone(selected.id)}
          onStartBonus={() => onStartBonus(selected)}
          inAlbum
        />
      </div>
    )
  }

  return (
    <div className="stack">
      <p className="muted">
        Đã sưu tập {pictures.length}/{total} tranh
      </p>
      {pictures.length === 0 ? (
        <p className="muted">Chưa có tranh nào. Mở hết các mảnh của một bức tranh để thêm vào album.</p>
      ) : (
        <ul className="album-grid">
          {pictures.map((p) => (
            <li key={p.id}>
              <button className="card album-item" onClick={() => setOpenId(p.id)}>
                <img src={assetUrl(p.image.src)} alt={p.image.alt} loading="lazy" />
                <span>{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
