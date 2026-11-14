import { describe, expect, it } from 'vitest'
import shipped from '../../public/lessons/index.json'
import { parseCatalog } from './catalog.ts'
import { contentIssues } from './pictures.ts'

/** Files in public/pictures/ (paths are relative to this test file). */
const pictureFiles = Object.keys(import.meta.glob('../../public/pictures/*.webp')).map((p) => p.split('/').pop())

/** Guards the real data in public/lessons/index.json, so a typo there is caught by `npm test`. */
describe('shipped catalog (public/lessons/index.json)', () => {
  const catalog = parseCatalog(shipped as unknown)

  it('has no validation warnings', () => {
    expect(catalog.warnings).toEqual([])
  })

  it('uses "pictures" and no longer has a "series" key', () => {
    expect(Array.isArray((shipped as Record<string, unknown>).pictures)).toBe(true)
    expect('series' in shipped).toBe(false)
  })

  it('has at least one picture, with unique "met-<objectId>" ids', () => {
    expect(catalog.pictures.length).toBeGreaterThan(0)
    const ids = catalog.pictures.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^met-\d+$/)
  })

  it('every picture follows the content rules (3–5 Vietnamese sentences, 3–5 short English ones)', () => {
    for (const p of catalog.pictures) expect(contentIssues(p), p.id).toEqual([])
  })

  it('every picture points to an existing image named after its id', () => {
    for (const p of catalog.pictures) {
      expect(p.image.src, p.id).toBe(`pictures/${p.id}.webp`)
      expect(pictureFiles, `file for ${p.id}`).toContain(`${p.id}.webp`)
      expect(p.image.width).toBeGreaterThan(0)
      expect(p.image.height).toBeGreaterThan(0)
      expect(p.image.alt.length, `alt of ${p.id}`).toBeGreaterThan(0)
    }
  })

  it('every credit is a Vietnamese Met Open Access credit with a museum link', () => {
    for (const p of catalog.pictures) {
      expect(p.image.credit.url, p.id).toMatch(/^https:\/\/www\.metmuseum\.org\/art\/collection\/search\/\d+$/)
      expect(p.image.credit.text, p.id).toContain('The Metropolitan Museum of Art')
      expect(p.image.credit.text, p.id).toMatch(/Ảnh thuộc phạm vi công cộng \(Met Open Access\)\.$/)
      expect(p.image.credit.url.endsWith(p.id.replace('met-', '')), p.id).toBe(true)
    }
  })

  it('contains Hokusai’s Great Wave as met-39799 with the approved content', () => {
    const wave = catalog.pictures.find((p) => p.id === 'met-39799')
    expect(wave).toBeDefined()
    expect(wave?.image).toMatchObject({ src: 'pictures/met-39799.webp', width: 1600, height: 1094 })
    expect(wave?.image.credit).toEqual({
      text: 'Katsushika Hokusai, "Under the Wave off Kanagawa" (The Great Wave), khoảng 1830–32. Bảo tàng Nghệ thuật Metropolitan (The Metropolitan Museum of Art), Bộ sưu tập Howard Mansfield, mua bằng Quỹ Rogers, 1936. Ảnh thuộc phạm vi công cộng (Met Open Access).',
      url: 'https://www.metmuseum.org/art/collection/search/39799',
    })
    expect(wave?.intro).toEqual([
      'This picture is called The Great Wave.',
      'Hokusai is a Japanese artist.',
      'It is a woodblock print.',
      'It is from about 1830.',
      'Mount Fuji is small in the wave.',
    ])
    expect(wave?.description).toHaveLength(4)
  })

  it('keeps the existing lesson (and its seriesId/order) untouched', () => {
    const lesson = catalog.lessons.find((l) => l.id === 'voa-l01-welcome')
    expect(lesson).toBeDefined()
    expect(lesson?.seriesId).toBe('nature')
    expect(lesson?.order).toBe(1)
  })
})
