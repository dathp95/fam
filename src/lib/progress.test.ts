import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  levelOf,
  loadProgress,
  PASS_SCORE,
  recordAnswer,
  recordLessonDone,
  revealedTiles,
  xpIntoLevel,
  type Progress,
} from './progress.ts'

const progress = (over: Partial<Progress> = {}): Progress => ({
  xp: 0,
  streak: 0,
  last: '',
  sentences: 0,
  lessonsDone: {},
  ...over,
})

describe('levelOf / xpIntoLevel', () => {
  it('starts at level 1 and rises every 100 XP', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(99)).toBe(1)
    expect(levelOf(100)).toBe(2)
    expect(levelOf(250)).toBe(3)
  })

  it('returns XP inside the current level', () => {
    expect(xpIntoLevel(0)).toBe(0)
    expect(xpIntoLevel(99)).toBe(99)
    expect(xpIntoLevel(100)).toBe(0)
    expect(xpIntoLevel(250)).toBe(50)
  })
})

describe('recordAnswer', () => {
  // Local-time constructors so the date matches toLocaleDateString in any timezone.
  const day = (d: number) => new Date(2026, 5, d, 12, 0, 0)
  const base = progress({ xp: 20, streak: 3, last: '2026-06-10', sentences: 4 })

  it('starts a streak at 1 for a first answer', () => {
    const p = recordAnswer(progress(), 7, day(10))
    expect(p).toEqual(progress({ xp: 7, streak: 1, last: '2026-06-10', sentences: 1 }))
  })

  it('keeps the streak on the same day', () => {
    const p = recordAnswer(base, 10, day(10))
    expect(p.streak).toBe(3)
    expect(p.xp).toBe(30)
    expect(p.sentences).toBe(5)
  })

  it('adds 1 when the last day was yesterday', () => {
    const p = recordAnswer(base, 10, day(11))
    expect(p.streak).toBe(4)
    expect(p.last).toBe('2026-06-11')
  })

  it('resets to 1 after a skipped day', () => {
    expect(recordAnswer(base, 10, day(12)).streak).toBe(1)
  })

  it('does not mutate the input', () => {
    const copy = structuredClone(base)
    recordAnswer(base, 10, day(11))
    expect(base).toEqual(copy)
  })

  it('keeps completed lessons', () => {
    const done = { a: { best: 80, at: 1, passes: 2 } }
    const p = recordAnswer(progress({ lessonsDone: done }), 5, day(10))
    expect(p.lessonsDone).toEqual(done)
  })
})

describe('loadProgress', () => {
  const stored = (value: unknown) =>
    vi.stubGlobal('localStorage', {
      getItem: () => (typeof value === 'string' ? value : JSON.stringify(value)),
      setItem: () => {},
    })

  afterEach(() => vi.unstubAllGlobals())

  it('reads data saved before lessonsDone existed', () => {
    stored({ xp: 120, streak: 4, last: '2026-06-10', sentences: 30 })
    expect(loadProgress()).toEqual({ xp: 120, streak: 4, last: '2026-06-10', sentences: 30, lessonsDone: {} })
  })

  it('counts entries saved before `passes` existed as one pass', () => {
    stored({ xp: 1, lessonsDone: { old: { best: 75, at: 1700000000000 } } })
    expect(loadProgress().lessonsDone).toEqual({ old: { best: 75, at: 1700000000000, passes: 1 } })
  })

  it('keeps a valid `passes` and repairs an invalid one to 1', () => {
    stored({
      xp: 1,
      lessonsDone: {
        ok: { best: 75, at: 1, passes: 4 },
        zero: { best: 75, at: 1, passes: 0 },
        text: { best: 75, at: 1, passes: 'many' },
        frac: { best: 75, at: 1, passes: 1.5 },
        neg: { best: 75, at: 1, passes: -2 },
      },
    })
    expect(loadProgress().lessonsDone).toEqual({
      ok: { best: 75, at: 1, passes: 4 },
      zero: { best: 75, at: 1, passes: 1 },
      text: { best: 75, at: 1, passes: 1 },
      frac: { best: 75, at: 1, passes: 1 },
      neg: { best: 75, at: 1, passes: 1 },
    })
  })

  it('drops malformed entries', () => {
    stored({
      xp: 1,
      lessonsDone: {
        ok: { best: 75, at: 1700000000000, passes: 2 },
        noAt: { best: 75 },
        badBest: { best: 'high', at: 1 },
        nan: { best: null, at: 1 },
        notObject: 5,
        list: [1, 2],
      },
    })
    expect(loadProgress().lessonsDone).toEqual({ ok: { best: 75, at: 1700000000000, passes: 2 } })
  })

  it('treats a non-object lessonsDone as empty', () => {
    stored({ xp: 1, lessonsDone: 'nope' })
    expect(loadProgress().lessonsDone).toEqual({})
    stored({ xp: 1, lessonsDone: [] })
    expect(loadProgress().lessonsDone).toEqual({})
  })

  it('starts fresh for corrupted or missing data', () => {
    stored('{not json')
    expect(loadProgress()).toEqual(progress())
    stored('null')
    expect(loadProgress()).toEqual(progress())
  })
})

describe('recordLessonDone', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0)
  const later = new Date(2026, 5, 11, 12, 0, 0)

  it('has a pass mark of 60', () => {
    expect(PASS_SCORE).toBe(60)
  })

  it('passes at exactly 60 and records it as a first pass', () => {
    const r = recordLessonDone(progress(), 'l1', 60, now)
    expect(r.firstPass).toBe(true)
    expect(r.progress.lessonsDone.l1).toEqual({ best: 60, at: now.getTime(), passes: 1 })
  })

  it('records nothing at 59', () => {
    const p = progress()
    const r = recordLessonDone(p, 'l1', 59, now)
    expect(r.firstPass).toBe(false)
    expect(r.progress).toBe(p)
    expect(r.progress.lessonsDone).toEqual({})
  })

  it('counts every replay as another pass', () => {
    let p = recordLessonDone(progress(), 'l1', 80, now).progress
    p = recordLessonDone(p, 'l1', 80, now).progress
    p = recordLessonDone(p, 'l1', 65, now).progress
    expect(p.lessonsDone.l1.passes).toBe(3)
  })

  it('reports firstPass only for the first pass', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now)
    expect(first.firstPass).toBe(true)
    expect(recordLessonDone(first.progress, 'l1', 80, now).firstPass).toBe(false)
  })

  it('keeps the higher score (and its time) when a replay scores lower or equal', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now).progress
    const lower = recordLessonDone(first, 'l1', 65, later).progress.lessonsDone.l1
    expect(lower).toEqual({ best: 80, at: now.getTime(), passes: 2 })
    const same = recordLessonDone(first, 'l1', 80, later).progress.lessonsDone.l1
    expect(same).toEqual({ best: 80, at: now.getTime(), passes: 2 })
  })

  it('updates the best score and its time when a replay scores higher', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now).progress
    const higher = recordLessonDone(first, 'l1', 95, later).progress.lessonsDone.l1
    expect(higher).toEqual({ best: 95, at: later.getTime(), passes: 2 })
  })

  it('does not let a failed replay change an earlier pass', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now).progress
    const r = recordLessonDone(first, 'l1', 20, now)
    expect(r.firstPass).toBe(false)
    expect(r.progress).toBe(first)
    expect(r.progress.lessonsDone.l1).toEqual({ best: 80, at: now.getTime(), passes: 1 })
  })

  it('handles ids that collide with Object.prototype names', () => {
    const r = recordLessonDone(progress(), 'constructor', 70, now)
    expect(r.firstPass).toBe(true)
    expect(recordLessonDone(r.progress, 'constructor', 70, now).firstPass).toBe(false)
  })

  it('does not mutate the input', () => {
    const p = progress({ lessonsDone: { a: { best: 70, at: 1, passes: 1 } } })
    const copy = structuredClone(p)
    recordLessonDone(p, 'b', 90, now)
    recordLessonDone(p, 'a', 99, now)
    expect(p).toEqual(copy)
  })
})

describe('revealedTiles', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `l${i + 1}`)
  const series = { lessonIds: ids, revealOrder: [4, 7, 1, 9, 0, 6, 3, 8, 2, 5] }
  const done = (entries: Record<string, number>) =>
    progress({
      lessonsDone: Object.fromEntries(Object.entries(entries).map(([id, passes]) => [id, { best: 80, at: 1, passes }])),
    })

  it('opens nothing when no lesson is passed', () => {
    expect(revealedTiles(series, progress())).toEqual([])
  })

  it('opens the first N tiles of revealOrder for N passes', () => {
    expect(revealedTiles(series, done({ l1: 1, l2: 1, l3: 1 }))).toEqual([4, 7, 1])
  })

  it('opens one more tile for every replay of the same lesson', () => {
    expect(revealedTiles(series, done({ l1: 1 }))).toEqual([4])
    expect(revealedTiles(series, done({ l1: 2 }))).toEqual([4, 7])
    expect(revealedTiles(series, done({ l1: 3 }))).toEqual([4, 7, 1])
  })

  it('adds up passes across the lessons of the series', () => {
    expect(revealedTiles(series, done({ l1: 2, l5: 1, l10: 2 }))).toEqual([4, 7, 1, 9, 0])
  })

  it('reveals the whole picture after 10 passes, even of a single lesson', () => {
    expect(revealedTiles(series, done({ l1: 10 }))).toEqual(series.revealOrder)
  })

  it('never opens more than all tiles', () => {
    expect(revealedTiles(series, done({ l1: 15, l2: 3 }))).toEqual(series.revealOrder)
  })

  it('ignores lessons outside the series (other lessons, bonus)', () => {
    expect(revealedTiles(series, done({ sample: 3, u123: 2, 'bonus:nature': 4 }))).toEqual([])
  })

  it('grows through recordLessonDone: pass 60 opens a tile, 59 does not', () => {
    let p = progress()
    p = recordLessonDone(p, 'l1', 59).progress
    expect(revealedTiles(series, p)).toEqual([])
    p = recordLessonDone(p, 'l1', 60).progress
    expect(revealedTiles(series, p)).toEqual([4])
    p = recordLessonDone(p, 'l1', 100).progress
    expect(revealedTiles(series, p)).toEqual([4, 7])
  })
})
