import { describe, expect, it } from 'vitest'
import { groupStaticLessons, topicsOf } from './lessonGroups.ts'
import type { Level, StaticLesson } from './types.ts'

/** Minimal fixture (test data only). */
const l = (id: string, level: Level, topic: string, order?: number, extra: Record<string, unknown> = {}): StaticLesson =>
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
    topic,
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
    const groups = groupStaticLessons([l('b', 'A2', 't', 1), l('a', 'A1', 't', 1)])
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2'])
    expect(groupStaticLessons([l('b', 'A2', 't')]).map((g) => g.level)).toEqual(['A2']) // A1 has no lessons
  })

  it('groups topics inside a level by first appearance, merging repeated topics', () => {
    const groups = groupStaticLessons([
      l('x1', 'A1', 'Home', 1),
      l('y1', 'A1', 'Food', 1),
      l('x2', 'A1', 'Home', 2),
      l('z1', 'A2', 'Home', 1),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].topics.map((t) => t.topic)).toEqual(['Home', 'Food'])
    expect(ids(groups[0].topics[0].lessons)).toEqual(['x1', 'x2'])
    expect(groups[1].topics.map((t) => t.topic)).toEqual(['Home'])
    expect(ids(groups[1].topics[0].lessons)).toEqual(['z1'])
  })

  it('sorts by order inside a topic', () => {
    const [g] = groupStaticLessons([l('a3', 'A1', 't', 3), l('a1', 'A1', 't', 1), l('a2', 'A1', 't', 2)])
    expect(ids(g.topics[0].lessons)).toEqual(['a1', 'a2', 'a3'])
  })

  it('puts lessons without an order last and keeps catalog order for ties', () => {
    const [g] = groupStaticLessons([l('n1', 'A1', 't'), l('o2', 'A1', 't', 2), l('n2', 'A1', 't'), l('o1', 'A1', 't', 1), l('o1b', 'A1', 't', 1)])
    expect(ids(g.topics[0].lessons)).toEqual(['o1', 'o1b', 'o2', 'n1', 'n2'])
  })

  it('ignores a legacy seriesId', () => {
    const groups = groupStaticLessons([l('a', 'A1', 't', 2, { seriesId: 'zzz' }), l('b', 'A1', 't', 1, { seriesId: 'aaa' })])
    expect(groups).toHaveLength(1)
    expect(ids(groups[0].topics[0].lessons)).toEqual(['b', 'a'])
  })

  it('does not mutate the input', () => {
    const input = [l('a2', 'A1', 't', 2), l('a1', 'A1', 't', 1)]
    groupStaticLessons(input)
    expect(ids(input)).toEqual(['a2', 'a1'])
  })
})

describe('topicsOf', () => {
  it('lists distinct topics in order of first appearance', () => {
    expect(topicsOf([l('a', 'A1', 'Home'), l('b', 'A2', 'Food'), l('c', 'A1', 'Home')])).toEqual(['Home', 'Food'])
    expect(topicsOf([])).toEqual([])
  })
})
