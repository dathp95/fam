import { describe, expect, it } from 'vitest'
import {
  buildCreditText,
  buildPicture,
  DRAFT_FIELDS,
  isPublicDomain,
  mergeIntoCatalog,
  mergePicture,
  metApiUrl,
  objectIdFromFilename,
  parseContent,
  pickDraftFields,
  pictureId,
  pictureSrc,
  type MetDraft,
  type PictureContent,
} from './ingest.ts'
import type { Picture } from './types.ts'

/** Fake draft (test data only, not a real record). */
const draft = (over: Partial<MetDraft> = {}): MetDraft => ({
  title: 'Test Title',
  artistDisplayName: 'Test Artist',
  objectDate: 'ca. 1900',
  medium: 'Test medium',
  dimensions: '10 × 20 cm',
  department: 'Test Department',
  culture: 'Test culture',
  period: '',
  creditLine: 'Gift of Someone, 1950',
  objectURL: 'https://www.metmuseum.org/art/collection/search/123',
  ...over,
})

const content = (over: Partial<PictureContent> = {}): PictureContent => ({
  description: ['Một.', 'Hai.', 'Ba.'],
  intro: ['This is a test.', 'It is old.', 'I see it.'],
  ...over,
})

const picture = (over: Partial<Picture> = {}): Picture =>
  buildPicture({ objectId: '123', draft: draft(), content: content(), width: 1600, height: 1000, ...over })

describe('file names and ids', () => {
  it('reads the object id from jpg, jpeg and png names, any case', () => {
    expect(objectIdFromFilename('435809.jpeg')).toBe('435809')
    expect(objectIdFromFilename('459092.jpg')).toBe('459092')
    expect(objectIdFromFilename('39799.PNG')).toBe('39799')
    expect(objectIdFromFilename('7.JpG')).toBe('7')
  })

  it('ignores everything else', () => {
    for (const name of ['435809.draft.json', '435809.content.json', '435809.webp', 'abc.jpg', '12a.jpg', '.jpg', '435809', '435809.jpg.bak', 'a/435809.jpg', '']) {
      expect(objectIdFromFilename(name), name).toBeNull()
    }
  })

  it('builds the API url, picture id and image path', () => {
    expect(metApiUrl('39799')).toBe('https://collectionapi.metmuseum.org/public/collection/v1/objects/39799')
    expect(pictureId('39799')).toBe('met-39799')
    expect(pictureSrc('39799')).toBe('pictures/met-39799.webp')
  })
})

describe('isPublicDomain', () => {
  it('is true only for a boolean true', () => {
    expect(isPublicDomain({ isPublicDomain: true })).toBe(true)
  })

  it('is false for false, missing, and look-alike values', () => {
    for (const api of [{ isPublicDomain: false }, {}, { isPublicDomain: 'true' }, { isPublicDomain: 1 }, { isPublicDomain: null }, null, undefined, 'x', [], 5]) {
      expect(isPublicDomain(api), JSON.stringify(api)).toBe(false)
    }
  })
})

describe('pickDraftFields', () => {
  it('keeps exactly the ten draft fields', () => {
    expect(DRAFT_FIELDS).toEqual([
      'title', 'artistDisplayName', 'objectDate', 'medium', 'dimensions',
      'department', 'culture', 'period', 'creditLine', 'objectURL',
    ])
    expect(Object.keys(pickDraftFields({}))).toEqual([...DRAFT_FIELDS])
  })

  it('drops every other API field (images, tags, ids, …)', () => {
    const picked = pickDraftFields({
      ...draft(),
      objectID: 123,
      isPublicDomain: true,
      primaryImage: 'https://example.com/x.jpg',
      tags: [{ term: 'x' }],
      constituents: [],
    })
    expect(picked).toEqual(draft())
    expect(Object.keys(picked)).not.toContain('primaryImage')
    expect(Object.keys(picked)).not.toContain('isPublicDomain')
  })

  it('turns missing or non-string values into empty strings and trims', () => {
    const picked = pickDraftFields({ title: '  Padded  ', objectDate: 1900, medium: null, creditLine: undefined })
    expect(picked.title).toBe('Padded')
    expect(picked.objectDate).toBe('')
    expect(picked.medium).toBe('')
    expect(picked.creditLine).toBe('')
  })

  it('copes with non-object input', () => {
    for (const api of [null, undefined, 'x', 5, []]) expect(pickDraftFields(api).title).toBe('')
  })
})

describe('buildCreditText', () => {
  it('follows the documented format', () => {
    expect(buildCreditText(draft())).toBe(
      'Test Artist, "Test Title", ca. 1900. The Metropolitan Museum of Art, Gift of Someone, 1950. Ảnh thuộc phạm vi công cộng (Met Open Access).',
    )
  })

  it('omits the artist when it is empty', () => {
    expect(buildCreditText(draft({ artistDisplayName: '' }))).toBe(
      '"Test Title", ca. 1900. The Metropolitan Museum of Art, Gift of Someone, 1950. Ảnh thuộc phạm vi công cộng (Met Open Access).',
    )
    expect(buildCreditText(draft({ artistDisplayName: '   ' })).startsWith('"Test Title"')).toBe(true)
  })

  it('omits an empty date or credit line without leaving stray punctuation', () => {
    expect(buildCreditText(draft({ objectDate: '' }))).toBe(
      'Test Artist, "Test Title". The Metropolitan Museum of Art, Gift of Someone, 1950. Ảnh thuộc phạm vi công cộng (Met Open Access).',
    )
    expect(buildCreditText(draft({ creditLine: '' }))).toBe(
      'Test Artist, "Test Title", ca. 1900. The Metropolitan Museum of Art. Ảnh thuộc phạm vi công cộng (Met Open Access).',
    )
  })

  it('always ends with the Vietnamese public-domain note', () => {
    expect(buildCreditText(draft())).toMatch(/Ảnh thuộc phạm vi công cộng \(Met Open Access\)\.$/)
  })
})

describe('parseContent', () => {
  it('accepts description and intro, with or without alt', () => {
    const r = parseContent({ alt: ' Ảnh thử ', description: [' Một. ', 'Hai.'], intro: ['One.', 'Two.'] })
    expect(r).toEqual({ ok: true, value: { alt: 'Ảnh thử', description: ['Một.', 'Hai.'], intro: ['One.', 'Two.'] } })
    const noAlt = parseContent({ description: ['Một.'], intro: ['One.'] })
    expect(noAlt.ok && noAlt.value.alt).toBeUndefined()
  })

  it('rejects bad input with a message', () => {
    const bad: unknown[] = [
      null, 'x', [],
      { intro: ['One.'] },
      { description: ['Một.'] },
      { description: [], intro: ['One.'] },
      { description: ['Một.', ''], intro: ['One.'] },
      { description: ['Một.'], intro: [3] },
      { description: 'Một.', intro: ['One.'] },
      { alt: '', description: ['Một.'], intro: ['One.'] },
      { alt: 5, description: ['Một.'], intro: ['One.'] },
    ]
    for (const raw of bad) {
      const r = parseContent(raw)
      expect(r.ok, JSON.stringify(raw)).toBe(false)
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
    }
  })
})

describe('buildPicture', () => {
  it('builds the picture from the draft, content and measured size', () => {
    expect(picture()).toEqual({
      id: 'met-123',
      title: 'Test Title',
      image: {
        src: 'pictures/met-123.webp',
        width: 1600,
        height: 1000,
        alt: 'Tác phẩm Test Title',
        credit: {
          text: buildCreditText(draft()),
          url: 'https://www.metmuseum.org/art/collection/search/123',
        },
      },
      description: ['Một.', 'Hai.', 'Ba.'],
      intro: ['This is a test.', 'It is old.', 'I see it.'],
    })
  })

  it('uses the neutral alt unless content provides one', () => {
    expect(picture().image.alt).toBe('Tác phẩm Test Title')
    const custom = buildPicture({ objectId: '123', draft: draft(), content: content({ alt: 'Tranh sơn dầu.' }), width: 1, height: 1 })
    expect(custom.image.alt).toBe('Tranh sơn dầu.')
  })

  it('takes the credit url from objectURL', () => {
    const p = buildPicture({ objectId: '9', draft: draft({ objectURL: 'https://example.com/9' }), content: content(), width: 1, height: 1 })
    expect(p.image.credit.url).toBe('https://example.com/9')
  })
})

describe('mergePicture', () => {
  const a = picture({})
  const b = buildPicture({ objectId: '456', draft: draft({ title: 'Other' }), content: content(), width: 1600, height: 900 })

  it('appends a new picture', () => {
    expect(mergePicture([a], b).map((p) => p.id)).toEqual(['met-123', 'met-456'])
    expect(mergePicture([], a)).toEqual([a])
  })

  it('replaces a picture with the same id in place', () => {
    const updated = { ...a, title: 'Changed' }
    const merged = mergePicture([b, a], updated)
    expect(merged.map((p) => p.id)).toEqual(['met-456', 'met-123'])
    expect(merged[1].title).toBe('Changed')
    expect(merged).toHaveLength(2)
  })

  it('does not mutate the input', () => {
    const list = [a]
    mergePicture(list, b)
    expect(list).toEqual([a])
  })
})

describe('mergeIntoCatalog', () => {
  const lesson = {
    id: 'l1',
    kind: 'static',
    title: 'Lesson',
    audioUrl: 'lessons/l1.mp3',
    duration: 10,
    sentences: [{ id: 's1', text: 'Hello.', start: 0, end: 4 }],
    level: 'A1',
    topic: 'Greetings',
    source: { name: 'Test source', url: 'https://example.com/x', license: 'public domain' },
    seriesId: 'nature',
    order: 1,
  }
  const base = () => ({ version: 1, lessons: [lesson], pictures: [] as unknown[] })

  it('adds a picture and leaves everything else as it was', () => {
    const r = mergeIntoCatalog(base(), [picture()])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.catalog.version).toBe(1)
    expect(r.catalog.lessons).toEqual([lesson])
    expect(r.catalog.pictures).toEqual([picture()])
  })

  it('replaces an entry with the same id and keeps the others in order', () => {
    const other = buildPicture({ objectId: '456', draft: draft(), content: content(), width: 1600, height: 900 })
    const start = { ...base(), pictures: [picture(), other] }
    const updated = picture({})
    updated.title = 'Updated title'
    const r = mergeIntoCatalog(start, [updated])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const list = r.catalog.pictures as Picture[]
    expect(list.map((p) => p.id)).toEqual(['met-123', 'met-456'])
    expect(list[0].title).toBe('Updated title')
  })

  it('does not mutate the original catalog object', () => {
    const start = base()
    mergeIntoCatalog(start, [picture()])
    expect(start.pictures).toEqual([])
  })

  it('refuses a picture that breaks the content rules (too few sentences)', () => {
    const bad = buildPicture({ objectId: '123', draft: draft(), content: content({ description: ['Chỉ một câu.'] }), width: 1600, height: 1000 })
    const r = mergeIntoCatalog(base(), [bad])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('description')
  })

  it('refuses an intro sentence longer than 10 words', () => {
    const long = 'one two three four five six seven eight nine ten eleven'
    const bad = buildPicture({ objectId: '123', draft: draft(), content: content({ intro: [long, 'Two.', 'Three.'] }), width: 1600, height: 1000 })
    const r = mergeIntoCatalog(base(), [bad])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('intro')
  })

  it('refuses a picture that the parser rejects (e.g. empty credit url)', () => {
    const bad = buildPicture({ objectId: '123', draft: draft({ objectURL: '' }), content: content(), width: 1600, height: 1000 })
    const r = mergeIntoCatalog(base(), [bad])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('met-123')
  })

  it('refuses when the existing catalog already has an invalid entry', () => {
    const start = { ...base(), pictures: [{ id: 'met-broken' }] }
    const r = mergeIntoCatalog(start, [picture()])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('met-broken')
  })

  it('refuses when an existing lesson is invalid', () => {
    const start = { ...base(), lessons: [{ id: 'l1' }] }
    expect(mergeIntoCatalog(start, [picture()]).ok).toBe(false)
  })

  it('refuses a catalog that is not an object, or has the wrong version', () => {
    for (const raw of [null, 'x', [], { version: 2, lessons: [] }]) expect(mergeIntoCatalog(raw, [picture()]).ok).toBe(false)
  })

  it('works when the catalog has no pictures key yet', () => {
    const r = mergeIntoCatalog({ version: 1, lessons: [lesson] }, [picture()])
    expect(r.ok).toBe(true)
  })

  it('merges several pictures at once', () => {
    const second = buildPicture({ objectId: '456', draft: draft(), content: content(), width: 1600, height: 900 })
    const r = mergeIntoCatalog(base(), [picture(), second])
    expect(r.ok && (r.catalog.pictures as Picture[]).map((p) => p.id)).toEqual(['met-123', 'met-456'])
  })
})
