import { describe, expect, it } from 'vitest'
import { groupStaticLessons, OTHER_GROUP_KEY } from './lessonGroups.ts'
import type { StaticLesson } from './types.ts'

/** Minimal fixture (test data only). */
const l = (id: string, seriesId?: string, order?: number): StaticLesson => ({
  id,
  kind: 'static',
  title: id,
  langId: 'en',
  createdAt: 0,
  audioUrl: `lessons/${id}.mp3`,
  duration: 5,
  sentences: [{ id: `${id}-1`, text: 'Hi.', start: 0, end: 2 }],
  level: 'A1',
  topic: 't',
  source: { name: 'n', url: 'https://example.com', license: 'l' },
  ...(seriesId !== undefined && { seriesId }),
  ...(order !== undefined && { order }),
})

const ids = (list: StaticLesson[]) => list.map((x) => x.id)

describe('groupStaticLessons', () => {
  it('returns no groups for no lessons', () => {
    expect(groupStaticLessons([])).toEqual([])
  })

  it('groups by seriesId and sorts by order inside each group', () => {
    const groups = groupStaticLessons([l('a3', 'cats', 3), l('b1', 'dogs', 1), l('a1', 'cats', 1), l('a2', 'cats', 2)])
    expect(groups.map((g) => g.key)).toEqual(['cats', 'dogs'])
    expect(ids(groups[0].lessons)).toEqual(['a1', 'a2', 'a3'])
    expect(ids(groups[1].lessons)).toEqual(['b1'])
    expect(groups[0].seriesId).toBe('cats')
  })

  it('puts lessons without a series in a final "other" group', () => {
    const groups = groupStaticLessons([l('x'), l('a1', 'cats', 1), l('y')])
    expect(groups.map((g) => g.key)).toEqual(['cats', OTHER_GROUP_KEY])
    expect(groups[1].seriesId).toBeNull()
    expect(ids(groups[1].lessons)).toEqual(['x', 'y'])
  })

  it('sorts lessons without an order last and keeps catalog order for ties', () => {
    const groups = groupStaticLessons([l('n1', 's'), l('o2', 's', 2), l('n2', 's'), l('o1', 's', 1)])
    expect(ids(groups[0].lessons)).toEqual(['o1', 'o2', 'n1', 'n2'])
  })

  it('orders groups by first appearance', () => {
    const groups = groupStaticLessons([l('b1', 'b', 1), l('a1', 'a', 1), l('b2', 'b', 2)])
    expect(groups.map((g) => g.key)).toEqual(['b', 'a'])
  })

  it('does not mutate the input', () => {
    const input = [l('a2', 's', 2), l('a1', 's', 1)]
    groupStaticLessons(input)
    expect(ids(input)).toEqual(['a2', 'a1'])
  })
})
