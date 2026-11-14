import { describe, expect, it } from 'vitest'
import { assetUrl, parseCatalog, parseStaticLesson } from './catalog.ts'

/** Valid lesson fixture (test data only, not real content). */
const lesson = (over: Record<string, unknown> = {}) => ({
  id: 'test-l01',
  kind: 'static',
  title: 'Test lesson',
  langId: 'en',
  createdAt: 1,
  audioUrl: 'lessons/test/l01.mp3',
  duration: 10,
  sentences: [
    { id: 's1', text: 'Hello there.', start: 0, end: 4 },
    { id: 's2', text: 'How are you?', start: 4, end: 9.5 },
  ],
  level: 'A1',
  topic: 'Greetings',
  source: { name: 'Test source', url: 'https://example.com/x', license: 'public domain' },
  seriesId: 'demo',
  order: 1,
  ...over,
})

const catalog = (lessons: unknown[]) => ({ version: 1, lessons, series: [] })

describe('parseCatalog', () => {
  it('accepts an empty catalog', () => {
    expect(parseCatalog({ version: 1, lessons: [], series: [] })).toEqual({ lessons: [], series: [], warnings: [] })
  })

  it('treats a missing "series" key as no series', () => {
    expect(parseCatalog({ version: 1, lessons: [] })).toEqual({ lessons: [], series: [], warnings: [] })
  })

  it('warns when "series" is not an array but keeps the lessons', () => {
    const r = parseCatalog({ version: 1, lessons: [lesson()], series: {} })
    expect(r.lessons).toHaveLength(1)
    expect(r.series).toEqual([])
    expect(r.warnings).toHaveLength(1)
  })

  it('accepts valid lessons', () => {
    const r = parseCatalog(catalog([lesson(), lesson({ id: 'test-l02', seriesId: undefined, order: undefined })]))
    expect(r.warnings).toEqual([])
    expect(r.lessons.map((l) => l.id)).toEqual(['test-l01', 'test-l02'])
    expect(r.lessons[1].seriesId).toBeUndefined()
    expect(r.lessons[1].order).toBeUndefined()
  })

  it('skips a lesson with a missing field and warns', () => {
    const { audioUrl: _omit, ...noAudio } = lesson()
    void _omit
    const r = parseCatalog(catalog([noAudio, lesson({ id: 'ok' })]))
    expect(r.lessons.map((l) => l.id)).toEqual(['ok'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('#1')
    expect(r.warnings[0]).toContain('audioUrl')
  })

  it('skips lessons with wrong types', () => {
    const r = parseCatalog(
      catalog([
        lesson({ duration: '10' }),
        lesson({ level: 'C2' }),
        lesson({ order: 0 }),
        lesson({ order: 1.5 }),
        lesson({ sentences: 'nope' }),
        lesson({ sentences: [] }),
        lesson({ source: 'VOA' }),
        'not an object',
        null,
      ]),
    )
    expect(r.lessons).toEqual([])
    expect(r.warnings).toHaveLength(9)
  })

  it('skips lessons with bad sentence times', () => {
    const bad = (s: unknown) => parseCatalog(catalog([lesson({ sentences: [s] })])).lessons.length
    expect(bad({ id: 'a', text: 'x', start: 5, end: 5 })).toBe(0)
    expect(bad({ id: 'a', text: 'x', start: -1, end: 2 })).toBe(0)
    expect(bad({ id: 'a', text: 'x', start: 0, end: 11 })).toBe(0) // beyond duration 10
    expect(bad({ id: 'a', text: '  ', start: 0, end: 2 })).toBe(0)
    expect(bad({ id: 'a', text: 'x', start: '0', end: 2 })).toBe(0)
  })

  it('skips a duplicate lesson id and keeps the first', () => {
    const r = parseCatalog(catalog([lesson({ title: 'First' }), lesson({ title: 'Second' })]))
    expect(r.lessons).toHaveLength(1)
    expect(r.lessons[0].title).toBe('First')
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('trùng id')
  })

  it('returns an empty catalog with a warning for malformed input', () => {
    for (const raw of [null, 'x', 42, [], {}, { version: 2, lessons: [] }, { version: 1 }, { version: 1, lessons: {} }]) {
      const r = parseCatalog(raw)
      expect(r.lessons).toEqual([])
      expect(r.warnings.length).toBeGreaterThan(0)
    }
  })
})

describe('parseStaticLesson', () => {
  it('applies defaults for langId, createdAt and missing sentence ids', () => {
    const r = parseStaticLesson(
      lesson({ langId: undefined, createdAt: undefined, sentences: [{ text: 'Hi.', start: 0, end: 2 }] }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.langId).toBe('en')
      expect(r.value.createdAt).toBe(0)
      expect(r.value.sentences[0].id).toBe('test-l01-1')
    }
  })

  it('rejects duplicate sentence ids', () => {
    const s = { id: 'same', text: 'Hi.', start: 0, end: 2 }
    const r = parseStaticLesson(lesson({ sentences: [s, { ...s, start: 2, end: 4 }] }))
    expect(r.ok).toBe(false)
  })

  it('rejects a lesson whose kind is not "static"', () => {
    expect(parseStaticLesson(lesson({ kind: 'media' })).ok).toBe(false)
  })

  it('rejects an empty seriesId', () => {
    expect(parseStaticLesson(lesson({ seriesId: '  ' })).ok).toBe(false)
  })
})

describe('assetUrl', () => {
  it('joins the base and a relative path', () => {
    expect(assetUrl('lessons/voa/l01.mp3', '/')).toBe('/lessons/voa/l01.mp3')
    expect(assetUrl('lessons/voa/l01.mp3', '/fam/')).toBe('/fam/lessons/voa/l01.mp3')
  })

  it('tolerates a base without trailing slash and a leading ./ or /', () => {
    expect(assetUrl('./lessons/a.mp3', '/fam')).toBe('/fam/lessons/a.mp3')
    expect(assetUrl('/lessons/a.mp3', '/')).toBe('/lessons/a.mp3')
  })
})
