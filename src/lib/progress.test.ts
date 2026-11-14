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
    const p = recordAnswer(progress({ lessonsDone: { a: { best: 80, at: 1 } } }), 5, day(10))
    expect(p.lessonsDone).toEqual({ a: { best: 80, at: 1 } })
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

  it('keeps valid lessonsDone entries and drops malformed ones', () => {
    stored({
      xp: 1,
      lessonsDone: {
        ok: { best: 75, at: 1700000000000 },
        noAt: { best: 75 },
        badBest: { best: 'high', at: 1 },
        nan: { best: null, at: 1 },
        notObject: 5,
        list: [1, 2],
      },
    })
    expect(loadProgress().lessonsDone).toEqual({ ok: { best: 75, at: 1700000000000 } })
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

  it('has a pass mark of 60', () => {
    expect(PASS_SCORE).toBe(60)
  })

  it('passes at exactly 60 and records it as a first pass', () => {
    const r = recordLessonDone(progress(), 'l1', 60, now)
    expect(r.firstPass).toBe(true)
    expect(r.progress.lessonsDone.l1).toEqual({ best: 60, at: now.getTime() })
  })

  it('records nothing at 59', () => {
    const p = progress()
    const r = recordLessonDone(p, 'l1', 59, now)
    expect(r.firstPass).toBe(false)
    expect(r.progress).toBe(p)
    expect(r.progress.lessonsDone).toEqual({})
  })

  it('does not count replays as a first pass and keeps the higher score', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now).progress
    const lower = recordLessonDone(first, 'l1', 65, now)
    expect(lower.firstPass).toBe(false)
    expect(lower.progress.lessonsDone.l1.best).toBe(80)

    const same = recordLessonDone(first, 'l1', 80, now)
    expect(same.firstPass).toBe(false)
    expect(same.progress.lessonsDone.l1.best).toBe(80)

    const higher = recordLessonDone(first, 'l1', 95, new Date(2026, 5, 11))
    expect(higher.firstPass).toBe(false)
    expect(higher.progress.lessonsDone.l1.best).toBe(95)
  })

  it('does not let a failed replay erase an earlier pass', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now).progress
    const r = recordLessonDone(first, 'l1', 20, now)
    expect(r.firstPass).toBe(false)
    expect(r.progress.lessonsDone.l1.best).toBe(80)
  })

  it('handles ids that collide with Object.prototype names', () => {
    const r = recordLessonDone(progress(), 'constructor', 70, now)
    expect(r.firstPass).toBe(true)
    expect(recordLessonDone(r.progress, 'constructor', 70, now).firstPass).toBe(false)
  })

  it('does not mutate the input', () => {
    const p = progress({ lessonsDone: { a: { best: 70, at: 1 } } })
    const copy = structuredClone(p)
    recordLessonDone(p, 'b', 90, now)
    recordLessonDone(p, 'a', 99, now)
    expect(p).toEqual(copy)
  })
})

describe('revealedTiles', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `l${i + 1}`)
  const series = { lessonIds: ids, revealOrder: [4, 7, 1, 9, 0, 6, 3, 8, 2, 5] }
  const done = (...lessons: string[]) =>
    progress({ lessonsDone: Object.fromEntries(lessons.map((id) => [id, { best: 80, at: 1 }])) })

  it('opens nothing when no lesson is passed', () => {
    expect(revealedTiles(series, progress())).toEqual([])
  })

  it('opens the first N tiles of revealOrder for N passed lessons', () => {
    expect(revealedTiles(series, done('l1', 'l2', 'l3'))).toEqual([4, 7, 1])
  })

  it('opens every tile when all lessons are passed', () => {
    expect(revealedTiles(series, done(...ids))).toEqual(series.revealOrder)
  })

  it('counts passed lessons, not their position', () => {
    expect(revealedTiles(series, done('l10', 'l5'))).toEqual([4, 7])
  })

  it('ignores lessons outside the series (other lessons, bonus)', () => {
    expect(revealedTiles(series, done('sample', 'u123', 'bonus:nature'))).toEqual([])
  })

  it('is not affected by replaying a passed lesson', () => {
    const once = recordLessonDone(done('l1'), 'l1', 100).progress
    expect(revealedTiles(series, once)).toEqual([4])
  })

  it('works when most lessons of the series do not exist in the catalog', () => {
    // Only l1 was ever passed; the other nine ids may be missing from the catalog.
    expect(revealedTiles(series, done('l1'))).toEqual([4])
  })
})
