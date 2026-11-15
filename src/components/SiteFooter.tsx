interface Props {
  onAbout: () => void
  onDonate: () => void
}

/** "Giới thiệu và nguồn" and "Ủng hộ", at the bottom of every page (pushed down on short pages). */
export function SiteFooter({ onAbout, onDonate }: Props) {
  return (
    <nav className="site-footer" aria-label="Thông tin">
      <button className="btn link" onClick={onAbout}>
        Giới thiệu và nguồn
      </button>
      <button className="btn" onClick={onDonate}>
        Ủng hộ
      </button>
    </nav>
  )
}
