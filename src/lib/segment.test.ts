import { describe, expect, it } from 'vitest'
import { alignSentences, mergeSentences, splitSentenceAt, splitSentences } from './segment.ts'
import type { TimedSentence } from './types.ts'

const words = (s: string) => s.split(' ').length

describe('splitSentences', () => {
  it('splits on . ! ? and keeps the punctuation', () => {
    expect(splitSentences('Hello there. How are you? I am fine!')).toEqual([
      'Hello there.',
      'How are you?',
      'I am fine!',
    ])
  })

  it('collapses whitespace and keeps a trailing fragment', () => {
    expect(splitSentences('  One   two.\n\nThree four  ')).toEqual(['One two.', 'Three four'])
  })

  it('returns [] for empty or blank input', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n ')).toEqual([])
  })

  it('splits sentences over 16 words at commas into chunks of at least 6 words', () => {
    const long =
      'When the morning sun finally rose over the quiet hills, the farmers walked slowly to the fields, and the children ran to school.'
    expect(words(long)).toBeGreaterThan(16)
    const parts = splitSentences(long)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(words(p)).toBeGreaterThanOrEqual(6)
    expect(parts.join(' ')).toBe(long)
  })

  it('keeps a long sentence without commas whole', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.'
    expect(splitSentences(long)).toEqual([long])
  })
})

describe('alignSentences', () => {
  const texts = ['First sentence here.', 'Second one.', 'A third, rather longer sentence.', 'End.']

  function expectValid(out: TimedSentence[], duration: number) {
    let prevStart = -1
    for (const s of out) {
      expect(s.start).toBeGreaterThanOrEqual(0)
      expect(s.end).toBeLessThanOrEqual(duration)
      expect(s.start).toBeGreaterThan(prevStart)
      prevStart = s.start
    }
    expect(out[0].start).toBe(0)
    expect(out[out.length - 1].end).toBe(duration)
  }

  it('is increasing and within [0, duration] without silences', () => {
    expectValid(alignSentences(texts, 20, []), 20)
  })

  it('is increasing and within [0, duration] with silences', () => {
    expectValid(alignSentences(texts, 20, [3.1, 6, 12.5, 15]), 20)
  })

  it('snaps to a nearby silence', () => {
    const plain = alignSentences(texts, 20, [])
    const snapped = alignSentences(texts, 20, [plain[1].start + 0.7])
    expect(snapped[1].start).toBeCloseTo(plain[1].start + 0.7, 1)
  })

  it('gives every sentence at least 0.4 s on a short file', () => {
    const many = Array.from({ length: 8 }, (_, i) => `Sentence number ${i}.`)
    const duration = 3.6 // >= 8 * 0.4
    const out = alignSentences(many, duration, [0.1, 0.2, 3.5])
    expectValid(out, duration)
    for (let k = 0; k < out.length; k++) {
      const next = k + 1 < out.length ? out[k + 1].start : duration
      expect(next - out[k].start).toBeGreaterThanOrEqual(0.4 - 0.011)
    }
  })

  it('splits evenly when the file is shorter than n * 0.4 s', () => {
    const many = Array.from({ length: 10 }, (_, i) => `Sentence ${i}.`)
    const out = alignSentences(many, 2, [])
    expectValid(out, 2)
    expect(out[1].start).toBeCloseTo(0.2, 2)
  })

  it('handles a single sentence', () => {
    const out = alignSentences(['Only one.'], 5, [])
    expect(out).toHaveLength(1)
    expect(out[0].start).toBe(0)
    expect(out[0].end).toBe(5)
  })

  it('returns [] for no sentences', () => {
    expect(alignSentences([], 5, [])).toEqual([])
  })
})

const sent = (text: string, start: number, end: number, id = 'a'): TimedSentence => ({ id, text, start, end })

describe('mergeSentences', () => {
  it('joins text and covers both ranges, keeping the first id', () => {
    const m = mergeSentences(sent(' Hello. ', 1, 2, 'a'), sent('World.', 2.5, 4, 'b'))
    expect(m).toEqual({ id: 'a', text: 'Hello. World.', start: 1, end: 4 })
  })
})

describe('splitSentenceAt', () => {
  const s = sent('one two three four', 0, 8)

  it('splits at the caret and divides time proportionally', () => {
    const parts = splitSentenceAt(s, 7)! // after "one two"
    expect(parts.map((p) => p.text)).toEqual(['one two', 'three four'])
    expect(parts[0].start).toBe(0)
    expect(parts[0].end).toBe(parts[1].start)
    expect(parts[1].end).toBe(8)
    expect(parts[0].end).toBeGreaterThan(0)
    expect(parts[0].end).toBeLessThan(8)
    expect(parts[0].id).toBe('a')
    expect(parts[1].id).not.toBe('a')
  })

  it('snaps a caret inside a word to the nearest word boundary', () => {
    // "t|wo": closer to the start of "two"
    expect(splitSentenceAt(s, 5)!.map((p) => p.text)).toEqual(['one', 'two three four'])
    // "tw|o": closer to the end of "two"
    expect(splitSentenceAt(s, 6)!.map((p) => p.text)).toEqual(['one two', 'three four'])
  })

  it('splits near the middle when the caret is at an edge', () => {
    for (const pos of [0, s.text.length]) {
      const parts = splitSentenceAt(s, pos)!
      expect(parts.map((p) => p.text)).toEqual(['one two', 'three four'])
    }
  })

  it('returns null for a single word', () => {
    expect(splitSentenceAt(sent('Hello', 0, 2), 2)).toBeNull()
  })
})
