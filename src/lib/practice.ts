/** Pure helpers of the Practice screen: playback speed and the score bookkeeping of a lesson. */

/** Playback speed shared by "▶", "Nghe lại" and the keyboard shortcut. */
export type Speed = 1 | 0.75

export const toggleSpeed = (s: Speed): Speed => (s === 1 ? 0.75 : 1)
export const speedLabel = (s: Speed): string => (s === 1 ? '1x' : '0.75x')
/** Whether to use the slow playback of the player/TTS. */
export const isSlow = (s: Speed): boolean => s < 1

/** Scores and XP that count for the lesson so far (one score per sentence at most). */
export interface Tally {
  scores: number[]
  gained: number
}

export const EMPTY_TALLY: Tally = { scores: [], gained: 0 }

/**
 * Apply a checked answer. Only the FIRST attempt at a sentence counts (`counted` is true once the
 * sentence already has a score): later attempts ("Làm lại") change neither the scores nor the XP.
 * `xp` is what this attempt earned. Pure.
 */
export function applyCheck(
  tally: Tally,
  counted: boolean,
  result: { score: number; xp: number },
): { tally: Tally; xp: number } {
  if (counted) return { tally, xp: 0 }
  return {
    tally: { scores: [...tally.scores, result.score], gained: tally.gained + result.xp },
    xp: result.xp,
  }
}

/**
 * Skip a sentence: it scores 0 with 0 XP, unless it already has a score (the learner checked it,
 * then chose "Làm lại" and skipped), in which case nothing changes. Pure.
 */
export function applySkip(tally: Tally, counted: boolean): Tally {
  return counted ? tally : { scores: [...tally.scores, 0], gained: tally.gained }
}

/** Average score from which a sentence (or lesson) counts as passed: same mark as PASS_SCORE. */
export const SENTENCE_PASS_SCORE = 60

/** "Đạt" / "Chưa đạt" label shown next to the score of a checked answer. */
export function scoreVerdict(score: number): { label: string; pass: boolean } {
  const pass = score >= SENTENCE_PASS_SCORE
  return { label: pass ? 'Đạt' : 'Chưa đạt', pass }
}
