import { assetUrl } from '../lib/catalog.ts'
import type { Series } from '../lib/types.ts'

interface Props {
  series: Series
  /** Indexes of open tiles (see revealedTiles). */
  revealed: number[]
  /** A tile that was just opened: outlined and faded in (unless the user prefers reduced motion). */
  fresh?: number | null
}

/** The series picture with a grid of cover tiles on top; open tiles are transparent. */
export function Picture({ series, revealed, fresh = null }: Props) {
  const { image, grid } = series
  const open = new Set(revealed)
  const total = grid.cols * grid.rows
  return (
    <div className="picture" role="img" aria-label={image.alt} style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      <img src={assetUrl(image.src)} alt="" width={image.width} height={image.height} />
      <div
        className="tiles"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
        }}
      >
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`tile${open.has(i) ? ' open' : ''}${i === fresh ? ' fresh' : ''}`} />
        ))}
      </div>
    </div>
  )
}
