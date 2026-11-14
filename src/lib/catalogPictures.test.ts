import { describe, expect, it } from 'vitest'
import { parseCatalog, parsePicture } from './catalog.ts'
import { contentIssues } from './pictures.ts'

/** Valid picture fixture (test data only). */
const picture = (over: Record<string, unknown> = {}) => ({
  id: 'met-1',
  title: 'Test picture',
  image: {
    src: 'pictures/met-1.webp',
    width: 1600,
    height: 1094,
    alt: 'Ảnh thử',
    credit: { text: 'Credit text', url: 'https://example.com/art' },
  },
  description: ['Câu một.', 'Câu hai.', 'Câu ba.'],
  commentary: { story: 'Cảnh một.', view: 'Cách nhìn.', takeaway: 'Điều rút ra.' },
  intro: ['This is a test.', 'It is blue.', 'I like it.'],
  ...over,
})

const withPictures = (...list: unknown[]) => parseCatalog({ version: 1, lessons: [], pictures: list })

/** Minimal valid lesson, to check that lessons and pictures are parsed independently. */
const lesson = () => ({
  id: 'l1',
  kind: 'static',
  title: 'Lesson',
  audioUrl: 'lessons/l1.mp3',
  duration: 10,
  sentences: [{ id: 's1', text: 'Hello.', start: 0, end: 4 }],
  level: 'A1',
  topic: 'Greetings',
  source: { name: 'Test source', url: 'https://example.com/x', license: 'public domain' },
})

describe('parseCatalog: pictures', () => {
  it('accepts a valid picture', () => {
    const r = withPictures(picture())
    expect(r.warnings).toEqual([])
    expect(r.pictures).toHaveLength(1)
    expect(r.pictures[0]).toEqual({
      id: 'met-1',
      title: 'Test picture',
      image: {
        src: 'pictures/met-1.webp',
        width: 1600,
        height: 1094,
        alt: 'Ảnh thử',
        credit: { text: 'Credit text', url: 'https://example.com/art' },
      },
      description: ['Câu một.', 'Câu hai.', 'Câu ba.'],
      commentary: { story: 'Cảnh một.', view: 'Cách nhìn.', takeaway: 'Điều rút ra.' },
      intro: ['This is a test.', 'It is blue.', 'I like it.'],
    })
  })

  it('needs no grid, level or lesson ids', () => {
    const r = withPictures(picture())
    expect(Object.keys(r.pictures[0]).sort()).toEqual(['commentary', 'description', 'id', 'image', 'intro', 'title'])
  })

  it('trims text fields', () => {
    const r = withPictures(picture({ title: '  Spaced  ', intro: [' One. ', 'Two.', 'Three.'] }))
    expect(r.pictures[0].title).toBe('Spaced')
    expect(r.pictures[0].intro[0]).toBe('One.')
  })

  it('skips a picture with a missing or empty id or title', () => {
    for (const over of [{ id: '' }, { id: undefined }, { title: ' ' }, { title: undefined }]) {
      const r = withPictures(picture(over))
      expect(r.pictures).toEqual([])
      expect(r.warnings).toHaveLength(1)
    }
  })

  it('skips a picture with a bad image or credit', () => {
    const image = picture().image
    const bad: unknown[] = [
      { ...image, src: '' },
      { ...image, alt: ' ' },
      { ...image, width: 0 },
      { ...image, width: 10.5 },
      { ...image, height: '100' },
      { ...image, credit: { text: 'x' } },
      { ...image, credit: { url: 'https://example.com' } },
      { ...image, credit: 'x' },
      'x.webp',
      undefined,
    ]
    for (const img of bad) expect(withPictures(picture({ image: img })).pictures, JSON.stringify(img)).toEqual([])
  })

  it('skips a picture with an empty or invalid description or intro', () => {
    for (const field of ['description', 'intro']) {
      for (const value of [[], ['ok', ' '], ['ok', 3], 'text', undefined, null]) {
        const r = withPictures(picture({ [field]: value }))
        expect(r.pictures, `${field}: ${JSON.stringify(value)}`).toEqual([])
        expect(r.warnings[0]).toContain(field)
      }
    }
  })

  it('leaves sentence counts and word limits to contentIssues, not the parser', () => {
    const r = withPictures(picture({ description: ['Một câu.'], intro: ['one two three four five six seven eight nine ten eleven'] }))
    expect(r.warnings).toEqual([])
    expect(r.pictures).toHaveLength(1)
    expect(contentIssues(r.pictures[0]).length).toBeGreaterThan(0)
  })

  it('skips a duplicate id, keeps the first and does not drop lessons', () => {
    const r = parseCatalog({
      version: 1,
      lessons: [lesson()],
      pictures: [picture({ title: 'First' }), picture({ title: 'Second' })],
    })
    expect(r.pictures.map((p) => p.title)).toEqual(['First'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('trùng id')
    expect(r.lessons).toHaveLength(1)
  })

  it('keeps valid pictures next to invalid ones', () => {
    const r = withPictures(picture({ id: 'met-bad', intro: [] }), picture({ id: 'met-good' }))
    expect(r.pictures.map((p) => p.id)).toEqual(['met-good'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('met-bad')
  })

  it('does not break lessons when pictures are invalid', () => {
    const r = parseCatalog({ version: 1, lessons: [lesson()], pictures: [null, 5, 'x'] })
    expect(r.lessons).toHaveLength(1)
    expect(r.pictures).toEqual([])
    expect(r.warnings).toHaveLength(3)
  })
})

describe('parseCatalog: commentary (required, strict)', () => {
  const GOOD = { story: 'Cảnh một.', view: 'Cách nhìn.', takeaway: 'Điều rút ra.' }

  it('rejects a picture without commentary, with a Vietnamese error', () => {
    const r = withPictures(picture({ commentary: undefined }))
    expect(r.pictures).toEqual([])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('met-1')
    expect(r.warnings[0]).toContain('thiếu commentary')
  })

  it('rejects a commentary that is not an object', () => {
    for (const commentary of [null, 'text', 5, [], ['a', 'b', 'c'], true]) {
      const r = withPictures(picture({ commentary }))
      expect(r.pictures, JSON.stringify(commentary)).toEqual([])
      expect(r.warnings[0]).toContain('commentary')
    }
  })

  it('rejects each missing, empty, blank or non-string field and names it', () => {
    for (const key of ['story', 'view', 'takeaway']) {
      for (const value of [undefined, '', '   ', null, 3, ['x'], {}]) {
        const r = withPictures(picture({ commentary: { ...GOOD, [key]: value } }))
        expect(r.pictures, key + ': ' + JSON.stringify(value)).toEqual([])
        expect(r.warnings[0]).toContain('commentary.' + key)
      }
    }
  })

  it('accepts a valid commentary and trims it', () => {
    const r = withPictures(picture({ commentary: { story: '  Một.  ', view: ' Hai. ', takeaway: ' Ba. ' } }))
    expect(r.warnings).toEqual([])
    expect(r.pictures[0].commentary).toEqual({ story: 'Một.', view: 'Hai.', takeaway: 'Ba.' })
  })

  it('does not store the "Rút ra" label (that is added by the UI)', () => {
    const r = withPictures(picture())
    expect(r.pictures[0].commentary.takeaway.startsWith('Rút ra')).toBe(false)
  })

  it('only reports the broken picture and keeps the others', () => {
    const r = withPictures(picture({ id: 'met-bad', commentary: {} }), picture({ id: 'met-good' }))
    expect(r.pictures.map((p) => p.id)).toEqual(['met-good'])
    expect(r.warnings).toHaveLength(1)
  })
})

describe('parseCatalog: byline (optional)', () => {
  it('accepts and trims a byline', () => {
    expect(withPictures(picture({ byline: '  Artist · 1900 ' })).pictures[0].byline).toBe('Artist · 1900')
  })

  it('is absent when not given', () => {
    expect('byline' in withPictures(picture()).pictures[0]).toBe(false)
  })

  it('rejects an empty or non-string byline', () => {
    for (const byline of ['', '  ', 5, null]) {
      const r = withPictures(picture({ byline }))
      expect(r.pictures, JSON.stringify(byline)).toEqual([])
      expect(r.warnings[0]).toContain('byline')
    }
  })
})

describe('parsePicture', () => {
  it('returns a Vietnamese error for a non-object', () => {
    const r = parsePicture('x')
    expect(r.ok).toBe(false)
  })
})
