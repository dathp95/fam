import { describe, expect, it } from 'vitest'
import { currentLesson, HOME_TABS, orderedLessons, stepTab } from './homeTabs.ts'
import type { Level, StaticLesson } from './types.ts'

const l = (id: string, level: Level, order?: number): StaticLesson => ({
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
})

describe('HOME_TABS', () => {
  it('has Đang học, Bài tập and Albums in that order', () => {
    expect(HOME_TABS.map((t) => t.label)).toEqual(['Đang học', 'Bài tập', 'Albums'])
    expect(HOME_TABS.map((t) => t.id)).toEqual(['learning', 'lessons', 'album'])
  })
})

describe('orderedLessons / currentLesson', () => {
  const lessons = [l('b2', 'A2', 1), l('a2', 'A1', 2), l('a1', 'A1', 1)]

  it('orders by level and order', () => {
    expect(orderedLessons(lessons).map((x) => x.id)).toEqual(['a1', 'a2', 'b2'])
  })

  it('is the first lesson that is not done yet', () => {
    expect(currentLesson(lessons, () => false)?.id).toBe('a1')
    expect(currentLesson(lessons, (id) => id === 'a1')?.id).toBe('a2')
    expect(currentLesson(lessons, (id) => id === 'a1' || id === 'a2')?.id).toBe('b2')
  })

  it('skips ahead of a gap: only the first undone lesson counts', () => {
    expect(currentLesson(lessons, (id) => id === 'a2')?.id).toBe('a1')
  })

  it('is the last lesson when everything is done', () => {
    expect(currentLesson(lessons, () => true)?.id).toBe('b2')
  })

  it('is undefined without lessons', () => {
    expect(currentLesson([], () => false)).toBeUndefined()
  })
})

describe('stepTab', () => {
  it('moves right and left and wraps around', () => {
    expect(stepTab('learning', 1)).toBe('lessons')
    expect(stepTab('album', 1)).toBe('learning')
    expect(stepTab('learning', -1)).toBe('album')
    expect(stepTab('lessons', -1)).toBe('learning')
  })
})
