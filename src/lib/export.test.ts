import { describe, expect, it } from 'vitest'
import { parseCatalog } from './catalog.ts'
import { buildStaticLesson, slugFromPath, type PublishInput } from './export.ts'

/** Test data only, not real lesson content. */
const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  id: '',
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
  source: { name: 'Test source', url: 'https://example.com/page', license: 'public domain' },
  seriesId: 'demo',
  order: '2',
  audioUrl: 'lessons/test/L01 Welcome.mp3',
  ...over,
})

function errorOf(over: Partial<PublishInput>): string {
  const r = buildStaticLesson(input(over))
  if (r.ok) throw new Error('expected an error')
  return r.error
}

describe('buildStaticLesson', () => {
  it('builds a StaticLesson with all fields', () => {
    const r = buildStaticLesson(input())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({
      id: 'l01-welcome',
      kind: 'static',
      title: 'Test lesson',
      langId: 'en',
      createdAt: 5,
      audioUrl: 'lessons/test/L01 Welcome.mp3',
      duration: 10,
      sentences: [
        { id: 's1', text: 'Hello there.', start: 0, end: 4 },
        { id: 's2', text: 'How are you?', start: 4, end: 9 },
      ],
      level: 'A1',
      topic: 'Greetings',
      source: { name: 'Test source', url: 'https://example.com/page', license: 'public domain' },
      seriesId: 'demo',
      order: 2,
    })
  })

  it('prefers an explicit id over the one derived from audioUrl', () => {
    const r = buildStaticLesson(input({ id: ' my-id ' }))
    expect(r.ok && r.value.id).toBe('my-id')
  })

  it('omits seriesId and order when blank', () => {
    const r = buildStaticLesson(input({ seriesId: ' ', order: '' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('seriesId' in r.value).toBe(false)
      expect('order' in r.value).toBe(false)
    }
  })

  it('never includes audio data, only a path', () => {
    const r = buildStaticLesson(input())
    expect(JSON.stringify(r)).not.toMatch(/blob|base64/i)
  })

  it('produces output that parseCatalog accepts', () => {
    const r = buildStaticLesson(input())
    if (!r.ok) throw new Error(r.error)
    const parsed = parseCatalog({ version: 1, lessons: [JSON.parse(JSON.stringify(r.value))], series: [] })
    expect(parsed.warnings).toEqual([])
    expect(parsed.lessons).toEqual([r.value])
  })

  it('normalizes the audio path', () => {
    const r = buildStaticLesson(input({ audioUrl: ' ./lessons\\voa\\l01.mp3 ' }))
    expect(r.ok && r.value.audioUrl).toBe('lessons/voa/l01.mp3')
  })

  it('reports Vietnamese errors for missing required fields', () => {
    expect(errorOf({ audioUrl: ' ' })).toContain('đường dẫn audio')
    expect(errorOf({ title: ' ' })).toContain('tên bài')
    expect(errorOf({ level: '' })).toContain('trình độ')
    expect(errorOf({ topic: '' })).toContain('chủ đề')
    expect(errorOf({ source: { name: '', url: 'https://x.com', license: 'CC0' } })).toContain('thông tin nguồn')
    expect(errorOf({ source: { name: 'a', url: 'https://x.com', license: '' } })).toContain('thông tin nguồn')
  })

  it('rejects invalid values', () => {
    expect(errorOf({ level: 'B2' })).toContain('trình độ')
    expect(errorOf({ audioUrl: 'https://example.com/a.mp3' })).toContain('tương đối')
    expect(errorOf({ audioUrl: '//cdn.example.com/a.mp3' })).toContain('tương đối')
    expect(errorOf({ source: { name: 'a', url: 'javascript:alert(1)', license: 'x' } })).toContain('http')
    expect(errorOf({ order: '0' })).toContain('order')
    expect(errorOf({ order: '1.5' })).toContain('order')
    expect(errorOf({ order: 'abc' })).toContain('order')
  })

  it('rejects sentences with bad times or no text', () => {
    expect(errorOf({ sentences: [] })).toContain('chưa hợp lệ')
    expect(errorOf({ sentences: [{ id: 'a', text: 'Hi.', start: 3, end: 2 }] })).toContain('chưa hợp lệ')
    expect(errorOf({ sentences: [{ id: 'a', text: 'Hi.', start: 0, end: 50 }] })).toContain('chưa hợp lệ')
    expect(errorOf({ sentences: [{ id: 'a', text: ' ', start: 0, end: 2 }] })).toContain('chưa hợp lệ')
  })

  it('fails when no id can be derived', () => {
    expect(errorOf({ audioUrl: 'lessons/___.mp3' })).toContain('id')
  })
})

describe('slugFromPath', () => {
  it('uses the file name without extension, lowercased and dashed', () => {
    expect(slugFromPath('lessons/voa/L05 Where are you?.mp3')).toBe('l05-where-are-you')
    expect(slugFromPath('a.b.c.mp3')).toBe('a-b-c')
    expect(slugFromPath('lessons/')).toBe('')
  })
})
