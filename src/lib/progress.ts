/** XP, level and streak, persisted in localStorage. */

export interface Progress {
  xp: number
  streak: number
  /** Last practice day, YYYY-MM-DD (local time). */
  last: string
  sentences: number
}

const KEY = 'fam.prog'
export const XP_PER_LEVEL = 100

const EMPTY: Progress = { xp: 0, streak: 0, last: '', sentences: 0 }

const dayString = (d: Date) => d.toLocaleDateString('en-CA')

export function loadProgress(): Progress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const p = raw as Partial<Progress>
      return {
        xp: Number(p.xp) || 0,
        streak: Number(p.streak) || 0,
        last: typeof p.last === 'string' ? p.last : '',
        sentences: Number(p.sentences) || 0,
      }
    }
  } catch {
    /* corrupted or unavailable storage: start fresh */
  }
  return { ...EMPTY }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage may be full or disabled */
  }
}

export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1
export const xpIntoLevel = (xp: number) => xp % XP_PER_LEVEL

/** Returns the updated progress after answering one sentence. Pure. */
export function recordAnswer(p: Progress, xp: number, now = new Date()): Progress {
  const today = dayString(now)
  let streak = p.streak
  if (p.last !== today) {
    const yesterday = dayString(new Date(now.getTime() - 864e5))
    streak = p.last === yesterday ? p.streak + 1 : 1
  }
  return { xp: p.xp + xp, streak, last: today, sentences: p.sentences + 1 }
}
