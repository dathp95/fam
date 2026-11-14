import { describe, expect, it } from 'vitest'
import { stepIndex, swipeDirection } from './album.ts'

describe('stepIndex', () => {
  it('moves one picture at a time', () => {
    expect(stepIndex(1, 1, 4)).toBe(2)
    expect(stepIndex(2, -1, 4)).toBe(1)
  })

  it('stops at both ends instead of wrapping around', () => {
    expect(stepIndex(0, -1, 4)).toBe(0)
    expect(stepIndex(3, 1, 4)).toBe(3)
    expect(stepIndex(0, -5, 4)).toBe(0)
    expect(stepIndex(2, 9, 4)).toBe(3)
  })

  it('handles a single picture and an empty album', () => {
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, -1, 1)).toBe(0)
    expect(stepIndex(0, 1, 0)).toBe(0)
  })
})

describe('swipeDirection', () => {
  it('swipe left = next, swipe right = previous', () => {
    expect(swipeDirection(-120, 5)).toBe(1)
    expect(swipeDirection(120, -5)).toBe(-1)
  })

  it('ignores short movements (taps)', () => {
    expect(swipeDirection(-59, 0)).toBe(0)
    expect(swipeDirection(30, 2)).toBe(0)
    expect(swipeDirection(0, 0)).toBe(0)
  })

  it('ignores mostly vertical movements (page scroll)', () => {
    expect(swipeDirection(-80, 200)).toBe(0)
    expect(swipeDirection(70, -60)).toBe(0) // diagonal, not clearly horizontal
  })

  it('accepts exactly the minimum when clearly horizontal', () => {
    expect(swipeDirection(-60, 0)).toBe(1)
    expect(swipeDirection(60, 40)).toBe(-1) // 60 >= 40 * 1.5
  })
})
