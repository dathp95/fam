/** Grouping and ordering of built-in lessons for the Home screen: level, then order. */

import { LEVELS, type Level, type StaticLesson } from './types.ts'

export interface LevelGroup {
  level: Level
  lessons: StaticLesson[]
}

/**
 * Group by level (in the order of LEVELS; levels without lessons are left out), then sort the
 * lessons of a level by `order` (missing order goes last, ties keep the catalog order).
 * Does not mutate its input. A legacy `topic` or `seriesId` on a lesson plays no part.
 */
export function groupStaticLessons(lessons: StaticLesson[]): LevelGroup[] {
  const groups: LevelGroup[] = []
  for (const level of LEVELS) {
    const inLevel = lessons.filter((l) => l.level === level)
    if (inLevel.length === 0) continue
    groups.push({ level, lessons: inLevel.toSorted((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)) })
  }
  return groups
}
