import { describe, expect, it } from 'vitest'
import shippedLessons from '../../public/lessons/index.json'
import shippedPictures from '../../public/pictures/index.json'
import { parseLessonsFile, parsePicturesFile } from './catalog.ts'
import { contentIssues } from './pictures.ts'

/** Files in public/pictures/ (paths are relative to this test file). */
const pictureFiles = Object.keys(import.meta.glob('../../public/pictures/*.webp')).map((p) => p.split('/').pop())

/** Guards the real data in public/lessons/index.json and public/pictures/index.json, so a typo there is caught by `npm test`. */
describe('shipped catalogs', () => {
  const lessonsFile = parseLessonsFile(shippedLessons as unknown)
  const catalog = { ...parsePicturesFile(shippedPictures as unknown), lessons: lessonsFile.lessons }

  it('lessons file has no validation warnings and only version + lessons', () => {
    expect(lessonsFile.warnings).toEqual([])
    expect(Object.keys(shippedLessons).sort()).toEqual(['lessons', 'version'])
  })

  it('pictures file has no validation warnings and only version + pictures', () => {
    expect(catalog.warnings).toEqual([])
    expect(Object.keys(shippedPictures).sort()).toEqual(['pictures', 'version'])
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

  it('every picture has a complete commentary and no dimensions in its description', () => {
    for (const p of catalog.pictures) {
      for (const key of ['story', 'view', 'takeaway'] as const) {
        expect(p.commentary[key].trim().length, `${p.id} commentary.${key}`).toBeGreaterThan(0)
      }
      expect(p.commentary.takeaway.startsWith('Rút ra'), `${p.id} takeaway must not carry the label`).toBe(false)
      for (const sentence of p.description) expect(sentence.toLowerCase(), p.id).not.toContain('kích thước')
      expect(p.byline, `${p.id} byline`).toBeTruthy()
    }
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
    expect(wave?.description).toEqual([
      'Bức tranh này có tên Under the Wave off Kanagawa (The Great Wave), của họa sĩ Nhật Bản Katsushika Hokusai (1760–1849).',
      'Đây là tranh khắc gỗ, được làm vào khoảng năm 1830–32.',
      'Tranh thuộc loạt Thirty-six Views of Mount Fuji (Ba mươi sáu cảnh núi Phú Sĩ), và núi Phú Sĩ hiện lên nhỏ bé bên trong con sóng.',
      'Tranh dùng màu xanh chàm và xanh Phổ (Prussian blue), và được cho là đã truyền cảm hứng cho bản nhạc La Mer của Debussy và tác phẩm Der Berg của Rilke.',
    ])
    expect(wave?.commentary.takeaway).toBe(
      'Trước một con sóng lớn, hãy cúi thấp, đi cùng nhau, và nhớ rằng phía xa vẫn có một điểm tựa vững chãi.',
    )
  })

  it('keeps the existing lesson (and its seriesId/order) untouched', () => {
    const lesson = catalog.lessons.find((l) => l.id === 'voa-l01-welcome')
    expect(lesson).toBeDefined()
    expect(lesson?.seriesId).toBe('nature')
    expect(lesson?.order).toBe(1)
  })
})
