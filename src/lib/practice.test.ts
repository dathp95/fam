import { describe, expect, it } from 'vitest'
import { averageScore } from './diff.ts'
import { PASS_SCORE } from './progress.ts'
import {
  applyCheck,
  applySkip,
  EMPTY_TALLY,
  isSlow,
  scoreVerdict,
  SENTENCE_PASS_SCORE,
  speedLabel,
  toggleSpeed,
  type Speed,
  type Tally,
} from './practice.ts'

describe('playback speed', () => {
  it('toggles between 1x and 0.75x', () => {
    expect(toggleSpeed(1)).toBe(0.75)
    expect(toggleSpeed(0.75)).toBe(1)
    expect(toggleSpeed(toggleSpeed(1))).toBe(1)
  })

  it('labels the pill', () => {
    expect(speedLabel(1)).toBe('1x')
    expect(speedLabel(0.75)).toBe('0.75x')
  })

  it('is slow only below 1x', () => {
    expect(isSlow(1)).toBe(false)
    expect(isSlow(0.75)).toBe(true)
  })

  it('stays a valid Speed after many toggles', () => {
    let s: Speed = 1
    for (let k = 0; k < 7; k++) s = toggleSpeed(s)
    expect(s).toBe(0.75)
  })
})

describe('applyCheck', () => {
  it('counts the first attempt: score and XP are added', () => {
    const r = applyCheck(EMPTY_TALLY, false, { score: 80, xp: 8 })
    expect(r.tally).toEqual({ scores: [80], gained: 8 })
    expect(r.xp).toBe(8)
  })

  it('does not count a later attempt at the same sentence (no score, no XP)', () => {
    const first = applyCheck(EMPTY_TALLY, false, { score: 40, xp: 4 })
    const retry = applyCheck(first.tally, true, { score: 100, xp: 15 })
    expect(retry.tally).toBe(first.tally)
    expect(retry.tally).toEqual({ scores: [40], gained: 4 })
    expect(retry.xp).toBe(0)
  })

  it('does not count a third attempt either', () => {
    let t: Tally = applyCheck(EMPTY_TALLY, false, { score: 50, xp: 5 }).tally
    for (let k = 0; k < 3; k++) t = applyCheck(t, true, { score: 100, xp: 15 }).tally
    expect(t).toEqual({ scores: [50], gained: 5 })
  })

  it('counts the next sentence again once `counted` is reset', () => {
    const a = applyCheck(EMPTY_TALLY, false, { score: 40, xp: 4 }).tally
    const b = applyCheck(a, false, { score: 90, xp: 9 })
    expect(b.tally).toEqual({ scores: [40, 90], gained: 13 })
  })

  it('does not mutate its input', () => {
    const t: Tally = { scores: [70], gained: 7 }
    applyCheck(t, false, { score: 10, xp: 1 })
    applyCheck(t, true, { score: 10, xp: 1 })
    expect(t).toEqual({ scores: [70], gained: 7 })
  })
})

describe('applySkip', () => {
  it('records a score of 0 and no XP', () => {
    expect(applySkip({ scores: [80], gained: 8 }, false)).toEqual({ scores: [80, 0], gained: 8 })
  })

  it('changes nothing when the sentence already has a score (checked, then redo, then skip)', () => {
    const t: Tally = { scores: [60], gained: 6 }
    expect(applySkip(t, true)).toBe(t)
  })

  it('does not mutate its input', () => {
    const t: Tally = { scores: [], gained: 0 }
    applySkip(t, false)
    expect(t).toEqual({ scores: [], gained: 0 })
  })
})

describe('a whole lesson', () => {
  it('keeps one score per sentence however often an answer is redone', () => {
    // Sentence 1: checked 60, redone twice (100, 100). Sentence 2: skipped. Sentence 3: checked 90.
    let t: Tally = EMPTY_TALLY
    t = applyCheck(t, false, { score: 60, xp: 6 }).tally
    t = applyCheck(t, true, { score: 100, xp: 15 }).tally
    t = applyCheck(t, true, { score: 100, xp: 15 }).tally
    t = applySkip(t, false)
    t = applyCheck(t, false, { score: 90, xp: 9 }).tally
    expect(t).toEqual({ scores: [60, 0, 90], gained: 15 })
    expect(averageScore(t.scores)).toBe(50)
  })

  it('a skipped sentence pulls the average down (a replay pass still needs avg >= 60)', () => {
    let t: Tally = EMPTY_TALLY
    t = applyCheck(t, false, { score: 100, xp: 15 }).tally
    t = applySkip(t, false)
    expect(averageScore(t.scores)).toBe(50)
  })

  it('skipping everything gives 0 XP and an average of 0', () => {
    let t: Tally = EMPTY_TALLY
    for (let k = 0; k < 4; k++) t = applySkip(t, false)
    expect(t).toEqual({ scores: [0, 0, 0, 0], gained: 0 })
    expect(averageScore(t.scores)).toBe(0)
  })

  it('redoing never raises the average', () => {
    const first = applyCheck(EMPTY_TALLY, false, { score: 30, xp: 3 }).tally
    const afterRedo = applyCheck(first, true, { score: 100, xp: 15 }).tally
    expect(averageScore(afterRedo.scores)).toBe(averageScore(first.scores))
  })
})

describe('scoreVerdict', () => {
  it('passes from 60, like the lesson pass mark', () => {
    expect(SENTENCE_PASS_SCORE).toBe(PASS_SCORE)
    expect(scoreVerdict(60)).toEqual({ label: 'Đạt', pass: true })
    expect(scoreVerdict(59)).toEqual({ label: 'Chưa đạt', pass: false })
  })

  it('handles the extremes', () => {
    expect(scoreVerdict(100).pass).toBe(true)
    expect(scoreVerdict(0)).toEqual({ label: 'Chưa đạt', pass: false })
  })
})
