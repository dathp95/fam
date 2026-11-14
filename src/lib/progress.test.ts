import { describe, expect, it } from 'vitest'
import { levelOf, recordAnswer, xpIntoLevel, type Progress } from './progress.ts'

describe('levelOf / xpIntoLevel', () => {
  it('starts at level 1 and rises every 100 XP', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(99)).toBe(1)
    expect(levelOf(100)).toBe(2)
    expect(levelOf(250)).toBe(3)
  })

  it('returns XP inside the current level', () => {
    expect(xpIntoLevel(0)).toBe(0)
    expect(xpIntoLevel(99)).toBe(99)
    expect(xpIntoLevel(100)).toBe(0)
    expect(xpIntoLevel(250)).toBe(50)
  })
})

describe('recordAnswer', () => {
  // Local-time constructors so the date matches toLocaleDateString in any timezone.
  const day = (d: number) => new Date(2026, 5, d, 12, 0, 0)
  const base: Progress = { xp: 20, streak: 3, last: '2026-06-10', sentences: 4 }

  it('starts a streak at 1 for a first answer', () => {
    const p = recordAnswer({ xp: 0, streak: 0, last: '', sentences: 0 }, 7, day(10))
    expect(p).toEqual({ xp: 7, streak: 1, last: '2026-06-10', sentences: 1 })
  })

  it('keeps the streak on the same day', () => {
    const p = recordAnswer(base, 10, day(10))
    expect(p.streak).toBe(3)
    expect(p.xp).toBe(30)
    expect(p.sentences).toBe(5)
  })

  it('adds 1 when the last day was yesterday', () => {
    const p = recordAnswer(base, 10, day(11))
    expect(p.streak).toBe(4)
    expect(p.last).toBe('2026-06-11')
  })

  it('resets to 1 after a skipped day', () => {
    expect(recordAnswer(base, 10, day(12)).streak).toBe(1)
  })

  it('does not mutate the input', () => {
    const copy = { ...base }
    recordAnswer(base, 10, day(11))
    expect(base).toEqual(copy)
  })
})
