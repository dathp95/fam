import { describe, expect, it } from 'vitest'
import { diffWords, maskHint, scoreAnswer } from './diff.ts'

const w = (s: string) => s.split(' ')

describe('scoreAnswer', () => {
  it('gives 100 and 10 + 5 bonus XP for a perfect answer', () => {
    const r = scoreAnswer(w('i wake up'), w('i wake up'), 0)
    expect(r.score).toBe(100)
    expect(r.xp).toBe(15)
    expect(r.ops.every(([k]) => k === 'ok')).toBe(true)
  })

  it('marks missing words', () => {
    const r = scoreAnswer(w('i wake up early'), w('i wake up'), 0)
    expect(r.score).toBe(75)
    expect(r.ops.filter(([k]) => k === 'miss')).toEqual([['miss', 'early']])
  })

  it('marks extra words', () => {
    const r = scoreAnswer(w('i wake up'), w('i wake up now'), 0)
    expect(r.score).toBe(75)
    expect(r.ops.filter(([k]) => k === 'extra')).toEqual([['extra', 'now']])
  })

  it('penalizes wrong order', () => {
    const r = scoreAnswer(w('a b c'), w('c b a'), 0)
    expect(r.score).toBe(33)
    expect(r.ops.some(([k]) => k === 'miss')).toBe(true)
    expect(r.ops.some(([k]) => k === 'extra')).toBe(true)
  })

  it('subtracts 10 per hint and removes the perfect bonus', () => {
    const r = scoreAnswer(w('i wake up'), w('i wake up'), 2)
    expect(r.score).toBe(80)
    expect(r.xp).toBe(8)
  })

  it('never goes below 0', () => {
    expect(scoreAnswer(w('a b'), w('c d'), 5).score).toBe(0)
    expect(scoreAnswer(w('a b'), w('a b'), 20).score).toBe(0)
  })

  it('handles an empty reference without dividing by zero', () => {
    const r = scoreAnswer([], w('hello'), 0)
    expect(Number.isFinite(r.score)).toBe(true)
    expect(r.score).toBe(0)
    expect(scoreAnswer([], [], 0).score).toBe(0)
  })
})

describe('diffWords', () => {
  it('reports the LCS length', () => {
    expect(diffWords(w('a b c d'), w('a c d e')).lcs).toBe(3)
  })
})

describe('maskHint', () => {
  it('reveals the first N words and masks the rest', () => {
    expect(maskHint(w('hello big world'), 1)).toBe('hello  b__  w____')
  })

  it('masks a one-letter word with at least one underscore', () => {
    expect(maskHint(w('i go'), 0)).toBe('i_  g_')
  })

  it('reveals everything when N covers all words', () => {
    expect(maskHint(w('hi there'), 2)).toBe('hi  there')
  })
})
