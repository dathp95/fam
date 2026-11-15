/** Admin only: turn a catalog lesson into a Draft for the Review screen. */

import type { Draft, StaticLesson } from './types.ts'

/**
 * The file name is `<id>.mp3`, so the export derives the same lesson id (and keeps its `order`),
 * and the level is preselected in the "Phân loại" select.
 */
export function draftFromStaticLesson(lesson: StaticLesson, media: Blob): Draft {
  return {
    id: lesson.id,
    title: lesson.title,
    langId: lesson.langId,
    createdAt: lesson.createdAt,
    media,
    duration: lesson.duration,
    sentences: lesson.sentences,
    timing: 'saved',
    fileName: `${lesson.id}.mp3`,
    level: lesson.level,
  }
}
