/** Picture-reveal series: finding a lesson's series, the bonus lesson and the result-screen outcome. */

import { PASS_SCORE, revealedTiles, type Progress } from './progress.ts'
import type { SampleLesson, Series } from './types.ts'

export const BONUS_PREFIX = 'bonus:'

export const bonusLessonId = (seriesId: string) => `${BONUS_PREFIX}${seriesId}`

export function findSeriesForLesson(series: Series[], lessonId: string): Series | undefined {
  return series.find((s) => s.lessonIds.includes(lessonId))
}

/** True once every tile is open. A series with no tiles is never complete. */
export function isSeriesComplete(series: Series, progress: Pick<Progress, 'lessonsDone'>): boolean {
  return series.revealOrder.length > 0 && revealedTiles(series, progress).length === series.revealOrder.length
}

/** Bonus lesson: practice the picture's intro sentences, read aloud by speechSynthesis. */
export function buildBonusLesson(series: Series): SampleLesson {
  return {
    id: bonusLessonId(series.id),
    kind: 'tts',
    title: `Bài thưởng: ${series.title}`,
    langId: 'en',
    createdAt: 0,
    sentences: series.intro.map((text, i) => ({ id: `${bonusLessonId(series.id)}:${i + 1}`, text })),
  }
}

/** What the result screen should say about the picture after finishing a lesson of a series. */
export type RevealOutcome =
  | {
      kind: 'opened'
      series: Series
      /** All open tiles after this lesson. */
      revealed: number[]
      /** The tile this lesson just opened. */
      fresh: number
      /** How many tiles are open now (1-based position of the fresh tile). */
      count: number
      complete: boolean
    }
  | { kind: 'already'; series: Series } // passed before, replaying opens nothing
  | { kind: 'failed'; series: Series } // average below PASS_SCORE

/**
 * `after` is the progress after recording the lesson; `firstPass` comes from recordLessonDone.
 * A low score on a lesson that was passed earlier is reported as 'already' (nothing to unlock).
 */
export function revealOutcome(
  series: Series,
  after: Progress,
  lessonId: string,
  avgScore: number,
  firstPass: boolean,
): RevealOutcome {
  if (avgScore < PASS_SCORE) {
    return Object.hasOwn(after.lessonsDone, lessonId) ? { kind: 'already', series } : { kind: 'failed', series }
  }
  const revealed = revealedTiles(series, after)
  if (!firstPass || revealed.length === 0) return { kind: 'already', series }
  return {
    kind: 'opened',
    series,
    revealed,
    fresh: revealed[revealed.length - 1],
    count: revealed.length,
    complete: revealed.length === series.revealOrder.length,
  }
}
