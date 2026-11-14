import { describe, expect, it } from 'vitest'
import {
  ALL_TILES,
  bonusLessonId,
  bonusPictureId,
  buildBonusLesson,
  contentIssues,
  isBonusLesson,
  isPermutation,
  isPictureComplete,
  PICTURE_COLS,
  PICTURE_ROWS,
  PICTURE_TILES,
  randomIndex,
  revealedTiles,
  shuffle,
} from './pictures.ts'
import type { Picture } from './types.ts'

/** Deterministic "random" source that cycles through the given values. */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

const COMMENTARY = { story: 'Cảnh một.', view: 'Cách nhìn.', takeaway: 'Điều rút ra.' }

/** Fixture (test data only). */
const picture = (over: Partial<Picture> = {}): Picture => ({
  id: 'met-1',
  title: 'Test picture',
  image: { src: 'pictures/met-1.webp', width: 1600, height: 1000, alt: 'Ảnh thử', credit: { text: 'Credit', url: 'https://example.com' } },
  description: ['Câu một.', 'Câu hai.', 'Câu ba.'],
  commentary: COMMENTARY,
  intro: ['This is a test.', 'It is blue.', 'I like it.'],
  ...over,
})

describe('grid constants', () => {
  it('is a fixed 3 × 2 grid of 6 tiles', () => {
    expect(PICTURE_COLS).toBe(3)
    expect(PICTURE_ROWS).toBe(2)
    expect(PICTURE_TILES).toBe(6)
  })
})

describe('randomIndex', () => {
  it('maps [0, 1) to 0..length-1', () => {
    expect(randomIndex(4, () => 0)).toBe(0)
    expect(randomIndex(4, () => 0.5)).toBe(2)
    expect(randomIndex(4, () => 0.999)).toBe(3)
  })

  it('never goes out of range even if random() returns 1', () => {
    expect(randomIndex(4, () => 1)).toBe(3)
  })
})

describe('shuffle', () => {
  it('returns a permutation of 0..n-1', () => {
    for (const r of [seq(0), seq(0.999), seq(0.1, 0.9, 0.4, 0.7, 0.2), Math.random]) {
      const out = shuffle(PICTURE_TILES, r)
      expect(isPermutation(out, PICTURE_TILES)).toBe(true)
    }
  })

  it('is deterministic for a given random source', () => {
    expect(shuffle(6, seq(0))).toEqual([1, 2, 3, 4, 5, 0])
    expect(shuffle(6, seq(0.999))).toEqual([0, 1, 2, 3, 4, 5])
    expect(shuffle(6, seq(0.3, 0.8, 0.1))).toEqual(shuffle(6, seq(0.3, 0.8, 0.1)))
  })

  it('handles tiny sizes', () => {
    expect(shuffle(0, seq(0))).toEqual([])
    expect(shuffle(1, seq(0))).toEqual([0])
  })
})

describe('isPermutation', () => {
  it('accepts exactly one of each 0..n-1', () => {
    expect(isPermutation([2, 0, 1], 3)).toBe(true)
  })

  it('rejects duplicates, range errors, wrong length and wrong types', () => {
    expect(isPermutation([0, 0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1, 3], 3)).toBe(false)
    expect(isPermutation([-1, 0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1, 2, 3], 3)).toBe(false)
    expect(isPermutation([0, 1, 1.5], 3)).toBe(false)
    expect(isPermutation([0, 1, '2'], 3)).toBe(false)
    expect(isPermutation('012', 3)).toBe(false)
    expect(isPermutation(null, 3)).toBe(false)
  })
})

describe('revealedTiles / isPictureComplete', () => {
  const order = [4, 2, 5, 0, 3, 1]

  it('is empty without a picture', () => {
    expect(revealedTiles(null)).toEqual([])
    expect(isPictureComplete(null)).toBe(false)
  })

  it('returns the first `opened` entries of the order', () => {
    expect(revealedTiles({ id: 'a', opened: 0, order })).toEqual([])
    expect(revealedTiles({ id: 'a', opened: 3, order })).toEqual([4, 2, 5])
    expect(revealedTiles({ id: 'a', opened: 6, order })).toEqual(order)
  })

  it('is complete only at 6 opened tiles', () => {
    expect(isPictureComplete({ id: 'a', opened: 5, order })).toBe(false)
    expect(isPictureComplete({ id: 'a', opened: 6, order })).toBe(true)
  })
})

describe('bonus lesson', () => {
  it('builds an English TTS lesson from the intro', () => {
    const lesson = buildBonusLesson(picture())
    expect(lesson.id).toBe('bonus:met-1')
    expect(lesson.kind).toBe('tts')
    expect(lesson.langId).toBe('en')
    expect(lesson.title).toContain('Test picture')
    expect(lesson.sentences.map((s) => s.text)).toEqual(['This is a test.', 'It is blue.', 'I like it.'])
  })

  it('gives each sentence a unique id', () => {
    const ids = buildBonusLesson(picture()).sentences.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('recognizes bonus ids', () => {
    expect(isBonusLesson(bonusLessonId('met-1'))).toBe(true)
    expect(isBonusLesson('voa-l01-welcome')).toBe(false)
    expect(isBonusLesson('sample')).toBe(false)
  })
})

describe('contentIssues', () => {
  const s = (n: number, text = 'Sentence.') => Array.from({ length: n }, () => text)

  it('accepts 3 to 5 sentences with short intro lines', () => {
    for (const n of [3, 4, 5]) expect(contentIssues(picture({ description: s(n), intro: s(n) }))).toEqual([])
  })

  it('flags too few or too many sentences in either list', () => {
    expect(contentIssues(picture({ description: s(2) }))).toHaveLength(1)
    expect(contentIssues(picture({ description: s(6) }))).toHaveLength(1)
    expect(contentIssues(picture({ intro: s(2) }))).toHaveLength(1)
    expect(contentIssues(picture({ intro: s(6) }))).toHaveLength(1)
    expect(contentIssues(picture({ description: [], intro: [] }))).toHaveLength(2)
  })

  it('allows an intro sentence of exactly 10 words but not 11', () => {
    const ten = 'one two three four five six seven eight nine ten'
    expect(contentIssues(picture({ intro: [ten, ten, ten] }))).toEqual([])
    const issues = contentIssues(picture({ intro: [ten, `${ten} eleven`, ten] }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('câu intro 2')
  })

  it('does not limit the length of Vietnamese description sentences', () => {
    const long = Array.from({ length: 40 }, () => 'từ').join(' ')
    expect(contentIssues(picture({ description: [long, long, long] }))).toEqual([])
  })

  it('names the picture in each message', () => {
    expect(contentIssues(picture({ id: 'met-77', description: s(1) }))[0]).toContain('met-77')
  })
})

describe('bonusPictureId / ALL_TILES', () => {
  it('maps a bonus lesson id back to its picture id', () => {
    expect(bonusPictureId(bonusLessonId('met-39799'))).toBe('met-39799')
    expect(bonusPictureId('bonus:met-1')).toBe('met-1')
  })

  it('is null for other lessons', () => {
    expect(bonusPictureId('voa-l01-welcome')).toBeNull()
    expect(bonusPictureId('sample')).toBeNull()
    expect(bonusPictureId('')).toBeNull()
  })

  it('lists every tile index', () => {
    expect(ALL_TILES).toEqual([0, 1, 2, 3, 4, 5])
    expect(ALL_TILES).toHaveLength(PICTURE_TILES)
  })
})

describe('contentIssues: dimensions and commentary', () => {
  it('accepts a picture with a complete commentary and no dimensions', () => {
    expect(contentIssues(picture())).toEqual([])
  })

  it('flags a description sentence that states the dimensions ("Kích thước")', () => {
    const issues = contentIssues(
      picture({ description: ['Câu một.', 'Kích thước của tranh là 92,1 x 118,4 cm.', 'Câu ba.'] }),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('câu description 2')
    expect(issues[0]).toContain('kích thước')
  })

  it('also catches it in the middle of a sentence and in any letter case', () => {
    expect(contentIssues(picture({ description: ['Một.', 'Hai, kích thước 10 cm.', 'Ba.'] }))).toHaveLength(1)
    expect(contentIssues(picture({ description: ['KÍCH THƯỚC lớn.', 'Hai.', 'Ba.'] }))).toHaveLength(1)
  })

  it('reports every offending sentence', () => {
    expect(contentIssues(picture({ description: ['Kích thước A.', 'Hai.', 'Kích thước B.'] }))).toHaveLength(2)
  })

  it('does not flag the word "kích" or "thước" on its own', () => {
    expect(contentIssues(picture({ description: ['Một thước phim.', 'Kích động.', 'Ba.'] }))).toEqual([])
  })

  it('flags a missing commentary', () => {
    const issues = contentIssues({ ...picture(), commentary: undefined })
    expect(issues).toHaveLength(3)
    expect(issues.join(' ')).toContain('commentary.story')
    expect(contentIssues({ ...picture(), commentary: null })).toHaveLength(3)
  })

  it('flags each empty or blank commentary field separately', () => {
    expect(contentIssues(picture({ commentary: { ...COMMENTARY, story: '' } }))).toEqual(['met-1: thiếu commentary.story.'])
    expect(contentIssues(picture({ commentary: { ...COMMENTARY, view: '   ' } }))).toEqual(['met-1: thiếu commentary.view.'])
    expect(contentIssues(picture({ commentary: { ...COMMENTARY, takeaway: '' } }))).toEqual(['met-1: thiếu commentary.takeaway.'])
  })

  it('flags a commentary with missing keys', () => {
    expect(contentIssues({ ...picture(), commentary: { story: 'S' } })).toHaveLength(2)
  })
})
