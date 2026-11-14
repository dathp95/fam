interface Props {
  scores: number[]
  gained: number
  onAgain: () => void
  onHome: () => void
}

export function Result({ scores, gained, onAgain, onHome }: Props) {
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const perfect = scores.filter((x) => x === 100).length
  return (
    <div className="stack">
      <div className="card stack">
        <h2>Hoàn thành bài học</h2>
        <div className="row">
          <div className="score">{avg}</div>
          <div>
            <div className="muted">Điểm trung bình</div>
            <div className="gain">+{gained} XP</div>
          </div>
        </div>
        <p className="muted">
          {perfect}/{scores.length} câu chính xác hoàn toàn.
        </p>
        <div className="row">
          <button className="btn primary" onClick={onAgain}>
            Luyện lại
          </button>
          <button className="btn" onClick={onHome}>
            Về trang chính
          </button>
        </div>
      </div>
    </div>
  )
}
