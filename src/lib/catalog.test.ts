import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetUrl, loadCatalog, parseLessonsFile, parseStaticLesson } from './catalog.ts'

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

const catalog = (lessons: unknown[]) => ({ version: 1, lessons })

describe('parseLessonsFile', () => {
  it('accepts an empty lessons file', () => {
    expect(parseLessonsFile({ version: 1, lessons: [] })).toEqual({ lessons: [], warnings: [] })
  })

  it('ignores a legacy "series" key without a warning', () => {
    const r = parseLessonsFile({ version: 1, lessons: [lesson()], series: [{ id: 'old' }] })
    expect(r.lessons).toHaveLength(1)
    expect(r.warnings).toEqual([])
  })

  it('ignores a legacy "pictures" array: nothing leaks into the result and there is no warning', () => {
    const r = parseLessonsFile({ version: 1, lessons: [lesson()], pictures: [{ id: 'met-1', title: 'x' }] })
    expect(r).toEqual({ lessons: [expect.objectContaining({ id: 'test-l01' })], warnings: [] })
    expect('pictures' in r).toBe(false)
  })

  it('accepts valid lessons', () => {
    const r = parseLessonsFile(catalog([lesson(), lesson({ id: 'test-l02', seriesId: undefined, order: undefined })]))
    expect(r.warnings).toEqual([])
    expect(r.lessons.map((l) => l.id)).toEqual(['test-l01', 'test-l02'])
    expect(r.lessons[1].seriesId).toBeUndefined()
    expect(r.lessons[1].order).toBeUndefined()
  })

  it('skips a lesson with a missing field and warns', () => {
    const { audioUrl: _omit, ...noAudio } = lesson()
    void _omit
    const r = parseLessonsFile(catalog([noAudio, lesson({ id: 'ok' })]))
    expect(r.lessons.map((l) => l.id)).toEqual(['ok'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('#1')
    expect(r.warnings[0]).toContain('audioUrl')
  })

  it('skips lessons with wrong types', () => {
    const r = parseLessonsFile(
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
    const bad = (s: unknown) => parseLessonsFile(catalog([lesson({ sentences: [s] })])).lessons.length
    expect(bad({ id: 'a', text: 'x', start: 5, end: 5 })).toBe(0)
    expect(bad({ id: 'a', text: 'x', start: -1, end: 2 })).toBe(0)
    expect(bad({ id: 'a', text: 'x', start: 0, end: 11 })).toBe(0) // beyond duration 10
    expect(bad({ id: 'a', text: '  ', start: 0, end: 2 })).toBe(0)
    expect(bad({ id: 'a', text: 'x', start: '0', end: 2 })).toBe(0)
  })

  it('skips a duplicate lesson id and keeps the first', () => {
    const r = parseLessonsFile(catalog([lesson({ title: 'First' }), lesson({ title: 'Second' })]))
    expect(r.lessons).toHaveLength(1)
    expect(r.lessons[0].title).toBe('First')
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('trùng id')
  })

  it('returns no lessons and a warning for malformed input', () => {
    for (const raw of [null, 'x', 42, [], {}, { version: 2, lessons: [] }, { version: 1 }, { version: 1, lessons: {} }]) {
      const r = parseLessonsFile(raw)
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

describe('loadCatalog', () => {
  const lessonsFile = { version: 1, lessons: [lesson()] }
  const picturesFile = {
    version: 1,
    pictures: [
      {
        id: 'met-1',
        title: 'Test picture',
        image: { src: 'pictures/met-1.webp', width: 10, height: 10, alt: 'a', credit: { text: 't', url: 'https://example.com' } },
        description: ['Một.'],
        commentary: { story: 'a', view: 'b', takeaway: 'c' },
        intro: ['One.'],
      },
    ],
  }
  const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) })

  /** Mock fetch by URL; a null body makes that file fail (HTTP 404). Returns the requested URLs. */
  const mockFetch = (files: { lessons: unknown; pictures: unknown }) => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url)
      const body = url.endsWith('lessons/index.json') ? files.lessons : files.pictures
      return Promise.resolve(body === null ? { ok: false, status: 404, json: () => Promise.reject(new Error('x')) } : ok(body))
    })
    return calls
  }

  afterEach(() => vi.unstubAllGlobals())

  it('fetches both files and returns lessons and pictures', async () => {
    const calls = mockFetch({ lessons: lessonsFile, pictures: picturesFile })
    const r = await loadCatalog()
    expect(calls.map((u) => u.replace(/^.*?(lessons|pictures)\/index\.json$/, '$1')).sort()).toEqual(['lessons', 'pictures'])
    expect(r.error).toBeNull()
    expect(r.warnings).toEqual([])
    expect(r.lessons.map((l) => l.id)).toEqual(['test-l01'])
    expect(r.pictures.map((p) => p.id)).toEqual(['met-1'])
  })

  it('keeps the pictures when the lessons file fails', async () => {
    mockFetch({ lessons: null, pictures: picturesFile })
    const r = await loadCatalog()
    expect(r.lessons).toEqual([])
    expect(r.error).toContain('Không tải được danh sách bài có sẵn')
    expect(r.pictures.map((p) => p.id)).toEqual(['met-1'])
  })

  it('keeps the lessons when the pictures file fails, with a separate message', async () => {
    mockFetch({ lessons: lessonsFile, pictures: null })
    const r = await loadCatalog()
    expect(r.lessons.map((l) => l.id)).toEqual(['test-l01'])
    expect(r.pictures).toEqual([])
    expect(r.error).toBeNull()
    expect(r.warnings).toEqual(['Không tải được danh sách tranh.'])
  })

  it('does not throw when both fail, and sets error', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    const r = await loadCatalog()
    expect(r.lessons).toEqual([])
    expect(r.pictures).toEqual([])
    expect(r.error).not.toBeNull()
    expect(r.warnings).toEqual(['Không tải được danh sách tranh.'])
  })

  it('does not take pictures from a legacy "pictures" array in the lessons file', async () => {
    mockFetch({ lessons: { ...lessonsFile, pictures: picturesFile.pictures }, pictures: { version: 1, pictures: [] } })
    const r = await loadCatalog()
    expect(r.lessons).toHaveLength(1)
    expect(r.pictures).toEqual([])
  })

  it('reports validation warnings of either file', async () => {
    mockFetch({ lessons: { version: 1, lessons: [null] }, pictures: { version: 1, pictures: [5] } })
    const r = await loadCatalog()
    expect(r.warnings).toHaveLength(2)
  })
})
