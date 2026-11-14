import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPermutation, PICTURE_TILES, revealedTiles, TILES_PER_PASS } from './pictures.ts'
import {
  ensureActivePicture,
  levelOf,
  loadProgress,
  PASS_SCORE,
  pickNextPicture,
  recordAnswer,
  recordLessonDone,
  recordPicturePass,
  xpIntoLevel,
  type Progress,
} from './progress.ts'
import type { Picture } from './types.ts'

/** Real mode: one tile per passed lesson (the shipped default is test mode, see TILES_PER_PASS). */
const realPass = (p: Progress, pictures: Picture[], avg: number, random: () => number) =>
  recordPicturePass(p, pictures, avg, random, 1)

const progress = (over: Partial<Progress> = {}): Progress => ({
  xp: 0,
  streak: 0,
  last: '',
  sentences: 0,
  lessonsDone: {},
  picture: null,
  picturesDone: [],
  ...over,
})

/** Deterministic "random" source that cycles through the given values. */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

/** Fixture pictures (test data only). */
const pic = (id: string): Picture => ({
  id,
  title: `Picture ${id}`,
  image: { src: `pictures/${id}.webp`, width: 1600, height: 1000, alt: 'Ảnh thử', credit: { text: 'Credit', url: 'https://example.com' } },
  description: ['Một.', 'Hai.', 'Ba.'],
  intro: ['One.', 'Two.', 'Three.'],
})
const A = pic('met-1')
const B = pic('met-2')
const C = pic('met-3')

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
    expect(recordAnswer(progress(), 7, day(10))).toEqual(
      progress({ xp: 7, streak: 1, last: '2026-06-10', sentences: 1 }),
    )
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

  it('keeps the picture state and completed lessons', () => {
    const p = progress({
      lessonsDone: { a: { best: 80, at: 1 } },
      picture: { id: 'met-1', opened: 2, order: [0, 1, 2, 3, 4, 5] },
      picturesDone: ['met-9'],
    })
    const next = recordAnswer(p, 5, day(10))
    expect(next.lessonsDone).toEqual(p.lessonsDone)
    expect(next.picture).toEqual(p.picture)
    expect(next.picturesDone).toEqual(['met-9'])
  })
})

describe('loadProgress', () => {
  const stored = (value: unknown) =>
    vi.stubGlobal('localStorage', {
      getItem: () => (typeof value === 'string' ? value : JSON.stringify(value)),
      setItem: () => {},
    })

  afterEach(() => vi.unstubAllGlobals())

  const ORDER = [3, 1, 5, 0, 2, 4]

  it('reads data saved before pictures existed', () => {
    stored({ xp: 120, streak: 4, last: '2026-06-10', sentences: 30 })
    expect(loadProgress()).toEqual(progress({ xp: 120, streak: 4, last: '2026-06-10', sentences: 30 }))
  })

  it('tolerates the series-era format (passes counters, no picture)', () => {
    stored({ xp: 5, lessonsDone: { 'voa-l01-welcome': { best: 90, at: 1700000000000, passes: 11 } } })
    expect(loadProgress().lessonsDone).toEqual({ 'voa-l01-welcome': { best: 90, at: 1700000000000 } })
    expect(loadProgress().picture).toBeNull()
    expect(loadProgress().picturesDone).toEqual([])
  })

  it('keeps a valid picture state', () => {
    stored({ xp: 1, picture: { id: 'met-1', opened: 4, order: ORDER }, picturesDone: ['met-9', 'met-8'] })
    const p = loadProgress()
    expect(p.picture).toEqual({ id: 'met-1', opened: 4, order: ORDER })
    expect(p.picturesDone).toEqual(['met-9', 'met-8'])
  })

  it('accepts a fully opened picture (0 and 6 are valid counts)', () => {
    stored({ picture: { id: 'met-1', opened: 6, order: ORDER } })
    expect(loadProgress().picture?.opened).toBe(6)
    stored({ picture: { id: 'met-1', opened: 0, order: ORDER } })
    expect(loadProgress().picture?.opened).toBe(0)
  })

  it('drops an invalid picture state', () => {
    const bad: unknown[] = [
      { id: 'met-1', opened: 7, order: ORDER },
      { id: 'met-1', opened: -1, order: ORDER },
      { id: 'met-1', opened: 1.5, order: ORDER },
      { id: 'met-1', opened: '3', order: ORDER },
      { id: 'met-1', opened: 3, order: [0, 1, 2, 3, 4] },
      { id: 'met-1', opened: 3, order: [0, 1, 2, 3, 4, 4] },
      { id: 'met-1', opened: 3, order: [0, 1, 2, 3, 4, 6] },
      { id: 'met-1', opened: 3 },
      { id: '', opened: 3, order: ORDER },
      { id: 7, opened: 3, order: ORDER },
      { opened: 3, order: ORDER },
      'met-1',
      [],
      null,
    ]
    for (const picture of bad) {
      stored({ xp: 1, picture })
      expect(loadProgress().picture, JSON.stringify(picture)).toBeNull()
    }
  })

  it('cleans picturesDone: unique, non-empty strings only', () => {
    stored({ picturesDone: ['a', 'b', 'a', '', 5, null, 'c'] })
    expect(loadProgress().picturesDone).toEqual(['a', 'b', 'c'])
    stored({ picturesDone: 'a' })
    expect(loadProgress().picturesDone).toEqual([])
    stored({ picturesDone: { a: 1 } })
    expect(loadProgress().picturesDone).toEqual([])
  })

  it('drops malformed lessonsDone entries', () => {
    stored({
      lessonsDone: {
        ok: { best: 75, at: 1 },
        noAt: { best: 75 },
        badBest: { best: 'high', at: 1 },
        notObject: 5,
        list: [1, 2],
      },
    })
    expect(loadProgress().lessonsDone).toEqual({ ok: { best: 75, at: 1 } })
    stored({ lessonsDone: 'nope' })
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

  it('stores the score at exactly 60 and nothing at 59', () => {
    expect(recordLessonDone(progress(), 'l1', 60, now).lessonsDone.l1).toEqual({ best: 60, at: now.getTime() })
    const p = progress()
    expect(recordLessonDone(p, 'l1', 59, now)).toBe(p)
  })

  it('keeps the higher score and its time', () => {
    const first = recordLessonDone(progress(), 'l1', 80, now)
    expect(recordLessonDone(first, 'l1', 65, later)).toBe(first)
    expect(recordLessonDone(first, 'l1', 80, later)).toBe(first)
    expect(recordLessonDone(first, 'l1', 95, later).lessonsDone.l1).toEqual({ best: 95, at: later.getTime() })
  })

  it('handles ids that collide with Object.prototype names', () => {
    const p = recordLessonDone(progress(), 'constructor', 70, now)
    expect(p.lessonsDone.constructor).toEqual({ best: 70, at: now.getTime() })
  })

  it('does not mutate the input', () => {
    const p = progress({ lessonsDone: { a: { best: 70, at: 1 } } })
    const copy = structuredClone(p)
    recordLessonDone(p, 'b', 90, now)
    recordLessonDone(p, 'a', 99, now)
    expect(p).toEqual(copy)
  })
})

describe('pickNextPicture', () => {
  it('returns null without pictures', () => {
    expect(pickNextPicture([], [], seq(0))).toBeNull()
  })

  it('picks randomly among the pictures not done yet', () => {
    expect(pickNextPicture([A, B, C], ['met-1'], seq(0))?.picture.id).toBe('met-2')
    expect(pickNextPicture([A, B, C], ['met-1'], seq(0.999))?.picture.id).toBe('met-3')
    expect(pickNextPicture([A, B, C], [], seq(0.5))?.picture.id).toBe('met-2')
  })

  it('leaves picturesDone alone while pictures remain', () => {
    expect(pickNextPicture([A, B, C], ['met-1'], seq(0))?.picturesDone).toEqual(['met-1'])
  })

  it('starts a new cycle from the pictures other than the last completed one', () => {
    const r = pickNextPicture([A, B, C], ['met-1', 'met-2', 'met-3'], seq(0))
    expect(r?.picture.id).toBe('met-1') // first of the others (A, B), never the last one (C)
    expect(r?.picturesDone).toEqual(['met-3'])
    expect(pickNextPicture([A, B, C], ['met-1', 'met-2', 'met-3'], seq(0.999))?.picture.id).toBe('met-2')
  })

  it('never repeats the last completed picture right away', () => {
    for (const v of [0, 0.3, 0.6, 0.999]) {
      expect(pickNextPicture([A, B, C], ['met-3', 'met-1', 'met-2'], seq(v))?.picture.id).not.toBe('met-2')
    }
  })

  it('repeats the only picture when there is just one', () => {
    const r = pickNextPicture([A], ['met-1'], seq(0))
    expect(r?.picture.id).toBe('met-1')
    expect(r?.picturesDone).toEqual([])
  })

  it('ignores done ids that are no longer in the catalog', () => {
    expect(pickNextPicture([A, B], ['gone', 'met-1'], seq(0))?.picture.id).toBe('met-2')
    const r = pickNextPicture([A, B], ['met-1', 'met-2', 'gone'], seq(0))
    expect(r?.picturesDone).toEqual([]) // the last done id is not in the catalog
    expect(['met-1', 'met-2']).toContain(r?.picture.id)
  })

  it('does not mutate its inputs', () => {
    const done = ['met-1']
    pickNextPicture([A, B], done, seq(0))
    expect(done).toEqual(['met-1'])
  })
})

describe('ensureActivePicture', () => {
  it('starts a covered picture with a random permutation when there is none', () => {
    const p = ensureActivePicture(progress(), [A, B], seq(0))
    expect(p.picture?.id).toBe('met-1')
    expect(p.picture?.opened).toBe(0)
    expect(isPermutation(p.picture?.order, PICTURE_TILES)).toBe(true)
  })

  it('avoids pictures that are already done', () => {
    const p = ensureActivePicture(progress({ picturesDone: ['met-1'] }), [A, B], seq(0))
    expect(p.picture?.id).toBe('met-2')
  })

  it('keeps the current picture, even a completed one', () => {
    const current = progress({ picture: { id: 'met-2', opened: 3, order: [0, 1, 2, 3, 4, 5] } })
    expect(ensureActivePicture(current, [A, B], seq(0))).toBe(current)
    const complete = progress({ picture: { id: 'met-2', opened: 6, order: [0, 1, 2, 3, 4, 5] }, picturesDone: ['met-2'] })
    expect(ensureActivePicture(complete, [A, B], seq(0))).toBe(complete)
  })

  it('replaces a picture that is no longer in the catalog', () => {
    const p = ensureActivePicture(progress({ picture: { id: 'gone', opened: 2, order: [0, 1, 2, 3, 4, 5] } }), [A, B], seq(0))
    expect(p.picture).toMatchObject({ id: 'met-1', opened: 0 })
  })

  it('does nothing without pictures', () => {
    const p = progress()
    expect(ensureActivePicture(p, [], seq(0))).toBe(p)
  })
})

describe('recordPicturePass', () => {
  it('does nothing without pictures', () => {
    const p = progress()
    expect(realPass(p, [], 100, seq(0))).toEqual({ progress: p, outcome: null })
  })

  it('opens nothing below the pass mark', () => {
    const p = progress({ picture: { id: 'met-1', opened: 2, order: [0, 1, 2, 3, 4, 5] } })
    const r = realPass(p, [A, B], PASS_SCORE - 1, seq(0))
    expect(r.progress).toBe(p)
    expect(r.outcome).toEqual({ kind: 'failed' })
  })

  it('opens a tile at exactly the pass mark', () => {
    const r = realPass(progress(), [A, B], PASS_SCORE, seq(0))
    expect(r.outcome).toMatchObject({ kind: 'opened', count: 1, complete: false, started: false })
  })

  it('starts a picture on the first pass and opens order[0]', () => {
    const r = realPass(progress(), [A, B], 80, seq(0))
    expect(r.progress.picture?.id).toBe('met-1')
    expect(r.progress.picture?.opened).toBe(1)
    expect(r.outcome).toMatchObject({ kind: 'opened', fresh: [r.progress.picture?.order[0]], revealed: [r.progress.picture?.order[0]] })
  })

  it('opens one more tile per pass, following the random order, and completes at 6', () => {
    let p = ensureActivePicture(progress(), [A, B], seq(0))
    const order = p.picture?.order ?? []
    for (let n = 1; n <= PICTURE_TILES; n++) {
      const r = realPass(p, [A, B], 70, seq(0))
      p = r.progress
      expect(r.outcome).toMatchObject({
        kind: 'opened',
        count: n,
        fresh: [order[n - 1]],
        revealed: order.slice(0, n),
        complete: n === PICTURE_TILES,
        started: false,
      })
    }
    expect(p.picture?.opened).toBe(6)
    expect(p.picturesDone).toEqual(['met-1'])
  })

  it('counts replays: every pass opens a tile, whichever lesson it was', () => {
    let p = progress()
    for (let n = 1; n <= 3; n++) p = realPass(p, [A, B], 100, seq(0)).progress
    expect(p.picture?.opened).toBe(3)
  })

  it('starts a new picture on the pass after a completed one', () => {
    let p = progress()
    for (let n = 0; n < PICTURE_TILES; n++) p = realPass(p, [A, B], 100, seq(0)).progress
    expect(p.picture?.id).toBe('met-1')
    const next = realPass(p, [A, B], 100, seq(0))
    expect(next.progress.picture).toMatchObject({ id: 'met-2', opened: 1 })
    expect(next.outcome).toMatchObject({ kind: 'opened', count: 1, started: true })
    expect(next.progress.picturesDone).toEqual(['met-1'])
  })

  it('does not start a new picture on a failed pass after completion', () => {
    let p = progress()
    for (let n = 0; n < PICTURE_TILES; n++) p = realPass(p, [A, B], 100, seq(0)).progress
    const r = realPass(p, [A, B], 10, seq(0))
    expect(r.progress).toBe(p)
    expect(r.progress.picture?.opened).toBe(6)
  })

  it('goes through all pictures before repeating, then avoids the last one', () => {
    const rnd = seq(0)
    let p = progress()
    const completed: string[] = []
    for (let n = 0; n < PICTURE_TILES * 5; n++) {
      p = realPass(p, [A, B, C], 100, rnd).progress
      if (p.picture?.opened === PICTURE_TILES) completed.push(p.picture.id)
    }
    expect(completed).toHaveLength(5)
    expect(new Set(completed.slice(0, 3)).size).toBe(3) // first cycle: all different
    expect(completed[3]).not.toBe(completed[2]) // second cycle starts with a different picture
  })

  it('keeps picturesDone free of duplicates', () => {
    let p = progress()
    for (let n = 0; n < PICTURE_TILES * 4; n++) p = realPass(p, [A, B], 100, seq(0.3, 0.7)).progress
    expect(new Set(p.picturesDone).size).toBe(p.picturesDone.length)
  })

  it('works with a single picture: it restarts the same one', () => {
    let p = progress()
    for (let n = 0; n < PICTURE_TILES; n++) p = realPass(p, [A], 100, seq(0)).progress
    const next = realPass(p, [A], 100, seq(0))
    expect(next.progress.picture).toMatchObject({ id: 'met-1', opened: 1 })
    expect(next.outcome).toMatchObject({ started: true })
  })

  it('starts over when the current picture was removed from the catalog', () => {
    const p = progress({ picture: { id: 'gone', opened: 4, order: [0, 1, 2, 3, 4, 5] } })
    const r = realPass(p, [A, B], 100, seq(0))
    expect(r.progress.picture).toMatchObject({ id: 'met-1', opened: 1 })
    expect(r.outcome).toMatchObject({ started: true })
  })

  it('does not mutate the input progress', () => {
    const p = progress({ picture: { id: 'met-1', opened: 5, order: [0, 1, 2, 3, 4, 5] } })
    const copy = structuredClone(p)
    realPass(p, [A, B], 100, seq(0))
    expect(p).toEqual(copy)
  })

  it('reveals consistent tiles via revealedTiles', () => {
    const r = realPass(progress(), [A], 90, seq(0))
    expect(revealedTiles(r.progress.picture)).toHaveLength(1)
  })
})

describe('recordPicturePass: tiles per pass', () => {
  it('defaults to test mode: one passed lesson opens the whole picture', () => {
    expect(TILES_PER_PASS).toBe(PICTURE_TILES)
    const r = recordPicturePass(progress(), [A, B], 80, seq(0))
    const state = r.progress.picture
    expect(state?.opened).toBe(PICTURE_TILES)
    expect(r.progress.picturesDone).toEqual([state?.id])
    expect(r.outcome).toMatchObject({ kind: 'opened', count: PICTURE_TILES, complete: true, started: false })
    if (r.outcome?.kind === 'opened') {
      expect([...r.outcome.fresh].sort()).toEqual([0, 1, 2, 3, 4, 5]) // all six tiles are new
      expect(r.outcome.fresh).toEqual(state?.order)
      expect(r.outcome.revealed).toEqual(state?.order)
    }
  })

  it('test mode: the next pass starts a new picture, which is opened at once as well', () => {
    const first = recordPicturePass(progress(), [A, B], 80, seq(0))
    const second = recordPicturePass(first.progress, [A, B], 80, seq(0))
    expect(second.progress.picture?.id).not.toBe(first.progress.picture?.id)
    expect(second.outcome).toMatchObject({ kind: 'opened', complete: true, started: true })
    expect(second.progress.picturesDone).toHaveLength(2)
  })

  it('test mode: below the pass mark still opens nothing', () => {
    const p = progress()
    expect(recordPicturePass(p, [A, B], PASS_SCORE - 1, seq(0))).toEqual({ progress: p, outcome: { kind: 'failed' } })
  })

  it('real mode (1 per pass) needs six passes', () => {
    let p = progress()
    for (let n = 1; n <= PICTURE_TILES; n++) {
      const r = recordPicturePass(p, [A, B], 80, seq(0), 1)
      p = r.progress
      expect(p.picture?.opened).toBe(n)
      if (r.outcome?.kind === 'opened') expect(r.outcome.fresh).toHaveLength(1)
    }
    expect(p.picturesDone).toHaveLength(1)
  })

  it('opens exactly N tiles per pass for N = 2 and 4, and never more than the picture has', () => {
    let p = progress()
    const counts: number[] = []
    for (let n = 0; n < 3; n++) {
      p = recordPicturePass(p, [A], 80, seq(0), 4).progress
      counts.push(p.picture?.opened ?? -1)
    }
    expect(counts).toEqual([4, 6, 4]) // 4, capped at 6 (complete), then a new picture with 4

    const two = recordPicturePass(progress(), [A, B], 80, seq(0), 2)
    expect(two.outcome).toMatchObject({ count: 2, complete: false })
    if (two.outcome?.kind === 'opened') expect(two.outcome.fresh).toEqual(two.progress.picture?.order.slice(0, 2))
  })

  it('only reports the tiles of this pass as fresh', () => {
    const a = recordPicturePass(progress(), [A, B], 80, seq(0), 2)
    const b = recordPicturePass(a.progress, [A, B], 80, seq(0), 2)
    const order = b.progress.picture?.order ?? []
    expect(b.outcome).toMatchObject({ kind: 'opened', count: 4, fresh: order.slice(2, 4), revealed: order.slice(0, 4) })
  })

  it('ignores a nonsensical tilesPerPass (0, negative, fractional): at least one tile, whole numbers', () => {
    expect(recordPicturePass(progress(), [A], 80, seq(0), 0).progress.picture?.opened).toBe(1)
    expect(recordPicturePass(progress(), [A], 80, seq(0), -3).progress.picture?.opened).toBe(1)
    expect(recordPicturePass(progress(), [A], 80, seq(0), 2.9).progress.picture?.opened).toBe(2)
  })
})
