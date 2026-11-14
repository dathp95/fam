/** Picture collection: grid constants, random order, bonus lesson and content rules. */

import type { Picture, PictureProgress, SampleLesson } from './types.ts'

/** Fixed grid for every picture: 3 columns × 2 rows. */
export const PICTURE_COLS = 3
export const PICTURE_ROWS = 2
export const PICTURE_TILES = PICTURE_COLS * PICTURE_ROWS

/**
 * How many tiles one passed lesson opens.
 * TEST MODE: 6 (= PICTURE_TILES), so a single lesson opens the whole picture.
 * REAL MODE: set this to 1, so it takes 6 passed lessons to open a picture.
 */
export const TILES_PER_PASS: number = 6

/** Source of randomness in [0, 1); injectable so tests are deterministic. */
export type Random = () => number

/** Random index in 0..length-1 (length must be ≥ 1). */
export function randomIndex(length: number, random: Random): number {
  return Math.min(length - 1, Math.floor(random() * length))
}

/** Random permutation of 0..n-1 (Fisher–Yates). */
export function shuffle(n: number, random: Random): number[] {
  const out = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** True when `order` holds each of 0..n-1 exactly once. */
export function isPermutation(order: unknown, n: number): order is number[] {
  if (!Array.isArray(order) || order.length !== n) return false
  const seen = new Set<number>()
  for (const v of order as unknown[]) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) return false
    seen.add(v)
  }
  return true
}

/** Indexes of the open tiles: the first `opened` entries of `order`. */
export function revealedTiles(state: PictureProgress | null): number[] {
  return state ? state.order.slice(0, state.opened) : []
}

export const isPictureComplete = (state: PictureProgress | null): boolean =>
  state !== null && state.opened >= PICTURE_TILES

export const BONUS_PREFIX = 'bonus:'
export const bonusLessonId = (pictureId: string) => `${BONUS_PREFIX}${pictureId}`
export const isBonusLesson = (lessonId: string) => lessonId.startsWith(BONUS_PREFIX)

/** Bonus lesson: dictation of the picture's English intro sentences, read aloud by speechSynthesis. */
export function buildBonusLesson(picture: Picture): SampleLesson {
  return {
    id: bonusLessonId(picture.id),
    kind: 'tts',
    title: `Bài thưởng: ${picture.title}`,
    langId: 'en',
    createdAt: 0,
    sentences: picture.intro.map((text, i) => ({ id: `${bonusLessonId(picture.id)}:${i + 1}`, text })),
  }
}

export const MIN_SENTENCES = 3
export const MAX_SENTENCES = 5
export const MAX_INTRO_WORDS = 10

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/**
 * Content rules that the catalog parser does not enforce (so one long sentence never hides a whole
 * picture at runtime) but the ingest tool and the tests do: 3–5 sentences each, intro ≤ 10 words.
 * Returns Vietnamese messages; empty when the picture is fine.
 */
export function contentIssues(p: Pick<Picture, 'id' | 'description' | 'intro'>): string[] {
  const issues: string[] = []
  const range = `${MIN_SENTENCES}–${MAX_SENTENCES}`
  if (p.description.length < MIN_SENTENCES || p.description.length > MAX_SENTENCES) {
    issues.push(`${p.id}: description cần ${range} câu (hiện có ${p.description.length}).`)
  }
  if (p.intro.length < MIN_SENTENCES || p.intro.length > MAX_SENTENCES) {
    issues.push(`${p.id}: intro cần ${range} câu (hiện có ${p.intro.length}).`)
  }
  p.intro.forEach((s, i) => {
    const n = wordCount(s)
    if (n > MAX_INTRO_WORDS) issues.push(`${p.id}: câu intro ${i + 1} có ${n} từ (tối đa ${MAX_INTRO_WORDS}).`)
  })
  return issues
}
