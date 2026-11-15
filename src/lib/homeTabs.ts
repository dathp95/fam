/** The three tabs of the Home screen, and which lesson "Đang học" shows. */

import { groupStaticLessons } from './lessonGroups.ts'
import type { StaticLesson } from './types.ts'

export type HomeTab = 'learning' | 'lessons' | 'album'

export const HOME_TABS: readonly { id: HomeTab; label: string }[] = [
  { id: 'learning', label: 'Đang học' },
  { id: 'lessons', label: 'Bài tập' },
  { id: 'album', label: 'Albums' },
]

/** Lessons in the order Home lists them: by level, then `order`. */
export function orderedLessons(lessons: StaticLesson[]): StaticLesson[] {
  return groupStaticLessons(lessons).flatMap((level) => level.lessons)
}

/**
 * The lesson to continue: the first one (in list order) the learner has not passed yet; when all are
 * passed, the last one. Undefined when there are no lessons.
 */
export function currentLesson(lessons: StaticLesson[], isDone: (lessonId: string) => boolean): StaticLesson | undefined {
  const list = orderedLessons(lessons)
  return list.find((l) => !isDone(l.id)) ?? list.at(-1)
}

/** Next/previous tab for ← / → on the tab bar, wrapping around. */
export function stepTab(current: HomeTab, delta: 1 | -1): HomeTab {
  const i = HOME_TABS.findIndex((t) => t.id === current)
  return HOME_TABS[(i + delta + HOME_TABS.length) % HOME_TABS.length].id
}
