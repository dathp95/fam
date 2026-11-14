/** Grouping and ordering of built-in lessons for the Home screen. */

import type { StaticLesson } from './types.ts'

export interface LessonGroup {
  /** Stable key: the seriesId, or "other" for lessons without a series. */
  key: string
  /** seriesId, or null for the "Khác" group. */
  seriesId: string | null
  lessons: StaticLesson[]
}

export const OTHER_GROUP_KEY = 'other'

/**
 * Group by seriesId (groups in order of first appearance), with lessons that have no series
 * in a final "other" group. Inside a group, sort by `order` (missing order goes last),
 * keeping the catalog order for ties.
 */
export function groupStaticLessons(lessons: StaticLesson[]): LessonGroup[] {
  const bySeries = new Map<string, StaticLesson[]>()
  const other: StaticLesson[] = []
  for (const l of lessons) {
    if (l.seriesId === undefined) {
      other.push(l)
    } else {
      const list = bySeries.get(l.seriesId) ?? []
      list.push(l)
      bySeries.set(l.seriesId, list)
    }
  }
  const sorted = (list: StaticLesson[]) =>
    list.toSorted((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
  const groups: LessonGroup[] = [...bySeries].map(([seriesId, list]) => ({
    key: seriesId,
    seriesId,
    lessons: sorted(list),
  }))
  if (other.length) groups.push({ key: OTHER_GROUP_KEY, seriesId: null, lessons: sorted(other) })
  return groups
}
