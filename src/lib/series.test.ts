import { describe, expect, it } from 'vitest'
import { recordLessonDone, type Progress } from './progress.ts'
import {
  bonusLessonId,
  buildBonusLesson,
  findSeriesForLesson,
  isSeriesComplete,
  revealOutcome,
} from './series.ts'
import type { Series } from './types.ts'

/** Fixture (test data only): 3 tiles in a 3×1 grid. */
const series = (over: Partial<Series> = {}): Series => ({
  id: 'demo',
  title: 'Demo picture',
  level: 'A1',
  image: {
    src: 'series/demo/demo.webp',
    width: 300,
    height: 100,
    alt: 'Demo',
    credit: { text: 'Credit text', url: 'https://example.com/art' },
  },
  grid: { cols: 3, rows: 1 },
  revealOrder: [2, 0, 1],
  lessonIds: ['a', 'b', 'c'],
  intro: ['First sentence.', 'Second sentence.', 'Third sentence.'],
  ...over,
})

const empty = (): Progress => ({ xp: 0, streak: 0, last: '', sentences: 0, lessonsDone: {} })

/** Finish a lesson the way App does and return the outcome for it. */
function finish(p: Progress, s: Series, id: string, avg: number) {
  const { progress, firstPass } = recordLessonDone(p, id, avg)
  return { progress, outcome: revealOutcome(s, progress, id, avg, firstPass) }
}

describe('findSeriesForLesson', () => {
  it('finds the series that lists the lesson', () => {
    const list = [series({ id: 's1', lessonIds: ['a', 'b', 'c'] }), series({ id: 's2', lessonIds: ['x', 'y', 'z'] })]
    expect(findSeriesForLesson(list, 'y')?.id).toBe('s2')
  })

  it('returns undefined for unknown lessons, the bonus and the sample', () => {
    const list = [series()]
    expect(findSeriesForLesson(list, 'zzz')).toBeUndefined()
    expect(findSeriesForLesson(list, bonusLessonId('demo'))).toBeUndefined()
    expect(findSeriesForLesson([], 'a')).toBeUndefined()
  })
})

describe('isSeriesComplete', () => {
  it('is true only when every lesson has been passed', () => {
    const s = series()
    let p = empty()
    expect(isSeriesComplete(s, p)).toBe(false)
    p = recordLessonDone(p, 'a', 90).progress
    p = recordLessonDone(p, 'b', 90).progress
    expect(isSeriesComplete(s, p)).toBe(false)
    p = recordLessonDone(p, 'c', 90).progress
    expect(isSeriesComplete(s, p)).toBe(true)
  })

  it('is false for a series without tiles', () => {
    expect(isSeriesComplete(series({ revealOrder: [], lessonIds: [], grid: { cols: 1, rows: 1 } }), empty())).toBe(false)
  })
})

describe('buildBonusLesson', () => {
  it('builds a TTS lesson from the intro sentences', () => {
    const lesson = buildBonusLesson(series())
    expect(lesson.id).toBe('bonus:demo')
    expect(lesson.kind).toBe('tts')
    expect(lesson.langId).toBe('en')
    expect(lesson.title).toContain('Demo picture')
    expect(lesson.sentences.map((s) => s.text)).toEqual(['First sentence.', 'Second sentence.', 'Third sentence.'])
  })

  it('gives every sentence a unique id', () => {
    const ids = buildBonusLesson(series()).sentences.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses a different id per series', () => {
    expect(buildBonusLesson(series({ id: 'one' })).id).not.toBe(buildBonusLesson(series({ id: 'two' })).id)
  })
})

describe('revealOutcome', () => {
  const s = series()

  it('opens the next tile in revealOrder on a first pass', () => {
    const r1 = finish(empty(), s, 'a', 80)
    expect(r1.outcome).toMatchObject({ kind: 'opened', fresh: 2, count: 1, revealed: [2], complete: false })
    const r2 = finish(r1.progress, s, 'b', 60)
    expect(r2.outcome).toMatchObject({ kind: 'opened', fresh: 0, count: 2, revealed: [2, 0], complete: false })
  })

  it('marks the last tile as complete', () => {
    let p = empty()
    p = finish(p, s, 'a', 90).progress
    p = finish(p, s, 'b', 90).progress
    const last = finish(p, s, 'c', 90)
    expect(last.outcome).toMatchObject({ kind: 'opened', fresh: 1, count: 3, complete: true })
  })

  it('opens nothing when a passed lesson is replayed', () => {
    const first = finish(empty(), s, 'a', 70)
    const replay = finish(first.progress, s, 'a', 100)
    expect(replay.outcome).toEqual({ kind: 'already', series: s })
    expect(replay.progress.lessonsDone.a.best).toBe(100)
  })

  it('reports a failure below the pass mark and records nothing', () => {
    const r = finish(empty(), s, 'a', 59)
    expect(r.outcome).toEqual({ kind: 'failed', series: s })
    expect(r.progress.lessonsDone).toEqual({})
  })

  it('treats a low replay of an already passed lesson as "already", not a failure', () => {
    const first = finish(empty(), s, 'a', 90)
    expect(finish(first.progress, s, 'a', 10).outcome).toEqual({ kind: 'already', series: s })
  })

  it('opens a tile at exactly the pass mark', () => {
    expect(finish(empty(), s, 'a', 60).outcome.kind).toBe('opened')
  })

  it('still works when only some lessons of the series exist (others never passed)', () => {
    const only = finish(empty(), s, 'a', 100)
    expect(only.outcome).toMatchObject({ kind: 'opened', count: 1, complete: false })
    expect(isSeriesComplete(s, only.progress)).toBe(false)
  })
})
