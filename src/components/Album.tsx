import { useState } from 'react'
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
  onBack: () => void
}

/** The pictures the learner has completed: a grid, and a detail view for each one. */
export function Album({ pictures, total, bonusDone, onStartBonus, onBack }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const selected = pictures.find((p) => p.id === openId)

  if (selected) {
    return (
      <div className="stack">
        <button className="btn link" onClick={() => setOpenId(null)}>
          ← Album
        </button>
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
      <button className="btn link" onClick={onBack}>
        ← Quay lại
      </button>
      <h2>Album</h2>
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
