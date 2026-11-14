import { isPictureComplete, PICTURE_TILES, revealedTiles, TILES_PER_PASS } from '../lib/pictures.ts'
import { PASS_SCORE } from '../lib/progress.ts'
import type { Picture as PictureData, PictureProgress } from '../lib/types.ts'
import { Picture } from './Picture.tsx'

interface Props {
  picture: PictureData
  state: PictureProgress
  /** The bonus lesson of this picture was passed before. */
  bonusDone: boolean
  onStartBonus: () => void
}

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url)

/** The picture being uncovered; once complete it also shows the description, credit and bonus. */
export function PictureCard({ picture, state, bonusDone, onStartBonus }: Props) {
  const complete = isPictureComplete(state)
  const { credit } = picture.image

  return (
    <div className="card stack picture-card">
      <h3>{complete ? picture.title : 'Bức tranh bí ẩn'}</h3>
      <Picture picture={picture} revealed={revealedTiles(state)} />
      <p className="muted" role="status">
        Đã mở {state.opened}/{PICTURE_TILES} mảnh
      </p>

      {!complete && (
        <p className="muted">
          {TILES_PER_PASS >= PICTURE_TILES
            ? `Hoàn thành một bài với điểm trung bình từ ${PASS_SCORE} trở lên để mở bức tranh.`
            : `Mỗi lần hoàn thành một bài với điểm trung bình từ ${PASS_SCORE} trở lên sẽ mở thêm ${
                TILES_PER_PASS === 1 ? 'một' : TILES_PER_PASS
              } mảnh.`}
        </p>
      )}

      {complete && (
        <div className="stack">
          <div className="stack">
            {picture.description.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
          <p className="muted">
            Nguồn ảnh: {credit.text}
            {isHttpUrl(credit.url) && (
              <>
                {' '}
                <a href={credit.url} target="_blank" rel="noreferrer noopener">
                  Xem trang của bảo tàng
                </a>
              </>
            )}
          </p>
          <div className="row">
            <button className="btn primary" onClick={onStartBonus}>
              Bài thưởng: chép chính tả về bức tranh
            </button>
            {bonusDone && <span className="tag">Đã hoàn thành</span>}
          </div>
          <p className="muted">Hoàn thành thêm một bài nữa để bắt đầu bức tranh mới.</p>
        </div>
      )}
    </div>
  )
}
