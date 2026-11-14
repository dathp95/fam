import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useSegmentPlayer } from '../hooks/useSegmentPlayer.ts'
import { useVisualViewport } from '../hooks/useVisualViewport.ts'
import { HINT_PENALTY, maskHint, scoreAnswer, type ScoreResult } from '../lib/diff.ts'
import { getLanguage } from '../lib/languages.ts'
import { PICTURE_TILES } from '../lib/pictures.ts'
import {
  applyCheck,
  applySkip,
  EMPTY_TALLY,
  isSlow,
  scoreVerdict,
  speedLabel,
  toggleSpeed,
  type Speed,
  type Tally,
} from '../lib/practice.ts'
import { formatShortcut, loadShortcut, matchesShortcut, saveShortcut, type Shortcut } from '../lib/shortcut.ts'
import { speak, stopSpeaking } from '../lib/tts.ts'
import type { Lesson, Picture as PictureData, PlaybackSource } from '../lib/types.ts'
import { Picture } from './Picture.tsx'
import { ShortcutSetting } from './ShortcutSetting.tsx'

interface Props {
  lesson: Lesson
  /** Stored file (media lessons), resolved URL (static lessons), or null for the TTS sample. */
  source: PlaybackSource
  /** The picture being uncovered, as it was BEFORE this attempt (tiles open only at the end). */
  picture?: PictureData | null
  /** Indexes of the open tiles of `picture`. */
  revealed?: number[]
  /** Called once per sentence, for the first checked attempt only. */
  onAnswered: (xp: number) => void
  onFinish: (scores: number[], gained: number) => void
  onQuit: () => void
}

/** The attempt that is on screen: its result and the XP it earned (0 for a retry). */
interface Shown {
  res: ScoreResult
  xp: number
}

const NO_TILES: number[] = []

export function Practice({ lesson, source, picture = null, revealed = NO_TILES, onAnswered, onFinish, onQuit }: Props) {
  const lang = getLanguage(lesson.langId)
  const player = useSegmentPlayer(source)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const viewport = useVisualViewport()

  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState('')
  const [hints, setHints] = useState(0)
  const [msg, setMsg] = useState('')
  const [shown, setShown] = useState<Shown | null>(null)
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY)
  /** The current sentence already has a score (its first attempt was checked). */
  const [counted, setCounted] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)
  const [shortcut, setShortcut] = useState<Shortcut>(loadShortcut)
  const [menuOpen, setMenuOpen] = useState(false)

  const n = lesson.sentences.length
  const sentence = lesson.sentences[i]
  const ref = lang.tokenize(sentence.text)
  const checked = shown !== null

  function stopAll() {
    player.stop()
    stopSpeaking()
  }

  // Stop any playback when leaving the screen.
  useEffect(() => stopAll, []) // stopAll only uses stable callbacks

  // Keep the (possibly hidden) textarea focused in both states: the on-screen keyboard then stays open
  // after "Kiểm tra" and the button row never moves.
  useEffect(() => {
    inputRef.current?.focus()
  }, [i, checked, hints])

  // Grow the textarea with its content (it has a max-height in CSS).
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  }, [answer, checked])

  function play(slow: boolean) {
    if (lesson.kind === 'tts') {
      if (!speak(sentence.text, lang.tts, slow)) setMsg('Trình duyệt này không hỗ trợ đọc giọng nói.')
    } else {
      const s = lesson.sentences[i]
      player.play(s.start, s.end, slow ? 0.75 : 1)
    }
  }

  /** Play the current sentence at the chosen speed (▶, "Nghe lại" and the shortcut). */
  const replay = () => {
    play(isSlow(speed))
    inputRef.current?.focus()
  }

  function check() {
    const user = lang.tokenize(answer)
    if (!user.length) {
      setMsg('Hãy gõ những gì bạn nghe được trước.')
      return
    }
    const res = scoreAnswer(ref, user, hints)
    const applied = applyCheck(tally, counted, res)
    setTally(applied.tally)
    if (!counted) {
      setCounted(true)
      onAnswered(applied.xp) // only the first attempt earns XP
    }
    setShown({ res, xp: applied.xp })
    setMsg('')
    play(false) // let the learner hear the correct sentence right after checking
  }

  /** "Làm lại": back to typing for the same sentence; scores and XP stay as they were. */
  function retry() {
    stopAll()
    setShown(null)
    setAnswer('')
    setMsg('')
  }

  function advance(t: Tally) {
    stopAll()
    if (i + 1 < n) {
      setI(i + 1)
      setShown(null)
      setHints(0)
      setAnswer('')
      setMsg('')
      setCounted(false)
    } else {
      onFinish(t.scores, t.gained)
    }
  }

  const next = () => advance(tally)

  /** "Bỏ qua": score 0 and no XP (unless the sentence was already scored), then move on. */
  function skip() {
    const t = applySkip(tally, counted)
    setTally(t)
    advance(t)
  }

  const changeShortcut = useCallback((s: Shortcut) => {
    setShortcut(s)
    saveShortcut(s)
  }, [])

  // Keyboard shortcut for "Nghe lại" (works before and after checking).
  const playRef = useRef(play)
  const replayRef = useRef(replay)
  useEffect(() => {
    playRef.current = play
    replayRef.current = replay
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !matchesShortcut(e, shortcut)) return
      e.preventDefault()
      replayRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcut])

  // Auto-play each new sentence after "Tiếp" (not on the very first one: the
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

  // The "⋯" menu closes with Escape (recording a new shortcut handles Escape itself first).
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const hintLabel = `Gợi ý (trừ ${HINT_PENALTY} điểm)`
  const shortcutHint = `Phím tắt: ${formatShortcut(shortcut)}`
  const style = viewport
    ? ({ '--vvh': `${viewport.height}px`, '--vv-top': `${viewport.top}px` } as CSSProperties)
    : undefined
  const verdict = shown ? scoreVerdict(shown.res.score) : null
  const last = i + 1 >= n

  return (
    <div className={`practice${viewport?.keyboard ? ' practice--kb' : ''}`} style={style}>
      <header className="practice-top">
        <button
          className="icon-btn"
          aria-label="Thoát"
          onClick={() => {
            stopAll()
            onQuit()
          }}
        >
          ✕
        </button>
        <span className="practice-title">{lesson.title}</span>
        <span className="practice-count" aria-label={`Câu ${i + 1} trên ${n}`}>
          {i + 1} / {n}
        </span>
        <button
          ref={menuButtonRef}
          className="icon-btn"
          aria-label="Cài đặt phím tắt"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="practice-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="practice-menu" role="dialog" aria-label="Cài đặt phím tắt">
              <ShortcutSetting value={shortcut} onChange={changeShortcut} />
            </div>
          </>
        )}
      </header>
      <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={i}>
        <i style={{ width: `${(i / n) * 100}%` }} />
      </div>

      <div className="practice-picture">
        {picture && (
          <div
            className="practice-picture-group"
            style={{ '--ar': picture.image.width / picture.image.height } as CSSProperties}
          >
            <Picture picture={picture} revealed={revealed} />
            <p className="muted practice-caption">
              {revealed.length} / {PICTURE_TILES} mảnh
            </p>
          </div>
        )}
      </div>

      {/* Pressing a button must not take focus from the textarea (that would close the keyboard). */}
      <div
        className="practice-bottom"
        onPointerDown={(e) => {
          if (e.target instanceof Element && e.target.closest('button')) e.preventDefault()
        }}
      >
        <div className="practice-controls">
          <button className="btn primary play-btn" onClick={replay} aria-label="Phát câu" title={shortcutHint}>
            ▶
          </button>
          <button
            className="btn speed"
            onClick={() => {
              setSpeed(toggleSpeed)
              inputRef.current?.focus()
            }}
            aria-label={`Tốc độ phát ${speedLabel(speed)}, bấm để đổi`}
          >
            {speedLabel(speed)}
          </button>
          <button
            className="btn hint-btn"
            onClick={() => setHints((h) => h + 1)}
            disabled={checked || hints >= ref.length}
            aria-label={hintLabel}
            title={hintLabel}
          >
            Gợi ý
          </button>
        </div>
        {hints > 0 && !checked && (
          <p className="hint" aria-live="polite">
            {maskHint(ref, hints)}
          </p>
        )}

        {/* The textarea always stays mounted; once checked it is only visually hidden. */}
        <textarea
          ref={inputRef}
          className={checked ? 'is-hidden' : undefined}
          rows={2}
          aria-label="Gõ lại câu bạn nghe được"
          placeholder="Gõ những gì bạn nghe được…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          value={answer}
          onChange={(e) => {
            if (!checked) setAnswer(e.target.value)
          }}
          onKeyDown={(e) => {
            if (checked) return // Enter then moves on (see the document listener above)
            // Enter checks, Shift+Enter inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              check()
            }
          }}
        />
        {shown && verdict && (
          <div
            className="practice-result"
            role="group"
            aria-label={`Kết quả: ${shown.res.score} điểm, cộng ${shown.xp} XP`}
          >
            <div className={`practice-score${verdict.pass ? '' : ' low'}`}>
              <b>{shown.res.score}</b>
              <span>
                {verdict.label} · <strong>+{shown.xp} XP</strong>
              </span>
            </div>
            <div className="diff" aria-label="So sánh từng từ">
              {shown.res.ops.map(([kind, word], k) => (
                <span key={k} className={`w ${kind}`}>
                  {word}
                </span>
              ))}
            </div>
          </div>
        )}
        {msg && (
          <p className="status" role="status">
            {msg}
          </p>
        )}

        {/* One button row for both states: same buttons, same place; only the labels and actions change. */}
        <div className="practice-buttons">
          <button className="btn" onClick={checked ? retry : skip}>
            {checked ? 'Làm lại' : 'Bỏ qua'}
          </button>
          <button className="btn" onClick={replay} title={shortcutHint}>
            Nghe lại
          </button>
          <button className="btn primary" onClick={checked ? next : check}>
            {checked ? (last ? 'Hoàn thành' : 'Tiếp') : 'Kiểm tra'}
          </button>
        </div>
      </div>
    </div>
  )
}
