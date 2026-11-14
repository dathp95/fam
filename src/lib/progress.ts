/** XP, level, streak, passed lessons and the picture being uncovered, persisted in localStorage. */

import {
  isPermutation,
  PICTURE_TILES,
  randomIndex,
  revealedTiles,
  shuffle,
  TILES_PER_PASS,
  type Random,
} from './pictures.ts'
import type { Picture, PictureProgress } from './types.ts'

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
  /** The picture being uncovered, or null before the first one is picked. */
  picture: PictureProgress | null
  /** Pictures completed in the current cycle (oldest first). Reset when a new cycle starts. */
  picturesDone: string[]
  /** Every picture ever completed (oldest first), never reset: the album. */
  album: string[]
}

const KEY = 'fam.prog'
export const XP_PER_LEVEL = 100
/** Minimum average score for a lesson to count as passed (opens a picture tile). */
export const PASS_SCORE = 60

const emptyProgress = (): Progress => ({
  xp: 0,
  streak: 0,
  last: '',
  sentences: 0,
  lessonsDone: {},
  picture: null,
  picturesDone: [],
  album: [],
})

const dayString = (d: Date) => d.toLocaleDateString('en-CA')

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Keep only well-formed entries. Extra fields from older versions (e.g. `passes`) are dropped. */
function parseLessonsDone(raw: unknown): Record<string, LessonDone> {
  const out: Record<string, LessonDone> = {}
  if (!isRecord(raw)) return out
  for (const [id, v] of Object.entries(raw)) {
    if (isRecord(v) && finite(v.best) && finite(v.at)) out[id] = { best: v.best, at: v.at }
  }
  return out
}

/** A valid picture state, or null (also for anything saved by older versions). */
function parsePictureProgress(raw: unknown): PictureProgress | null {
  if (!isRecord(raw)) return null
  const { id, opened, order } = raw
  if (typeof id !== 'string' || !id) return null
  if (typeof opened !== 'number' || !Number.isInteger(opened) || opened < 0 || opened > PICTURE_TILES) return null
  if (!isPermutation(order, PICTURE_TILES)) return null
  return { id, opened, order: [...order] }
}

/** Unique, non-empty ids in their original order. */
function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw as unknown[]) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  }
  return out
}

/** Album for data saved before it existed: the pictures done in the cycle, plus a finished current one. */
function legacyAlbum(picturesDone: string[], picture: PictureProgress | null): string[] {
  const ids = [...picturesDone]
  if (picture && picture.opened >= PICTURE_TILES && !ids.includes(picture.id)) ids.push(picture.id)
  return ids
}

export function loadProgress(): Progress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (isRecord(raw)) {
      const picture = parsePictureProgress(raw.picture)
      const picturesDone = parseIds(raw.picturesDone)
      return {
        xp: Number(raw.xp) || 0,
        streak: Number(raw.streak) || 0,
        last: typeof raw.last === 'string' ? raw.last : '',
        sentences: Number(raw.sentences) || 0,
        lessonsDone: parseLessonsDone(raw.lessonsDone),
        picture,
        picturesDone,
        // Saved before the album existed: start it from what is known to be completed.
        album: Array.isArray(raw.album) ? parseIds(raw.album) : legacyAlbum(picturesDone, picture),
      }
    }
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return emptyProgress()
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
 * Remember the best passing score of a lesson (shown as "Đã qua · 90"). Below PASS_SCORE, or not
 * better than the stored score, the same object is returned. Pure.
 */
export function recordLessonDone(p: Progress, lessonId: string, avgScore: number, now = new Date()): Progress {
  if (avgScore < PASS_SCORE) return p
  const previous = Object.hasOwn(p.lessonsDone, lessonId) ? p.lessonsDone[lessonId] : undefined
  if (previous && avgScore <= previous.best) return p
  return { ...p, lessonsDone: { ...p.lessonsDone, [lessonId]: { best: avgScore, at: now.getTime() } } }
}

/**
 * Pick a random picture that is not in `picturesDone`. When every picture is done, a new cycle
 * starts: choose among the others than the one completed last (`picturesDone` becomes just that
 * one), or the same picture again when there is only one. Returns null without pictures. Pure.
 */
export function pickNextPicture(
  pictures: Picture[],
  picturesDone: string[],
  random: Random = Math.random,
): { picture: Picture; picturesDone: string[] } | null {
  if (pictures.length === 0) return null
  let candidates = pictures.filter((p) => !picturesDone.includes(p.id))
  let done = picturesDone
  if (candidates.length === 0) {
    const last = picturesDone.at(-1)
    const others = pictures.filter((p) => p.id !== last)
    if (others.length > 0) {
      candidates = others
      done = last !== undefined && pictures.some((p) => p.id === last) ? [last] : []
    } else {
      candidates = pictures
      done = []
    }
  }
  return { picture: candidates[randomIndex(candidates.length, random)], picturesDone: done }
}

const startPicture = (picture: Picture, random: Random): PictureProgress => ({
  id: picture.id,
  opened: 0,
  order: shuffle(PICTURE_TILES, random),
})

/**
 * Make sure there is a picture to show: keeps the current one (even when complete) if it is still
 * in the catalog, otherwise picks a new covered picture. No pictures: unchanged. Pure.
 */
export function ensureActivePicture(p: Progress, pictures: Picture[], random: Random = Math.random): Progress {
  if (p.picture && pictures.some((x) => x.id === p.picture?.id)) return p
  const next = pickNextPicture(pictures, p.picturesDone, random)
  if (!next) return p
  return { ...p, picture: startPicture(next.picture, random), picturesDone: next.picturesDone }
}

/**
 * Call when a new lesson attempt starts. A completed picture stays on Home until then (description,
 * bonus lesson); from here on the learner works on a NEW, still covered picture, so the Practice
 * screen never shows the finished one. Any other state (no picture, picture still being opened,
 * picture no longer in the catalog) is returned unchanged. Pure.
 */
export function advancePicture(p: Progress, pictures: Picture[], random: Random = Math.random): Progress {
  const current = p.picture
  if (!current || current.opened < PICTURE_TILES || !pictures.some((x) => x.id === current.id)) return p
  const next = pickNextPicture(pictures, p.picturesDone, random)
  if (!next) return p
  return { ...p, picture: startPicture(next.picture, random), picturesDone: next.picturesDone }
}

/** What the result screen should say about the picture after finishing a lesson. */
export type PictureOutcome =
  | {
      kind: 'opened'
      picture: Picture
      /** All open tiles after this pass. */
      revealed: number[]
      /** The tiles this pass just opened (one in real mode, several in test mode). */
      fresh: number[]
      /** How many tiles are open now. */
      count: number
      complete: boolean
      /** A new picture was started by this pass (the previous one was already complete). */
      started: boolean
    }
  | { kind: 'failed' } // average below PASS_SCORE

/**
 * Apply one finished lesson to the picture: every pass (average ≥ PASS_SCORE, replays included)
 * opens the next `tilesPerPass` tiles (never more than the picture has). Opening the 6th tile
 * completes the picture and adds it to `picturesDone` and to the album. A pass after a completed picture starts a
 * new random one first. Nothing happens below PASS_SCORE.
 * Without pictures the outcome is null. Pure.
 */
export function recordPicturePass(
  p: Progress,
  pictures: Picture[],
  avgScore: number,
  random: Random = Math.random,
  tilesPerPass: number = TILES_PER_PASS,
): { progress: Progress; outcome: PictureOutcome | null } {
  if (pictures.length === 0) return { progress: p, outcome: null }
  if (avgScore < PASS_SCORE) return { progress: p, outcome: { kind: 'failed' } }

  let state: PictureProgress | null = null
  if (p.picture && p.picture.opened < PICTURE_TILES && pictures.some((x) => x.id === p.picture?.id)) {
    state = p.picture
  }
  let done = p.picturesDone
  const started = state === null && p.picture !== null
  if (!state) {
    const next = pickNextPicture(pictures, done, random)
    if (!next) return { progress: p, outcome: null }
    state = startPicture(next.picture, random)
    done = next.picturesDone
  }

  const opened = Math.min(PICTURE_TILES, state.opened + Math.max(1, Math.floor(tilesPerPass)))
  const picture: PictureProgress = { ...state, opened }
  let album = p.album
  if (opened === PICTURE_TILES) {
    if (!done.includes(picture.id)) done = [...done, picture.id]
    if (!album.includes(picture.id)) album = [...album, picture.id]
  }
  const shown = pictures.find((x) => x.id === picture.id)
  if (!shown) return { progress: p, outcome: null }
  return {
    progress: { ...p, picture, picturesDone: done, album },
    outcome: {
      kind: 'opened',
      picture: shown,
      revealed: revealedTiles(picture),
      fresh: picture.order.slice(state.opened, opened),
      count: opened,
      complete: opened === PICTURE_TILES,
      started,
    },
  }
}

/** The pictures of the album that are still in the catalog, oldest first. */
export function albumPictures(p: Pick<Progress, 'album'>, pictures: Picture[]): Picture[] {
  return p.album.flatMap((id) => pictures.find((x) => x.id === id) ?? [])
}
