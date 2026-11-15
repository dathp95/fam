import { describe, expect, it } from 'vitest'
import { groupStaticLessons } from './lessonGroups.ts'
import type { Level, StaticLesson } from './types.ts'

/** Minimal fixture (test data only). */
const l = (id: string, level: Level, order?: number, extra: Record<string, unknown> = {}): StaticLesson =>
  ({
    id,
    kind: 'static',
    title: id,
    langId: 'en',
    createdAt: 0,
    audioUrl: `lessons/${id}.mp3`,
    duration: 5,
    sentences: [{ id: `${id}-1`, text: 'Hi.', start: 0, end: 2 }],
    level,
    source: { name: 'n', url: 'https://example.com', license: 'l' },
    ...(order !== undefined && { order }),
    ...extra,
  }) as StaticLesson

const ids = (list: StaticLesson[]) => list.map((x) => x.id)

describe('groupStaticLessons', () => {
  it('returns no groups for no lessons', () => {
    expect(groupStaticLessons([])).toEqual([])
  })

  it('orders levels by LEVELS regardless of catalog order, skipping empty levels', () => {
    const groups = groupStaticLessons([l('b', 'A2', 1), l('a', 'A1', 1)])
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2'])
    expect(groupStaticLessons([l('b', 'A2')]).map((g) => g.level)).toEqual(['A2']) // A1 has no lessons
  })

  it('sorts by order inside a level', () => {
    const [g] = groupStaticLessons([l('a3', 'A1', 3), l('a1', 'A1', 1), l('a2', 'A1', 2)])
    expect(ids(g.lessons)).toEqual(['a1', 'a2', 'a3'])
  })

  it('puts lessons without an order last and keeps catalog order for ties', () => {
    const [g] = groupStaticLessons([l('n1', 'A1'), l('o2', 'A1', 2), l('n2', 'A1'), l('o1', 'A1', 1), l('o1b', 'A1', 1)])
    expect(ids(g.lessons)).toEqual(['o1', 'o1b', 'o2', 'n1', 'n2'])
  })

  it('ignores a legacy topic and seriesId', () => {
    const groups = groupStaticLessons([
      l('a', 'A1', 2, { topic: 'Zebra', seriesId: 'zzz' }),
      l('b', 'A1', 1, { topic: 'Meeting people', seriesId: 'aaa' }),
    ])
    expect(groups).toHaveLength(1)
    expect(ids(groups[0].lessons)).toEqual(['b', 'a'])
  })

  it('does not mutate the input', () => {
    const input = [l('a2', 'A1', 2), l('a1', 'A1', 1)]
    groupStaticLessons(input)
    expect(ids(input)).toEqual(['a2', 'a1'])
  })
})
