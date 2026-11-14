import { describe, expect, it } from 'vitest'
import shipped from '../../public/lessons/index.json'
import { parseCatalog } from './catalog.ts'
import { revealedTiles } from './progress.ts'

/** Guards the real data in public/lessons/index.json, so a typo there is caught by `npm test`. */
describe('shipped catalog (public/lessons/index.json)', () => {
  const catalog = parseCatalog(shipped as unknown)

  it('has no validation warnings', () => {
    expect(catalog.warnings).toEqual([])
  })

  it('defines the nature series as a 5×2 grid with 10 lessons and the real image', () => {
    const nature = catalog.series.find((s) => s.id === 'nature')
    expect(nature).toBeDefined()
    expect(nature?.grid).toEqual({ cols: 5, rows: 2 })
    expect(nature?.lessonIds).toHaveLength(10)
    expect(nature?.image.src).toBe('series/nature/nature.webp')
    expect(nature?.image).toMatchObject({ width: 1600, height: 1094 })
    expect(nature?.intro).toHaveLength(5)
  })

  it('lists the nature lessons in the documented order', () => {
    expect(catalog.series.find((s) => s.id === 'nature')?.lessonIds).toEqual([
      'voa-l01-welcome',
      'voa-l05-where-are-you',
      'voa-l07-what-are-you-doing',
      'voa-l09-is-it-cold',
      'voa-l11-neighborhood',
      'voa-l12-family',
      'voa-l16-where-from',
      'voa-l17-free-on-friday',
      'voa-l22-next-summer',
      'voa-l35-make-dinner',
    ])
  })

  it('every lesson with a seriesId belongs to a defined series, at the position given by order', () => {
    for (const l of catalog.lessons) {
      if (l.seriesId === undefined) continue
      const s = catalog.series.find((x) => x.id === l.seriesId)
      expect(s, `series for ${l.id}`).toBeDefined()
      expect(s?.lessonIds, `lessonIds for ${l.id}`).toContain(l.id)
      if (s && l.order !== undefined) expect(s.lessonIds.indexOf(l.id) + 1, `order of ${l.id}`).toBe(l.order)
    }
  })

  it('opens exactly one tile when only the lesson in the catalog is passed', () => {
    const nature = catalog.series.find((s) => s.id === 'nature')
    if (!nature) throw new Error('nature series missing')
    const only = { lessonsDone: { 'voa-l01-welcome': { best: 90, at: 1 } } }
    expect(revealedTiles(nature, only)).toEqual(nature.revealOrder.slice(0, 1))
  })
})
