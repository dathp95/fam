/** Sentence splitting, silence detection and aligning sentences to audio time. */

import { uid } from './id.ts'
import type { TimedSentence } from './types.ts'

const FRAME_SEC = 0.05
const MIN_SILENCE_FRAMES = 6 // 0.3 s
const MIN_GAP = 0.4
const TAIL_PAD = 0.15
const MAX_WORDS = 16
const MIN_CHUNK_WORDS = 6

const wordCount = (s: string) => s.split(' ').length
const round2 = (n: number) => Math.round(n * 100) / 100

/** Split on . ! ? ; long sentences are further split at , ; : into chunks of ≥ 6 words. */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return []
  const raw = (flat.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const s of raw) {
    if (wordCount(s) <= MAX_WORDS) {
      out.push(s)
      continue
    }
    let buf = ''
    for (const piece of s.split(/(?<=[,;:])\s+/)) {
      buf = buf ? buf + ' ' + piece : piece
      if (wordCount(buf) >= MIN_CHUNK_WORDS) {
        out.push(buf)
        buf = ''
      }
    }
    if (buf) {
      if (out.length) out[out.length - 1] += ' ' + buf
      else out.push(buf)
    }
  }
  return out
}

/** Midpoints (seconds) of silent stretches ≥ 0.3 s, using RMS over 50 ms frames. */
export function findSilences(data: Float32Array, sampleRate: number): number[] {
  const frame = Math.floor(sampleRate * FRAME_SEC)
  if (frame <= 0) return []
  const rms: number[] = []
  for (let i = 0; i + frame <= data.length; i += frame) {
    let sum = 0
    for (let k = 0; k < frame; k++) {
      const v = data[i + k]
      sum += v * v
    }
    rms.push(Math.sqrt(sum / frame))
  }
  const mean = rms.reduce((a, b) => a + b, 0) / Math.max(1, rms.length)
  const threshold = Math.max(0.004, mean * 0.25)
  const mids: number[] = []
  let run = 0
  rms.forEach((v, idx) => {
    if (v < threshold) {
      run++
    } else {
      if (run >= MIN_SILENCE_FRAMES) mids.push((idx - run / 2) * FRAME_SEC)
      run = 0
    }
  })
  return mids
}

/**
 * Distribute sentences over the duration proportionally to text length,
 * snapping each boundary to the nearest silence within 2 s.
 */
export function alignSentences(
  texts: string[],
  duration: number,
  silences: number[],
): TimedSentence[] {
  const total = texts.reduce((a, t) => a + t.length, 0) || 1
  let cum = 0
  const bounds = [0]
  texts.forEach((t, k) => {
    cum += t.length
    if (k === texts.length - 1) {
      bounds.push(duration)
      return
    }
    let b = (duration * cum) / total
    let best: number | null = null
    let bestDist = 2
    for (const s of silences) {
      const d = Math.abs(s - b)
      if (d < bestDist) {
        bestDist = d
        best = s
      }
    }
    if (best !== null) b = best
    b = Math.max(b, bounds[bounds.length - 1] + MIN_GAP)
    bounds.push(Math.min(b, duration))
  })
  return texts.map((text, k) => ({
    id: uid('s'),
    text,
    start: round2(bounds[k]),
    end: round2(Math.min(duration, bounds[k + 1] + TAIL_PAD)),
  }))
}

/** Merge two consecutive sentences into one covering both time ranges. */
export function mergeSentences(a: TimedSentence, b: TimedSentence): TimedSentence {
  return {
    id: a.id,
    text: `${a.text.trim()} ${b.text.trim()}`.trim(),
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
  }
}

/**
 * Split a sentence at character offset `pos` (e.g. the caret). The cut snaps to the nearest
 * word boundary; if the caret is at an edge, it splits near the middle. The time range is
 * divided proportionally to text length. Returns null if the text cannot be split.
 */
export function splitSentenceAt(
  s: TimedSentence,
  pos: number,
): [TimedSentence, TimedSentence] | null {
  const text = s.text
  const isSpace = (i: number) => /\s/.test(text[i])
  const snap = (p: number) => {
    let l = p
    while (l > 0 && !isSpace(l - 1)) l--
    let r = p
    while (r < text.length && !isSpace(r)) r++
    return p - l <= r - p ? l : r
  }
  const valid = (c: number) => text.slice(0, c).trim() !== '' && text.slice(c).trim() !== ''

  let cut = snap(Math.min(Math.max(pos, 0), text.length))
  if (!valid(cut)) {
    // Fall back to the whitespace closest to the middle.
    const mid = text.length / 2
    let best = -1
    for (let i = 1; i < text.length - 1; i++) {
      if (isSpace(i) && valid(i) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
    }
    if (best < 0) return null
    cut = best
  }
  const a = text.slice(0, cut).trim()
  const b = text.slice(cut).trim()
  const ratio = a.length / (a.length + b.length)
  const mid = round2(s.start + (s.end - s.start) * ratio)
  return [
    { id: s.id, text: a, start: s.start, end: mid },
    { id: uid('s'), text: b, start: mid, end: s.end },
  ]
}
