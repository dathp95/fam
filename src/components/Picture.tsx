import { assetUrl } from '../lib/catalog.ts'
import { PICTURE_COLS, PICTURE_ROWS, PICTURE_TILES } from '../lib/pictures.ts'
import type { Picture as PictureData } from '../lib/types.ts'

interface Props {
  picture: PictureData
  /** Indexes of open tiles (see revealedTiles). */
  revealed: number[]
  /** A tile that was just opened: outlined and faded in (unless the user prefers reduced motion). */
  fresh?: number | null
}

/** The picture with a 3×2 grid of cover tiles on top; open tiles are transparent. */
export function Picture({ picture, revealed, fresh = null }: Props) {
  const { image } = picture
  const open = new Set(revealed)
  return (
    <div className="picture" role="img" aria-label={image.alt} style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      <img src={assetUrl(image.src)} alt="" width={image.width} height={image.height} />
      <div
        className="tiles"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `repeat(${PICTURE_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${PICTURE_ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: PICTURE_TILES }, (_, i) => (
          <div key={i} className={`tile${open.has(i) ? ' open' : ''}${i === fresh ? ' fresh' : ''}`} />
        ))}
      </div>
    </div>
  )
}
