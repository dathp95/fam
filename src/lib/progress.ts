/** XP, level, streak and completed lessons, persisted in localStorage. */

import type { Series } from './types.ts'

export interface LessonDone {
  /** Best average score (0-100) among passing attempts. */
  best: number
  /** Timestamp (ms) of the attempt that set `best`. */
  at: number
}

export interface Progress {
  xp: number
  streak: number
  /** Last practice day, YYYY-MM-DD (local time). */
  last: string
  sentences: number
  /** Lessons passed (average ≥ PASS_SCORE), keyed by lesson id. */
  lessonsDone: Record<string, LessonDone>
}

const KEY = 'fam.prog'
export const XP_PER_LEVEL = 100
/** Minimum average score for a lesson to count as passed (opens a picture tile). */
export const PASS_SCORE = 60

const EMPTY: Progress = { xp: 0, streak: 0, last: '', sentences: 0, lessonsDone: {} }

const dayString = (d: Date) => d.toLocaleDateString('en-CA')

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Keep only well-formed entries; data saved before lessonsDone existed gives {}. */
function parseLessonsDone(raw: unknown): Record<string, LessonDone> {
  const out: Record<string, LessonDone> = {}
  if (!isRecord(raw)) return out
  for (const [id, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue
    const { best, at } = v
    if (typeof best === 'number' && Number.isFinite(best) && typeof at === 'number' && Number.isFinite(at)) {
      out[id] = { best, at }
    }
  }
  return out
}

export function loadProgress(): Progress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (isRecord(raw)) {
      const p = raw as Partial<Progress>
      return {
        xp: Number(p.xp) || 0,
        streak: Number(p.streak) || 0,
        last: typeof p.last === 'string' ? p.last : '',
        sentences: Number(p.sentences) || 0,
        lessonsDone: parseLessonsDone(p.lessonsDone),
      }
    }
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return { ...EMPTY, lessonsDone: {} }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage may be full or disabled */
  }
}

export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1
export const xpIntoLevel = (xp: number) => xp % XP_PER_LEVEL

/** Returns the updated progress after answering one sentence. Pure. */
export function recordAnswer(p: Progress, xp: number, now = new Date()): Progress {
  const today = dayString(now)
  let streak = p.streak
  if (p.last !== today) {
    const yesterday = dayString(new Date(now.getTime() - 864e5))
    streak = p.last === yesterday ? p.streak + 1 : 1
  }
  return { ...p, xp: p.xp + xp, streak, last: today, sentences: p.sentences + 1 }
}

/**
 * Record a finished lesson. Below PASS_SCORE nothing is stored. At or above it, the best score is
 * kept; `firstPass` is true only when the lesson had no entry before (so it opens a new tile once).
 * Pure.
 */
export function recordLessonDone(
  p: Progress,
  lessonId: string,
  avgScore: number,
  now = new Date(),
): { progress: Progress; firstPass: boolean } {
  if (avgScore < PASS_SCORE) return { progress: p, firstPass: false }
  const previous = Object.hasOwn(p.lessonsDone, lessonId) ? p.lessonsDone[lessonId] : undefined
  if (previous && avgScore <= previous.best) return { progress: p, firstPass: false }
  return {
    progress: {
      ...p,
      lessonsDone: { ...p.lessonsDone, [lessonId]: { best: avgScore, at: now.getTime() } },
    },
    firstPass: previous === undefined,
  }
}

/**
 * Indexes of the tiles that are open: the first N entries of revealOrder, where N is the number
 * of the series' lessons that have been passed. Replaying a lesson never opens more tiles.
 */
export function revealedTiles(
  series: Pick<Series, 'lessonIds' | 'revealOrder'>,
  progress: Pick<Progress, 'lessonsDone'>,
): number[] {
  const passed = series.lessonIds.filter((id) => Object.hasOwn(progress.lessonsDone, id)).length
  return series.revealOrder.slice(0, passed)
}
