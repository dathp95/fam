import { describe, expect, it } from 'vitest'
import { parseCatalog } from './catalog.ts'

/** Valid series fixture (test data only): a 3×2 grid with 6 lessons. */
const series = (over: Record<string, unknown> = {}) => ({
  id: 'demo',
  title: 'Demo series',
  level: 'A1',
  image: {
    src: 'series/demo/demo.webp',
    width: 1600,
    height: 1094,
    alt: 'Demo picture',
    credit: { text: 'Credit text', url: 'https://example.com/art' },
  },
  grid: { cols: 3, rows: 2 },
  revealOrder: [3, 0, 5, 1, 4, 2],
  lessonIds: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'],
  intro: ['This is a picture.', 'It is a test.'],
  ...over,
})

/** Minimal valid lesson, to check that series and lessons are parsed independently. */
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

const withSeries = (...list: unknown[]) => parseCatalog({ version: 1, lessons: [], series: list })

describe('parseCatalog: series', () => {
  it('accepts a valid series', () => {
    const r = withSeries(series())
    expect(r.warnings).toEqual([])
    expect(r.series).toHaveLength(1)
    expect(r.series[0].grid).toEqual({ cols: 3, rows: 2 })
    expect(r.series[0].revealOrder).toEqual([3, 0, 5, 1, 4, 2])
  })

  it('accepts a series whose lessons are mostly missing from the catalog', () => {
    const r = parseCatalog({ version: 1, lessons: [lesson()], series: [series()] })
    expect(r.warnings).toEqual([])
    expect(r.lessons).toHaveLength(1)
    expect(r.series[0].lessonIds).toContain('l6')
  })

  it('skips a series when the grid does not match the number of lessons', () => {
    const r = withSeries(series({ grid: { cols: 2, rows: 2 } }))
    expect(r.series).toEqual([])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('lưới')
  })

  it('skips a series when revealOrder is not a permutation', () => {
    const bad: unknown[] = [
      [0, 1, 2, 3, 4, 4], // duplicate
      [0, 1, 2, 3, 4, 6], // out of range
      [0, 1, 2, 3, 4], // too short
      [0, 1, 2, 3, 4, 5, 6], // too long
      [0, 1, 2, 3, 4, 1.5], // not an integer
      [0, 1, 2, 3, 4, '5'], // wrong type
      'nope',
    ]
    for (const revealOrder of bad) {
      const r = withSeries(series({ revealOrder }))
      expect(r.series).toEqual([])
      expect(r.warnings[0]).toContain('revealOrder')
    }
  })

  it('skips a series with an empty or invalid intro', () => {
    for (const intro of [[], ['ok', ' '], ['ok', 3], 'text', undefined]) {
      const r = withSeries(series({ intro }))
      expect(r.series).toEqual([])
      expect(r.warnings[0]).toContain('intro')
    }
  })

  it('skips a series with duplicate or invalid lessonIds', () => {
    expect(withSeries(series({ lessonIds: ['a', 'a', 'b', 'c', 'd', 'e'] })).series).toEqual([])
    expect(withSeries(series({ lessonIds: ['a', 'b', 'c', 'd', 'e', ''] })).series).toEqual([])
    expect(withSeries(series({ lessonIds: 'abc' })).series).toEqual([])
  })

  it('skips a series with a bad image or credit', () => {
    const image = series().image
    expect(withSeries(series({ image: { ...image, src: '' } })).series).toEqual([])
    expect(withSeries(series({ image: { ...image, alt: ' ' } })).series).toEqual([])
    expect(withSeries(series({ image: { ...image, width: 0 } })).series).toEqual([])
    expect(withSeries(series({ image: { ...image, height: 10.5 } })).series).toEqual([])
    expect(withSeries(series({ image: { ...image, credit: { text: 'x' } } })).series).toEqual([])
    expect(withSeries(series({ image: 'x.webp' })).series).toEqual([])
  })

  it('skips a series with a bad level, title or grid', () => {
    expect(withSeries(series({ level: 'C1' })).series).toEqual([])
    expect(withSeries(series({ title: '' })).series).toEqual([])
    expect(withSeries(series({ grid: { cols: 0, rows: 6 } })).series).toEqual([])
    expect(withSeries(series({ grid: { cols: 3 } })).series).toEqual([])
  })

  it('skips a duplicate series id, keeps the first and does not drop lessons', () => {
    const r = parseCatalog({
      version: 1,
      lessons: [lesson()],
      series: [series({ title: 'First' }), series({ title: 'Second' })],
    })
    expect(r.series.map((s) => s.title)).toEqual(['First'])
    expect(r.warnings).toHaveLength(1)
    expect(r.lessons).toHaveLength(1)
  })

  it('keeps valid series next to invalid ones', () => {
    const r = withSeries(series({ id: 'bad', revealOrder: [0, 0, 0, 0, 0, 0] }), series({ id: 'good' }))
    expect(r.series.map((s) => s.id)).toEqual(['good'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('bad')
  })
})
