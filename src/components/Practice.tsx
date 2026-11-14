import { useCallback, useEffect, useRef, useState } from 'react'
import { useSegmentPlayer } from '../hooks/useSegmentPlayer.ts'
import { HINT_PENALTY, maskHint, scoreAnswer, type ScoreResult } from '../lib/diff.ts'
import { getLanguage } from '../lib/languages.ts'
import { loadShortcut, matchesShortcut, saveShortcut, formatShortcut, type Shortcut } from '../lib/shortcut.ts'
import { speak, stopSpeaking } from '../lib/tts.ts'
import { ShortcutSetting } from './ShortcutSetting.tsx'
import type { Lesson } from '../lib/types.ts'

interface Props {
  lesson: Lesson
  /** Audio/video file for media lessons; null for the TTS sample. */
  media: Blob | null
  onAnswered: (xp: number) => void
  onFinish: (scores: number[], gained: number) => void
  onQuit: () => void
}

const feedback = (score: number) =>
  score === 100
    ? 'Chính xác hoàn toàn!'
    : score >= 70
      ? 'Rất tốt, gần đúng rồi.'
      : 'Nghe lại và thử câu tiếp theo nhé.'

export function Practice({ lesson, media, onAnswered, onFinish, onQuit }: Props) {
  const lang = getLanguage(lesson.langId)
  const player = useSegmentPlayer(media)
  const inputRef = useRef<HTMLInputElement>(null)

  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState('')
  const [hints, setHints] = useState(0)
  const [msg, setMsg] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [scores, setScores] = useState<number[]>([])
  const [gained, setGained] = useState(0)
  const [shortcut, setShortcut] = useState<Shortcut>(loadShortcut)

  const n = lesson.sentences.length
  const sentence = lesson.sentences[i]
  const ref = lang.tokenize(sentence.text)
  const checked = result !== null

  function stopAll() {
    player.stop()
    stopSpeaking()
  }

  // Stop any playback when leaving the screen.
  useEffect(() => stopAll, []) // stopAll only uses stable callbacks

  useEffect(() => {
    if (!checked) inputRef.current?.focus()
  }, [i, checked, hints])

  function play(slow: boolean) {
    if (lesson.kind === 'tts') {
      if (!speak(sentence.text, lang.tts, slow)) setMsg('Trình duyệt này không hỗ trợ đọc giọng nói.')
    } else {
      const s = lesson.sentences[i]
      player.play(s.start, s.end, slow ? 0.75 : 1)
    }
  }

  function check() {
    const user = lang.tokenize(answer)
    if (!user.length) {
      setMsg('Hãy gõ những gì bạn nghe được trước.')
      return
    }
    const res = scoreAnswer(ref, user, hints)
    setResult(res)
    setMsg('')
    setScores((s) => [...s, res.score])
    setGained((g) => g + res.xp)
    onAnswered(res.xp)
    play(false) // let the learner hear the correct sentence right after checking
  }

  function next() {
    stopAll()
    if (i + 1 < n) {
      setI(i + 1)
      setResult(null)
      setHints(0)
      setAnswer('')
      setMsg('')
    } else {
      onFinish(scores, gained)
    }
  }

  const changeShortcut = useCallback((s: Shortcut) => {
    setShortcut(s)
    saveShortcut(s)
  }, [])

  // Keyboard shortcut for "Nghe lại" (works before and after checking).
  const playRef = useRef(play)
  useEffect(() => {
    playRef.current = play
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !matchesShortcut(e, shortcut)) return
      e.preventDefault()
      playRef.current(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcut])

  // Auto-play each new sentence after "Câu tiếp theo" (not on the very first one: the
  // browser may block audio before any interaction, and StrictMode re-runs effects).
  const playedIndex = useRef(0)
  useEffect(() => {
    if (playedIndex.current === i) return
    playedIndex.current = i
    playRef.current(false)
  }, [i])

  // Enter moves on once a sentence has been checked.
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })
  useEffect(() => {
    if (!checked) return
    // The Enter that triggered "Kiểm tra" is still bubbling to `document` when React flushes
    // this effect; ignore any key event that started before the listener was armed.
    const armedAt = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.timeStamp < armedAt) return
      if (e.key !== 'Enter' || e.repeat) return
      if (e.target instanceof HTMLButtonElement) return // let the focused button handle it
      e.preventDefault()
      nextRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [checked])

  return (
    <div className="stack">
      <div className="row between">
        <button className="btn link" onClick={() => { stopAll(); onQuit() }}>
          ← Thoát
        </button>
        <span className="muted">
          Câu {i + 1}/{n}
        </span>
      </div>
      <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={i}>
        <i style={{ width: `${(i / n) * 100}%` }} />
      </div>
      <div className="card stack">
        {!result ? (
          <>
            <div className="player">
              <button className="btn primary" onClick={() => play(false)}>
                ▶ Nghe
              </button>
              <button className="btn" onClick={() => play(true)}>
                Nghe chậm
              </button>
              <button className="btn" onClick={() => setHints((h) => h + 1)} disabled={hints >= ref.length}>
                Gợi ý (−{HINT_PENALTY} điểm)
              </button>
            </div>
            <div className="hint" aria-live="polite">
              {hints ? maskHint(ref, hints) : ''}
            </div>
            <div className="field">
              <label htmlFor="ans">Gõ lại câu bạn nghe được</label>
              <input
                id="ans"
                ref={inputRef}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    check()
                  }
                }}
              />
            </div>
            <div className="row">
              <button className="btn" onClick={() => play(false)} title={`Phím tắt: ${formatShortcut(shortcut)}`}>
                Nghe lại
              </button>
              <button className="btn primary" onClick={check}>
                Kiểm tra
              </button>
              <span className="status">{msg}</span>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <div className="score">{result.score}</div>
              <div>
                <div className="gain">+{result.xp} XP</div>
                <div className="muted">{feedback(result.score)}</div>
              </div>
            </div>
            <div className="diff" aria-label="So sánh từng từ">
              {result.ops.map(([kind, word], k) => (
                <span key={k} className={`w ${kind}`}>
                  {word}
                </span>
              ))}
            </div>
            <div className="legend">
              <span>Xanh: đúng</span>
              <span>Đỏ: thiếu</span>
              <span>Gạch ngang: thừa</span>
            </div>
            <p className="muted">Đáp án: {sentence.text}</p>
            <div className="row">
              <button className="btn" onClick={() => play(false)}>
                ▶ Nghe lại
              </button>
              <button className="btn primary" onClick={next} autoFocus>
                {i + 1 < n ? 'Câu tiếp theo' : 'Hoàn thành'}
              </button>
            </div>
          </>
        )}
      </div>
      <ShortcutSetting value={shortcut} onChange={changeShortcut} />
    </div>
  )
}
