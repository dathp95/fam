/** Grouping and ordering of built-in lessons for the Home screen: level, then topic, then order. */

import { LEVELS, type Level, type StaticLesson } from './types.ts'

export interface TopicGroup {
  topic: string
  lessons: StaticLesson[]
}

export interface LevelGroup {
  level: Level
  topics: TopicGroup[]
}

/**
 * Group by level (in the order of LEVELS; levels without lessons are left out), then by topic
 * inside a level (topics in order of first appearance in the list), then sort the lessons of a
 * topic by `order` (missing order goes last, ties keep the catalog order). Does not mutate input.
 */
export function groupStaticLessons(lessons: StaticLesson[]): LevelGroup[] {
  const groups: LevelGroup[] = []
  for (const level of LEVELS) {
    const topics = new Map<string, StaticLesson[]>()
    for (const l of lessons) {
      if (l.level !== level) continue
      const list = topics.get(l.topic) ?? []
      list.push(l)
      topics.set(l.topic, list)
    }
    if (topics.size === 0) continue
    groups.push({
      level,
      topics: [...topics].map(([topic, list]) => ({
        topic,
        lessons: list.toSorted((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)),
      })),
    })
  }
  return groups
}

/** Distinct topics of the lessons, in order of first appearance (for the admin form's suggestions). */
export function topicsOf(lessons: StaticLesson[]): string[] {
  return [...new Set(lessons.map((l) => l.topic))]
}
