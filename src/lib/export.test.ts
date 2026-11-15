import { describe, expect, it } from 'vitest'
import { parseLessonsFile } from './catalog.ts'
import { audioUrlFor, buildStaticLesson, nextOrder, slugFromPath, type PublishInput } from './export.ts'
import { DEFAULT_LESSON_SOURCE } from './sources.ts'
import type { Level, StaticLesson } from './types.ts'

/** Catalog lesson fixture (test data only, not real content). */
const cat = (id: string, level: Level, topic: string, order?: number): StaticLesson => ({
  id,
  kind: 'static',
  title: id,
  langId: 'en',
  createdAt: 0,
  audioUrl: `lessons/voa/${id}.mp3`,
  duration: 5,
  sentences: [{ id: `${id}-1`, text: 'Hi.', start: 0, end: 2 }],
  level,
  topic,
  source: { name: 'n', url: 'https://example.com', license: 'l' },
  ...(order !== undefined && { order }),
})

const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  title: 'Test lesson',
  langId: 'en',
  createdAt: 5,
  duration: 10,
  sentences: [
    { id: 's1', text: '  Hello there. ', start: 0, end: 4 },
    { id: 's2', text: 'How are you?', start: 4, end: 9 },
  ],
  level: 'A1',
  topic: 'Greetings',
  fileName: 'L01 Welcome.mp3',
  existing: [],
  ...over,
})

function errorOf(over: Partial<PublishInput>): string {
  const r = buildStaticLesson(input(over))
  if (r.ok) throw new Error('expected an error')
  return r.error
}

describe('buildStaticLesson', () => {
  it('builds a StaticLesson with derived id, audioUrl, order and the default source', () => {
    const r = buildStaticLesson(input())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({
      id: 'l01-welcome',
      kind: 'static',
      title: 'Test lesson',
      langId: 'en',
      createdAt: 5,
      audioUrl: 'lessons/voa/l01-welcome.mp3',
      duration: 10,
      sentences: [
        { id: 's1', text: 'Hello there.', start: 0, end: 4 },
        { id: 's2', text: 'How are you?', start: 4, end: 9 },
      ],
      level: 'A1',
      topic: 'Greetings',
      source: { name: 'Voice of America', url: 'https://learningenglish.voanews.com/', license: 'public domain' },
      order: 1,
    })
    expect(r.value.source).toEqual(DEFAULT_LESSON_SOURCE)
    expect('seriesId' in r.value).toBe(false)
  })

  it('uses the next order after the highest in the same level and topic', () => {
    const existing = [cat('a', 'A1', 'Greetings', 1), cat('b', 'A1', 'Greetings', 4), cat('c', 'A1', 'Food', 9), cat('d', 'A2', 'Greetings', 7)]
    const r = buildStaticLesson(input({ existing }))
    expect(r.ok && r.value.order).toBe(5)
  })

  it('keeps the order of a catalog lesson with the same id', () => {
    const existing = [cat('l01-welcome', 'A2', 'Other', 3), cat('x', 'A1', 'Greetings', 8)]
    const r = buildStaticLesson(input({ existing }))
    expect(r.ok && r.value.order).toBe(3)
  })

  it('never includes audio data, only a path', () => {
    expect(JSON.stringify(buildStaticLesson(input()))).not.toMatch(/blob|base64/i)
  })

  it('produces output that parseLessonsFile accepts', () => {
    const r = buildStaticLesson(input())
    if (!r.ok) throw new Error(r.error)
    const parsed = parseLessonsFile({ version: 1, lessons: [JSON.parse(JSON.stringify(r.value))] })
    expect(parsed.warnings).toEqual([])
    expect(parsed.lessons).toEqual([r.value])
  })

  it('reports Vietnamese errors for missing or invalid fields', () => {
    expect(errorOf({ title: ' ' })).toContain('tên bài')
    expect(errorOf({ level: '' })).toContain('trình độ')
    expect(errorOf({ level: 'B2' })).toContain('trình độ')
    expect(errorOf({ topic: '  ' })).toContain('chủ đề')
  })

  it('asks the user to rename the file when no id can be derived', () => {
    for (const fileName of ['', '___.mp3', '.mp3']) expect(errorOf({ fileName }), fileName).toContain('đổi tên file')
  })

  it('rejects sentences with bad times or no text', () => {
    expect(errorOf({ sentences: [] })).toContain('chưa hợp lệ')
    expect(errorOf({ sentences: [{ id: 'a', text: 'Hi.', start: 3, end: 2 }] })).toContain('chưa hợp lệ')
    expect(errorOf({ sentences: [{ id: 'a', text: 'Hi.', start: 0, end: 50 }] })).toContain('chưa hợp lệ')
    expect(errorOf({ sentences: [{ id: 'a', text: ' ', start: 0, end: 2 }] })).toContain('chưa hợp lệ')
  })
})

describe('nextOrder', () => {
  it('is 1 when nothing matches', () => {
    expect(nextOrder([], 'x', 'A1', 't')).toBe(1)
    expect(nextOrder([cat('a', 'A2', 't', 5)], 'x', 'A1', 't')).toBe(1)
  })

  it('counts lessons without an order as 0', () => {
    expect(nextOrder([cat('a', 'A1', 't')], 'x', 'A1', 't')).toBe(1)
  })

  it('falls back to the computed order when the same-id lesson has no order', () => {
    expect(nextOrder([cat('x', 'A1', 't'), cat('a', 'A1', 't', 2)], 'x', 'A1', 't')).toBe(3)
  })
})

describe('audioUrlFor', () => {
  it('puts the audio under lessons/voa/', () => {
    expect(audioUrlFor('l01-welcome')).toBe('lessons/voa/l01-welcome.mp3')
  })
})

describe('slugFromPath', () => {
  it('uses the file name without extension, lowercased and dashed', () => {
    expect(slugFromPath('lessons/voa/L05 Where are you?.mp3')).toBe('l05-where-are-you')
    expect(slugFromPath('a.b.c.mp3')).toBe('a-b-c')
    expect(slugFromPath('lessons/')).toBe('')
    expect(slugFromPath('C:\\audio\\My File.WAV')).toBe('my-file')
  })
})
