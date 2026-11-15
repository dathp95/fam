import { describe, expect, it } from 'vitest'
import { draftFromStaticLesson } from './editStatic.ts'
import { slugFromPath } from './export.ts'
import type { StaticLesson } from './types.ts'

const lesson: StaticLesson = {
  id: 'voa-l90-a',
  kind: 'static',
  title: 'Test',
  langId: 'en',
  createdAt: 5,
  audioUrl: 'lessons/voa/voa-l90-a.mp3',
  duration: 10,
  sentences: [{ id: 's1', text: 'Hi.', start: 0, end: 2 }],
  level: 'A2',
  source: { name: 'n', url: 'https://example.com', license: 'l' },
  order: 3,
}

describe('draftFromStaticLesson', () => {
  const media = new Blob(['x'])
  const d = draftFromStaticLesson(lesson, media)

  it('copies the lesson content and keeps the level', () => {
    expect(d).toMatchObject({ id: 'voa-l90-a', title: 'Test', duration: 10, sentences: lesson.sentences, level: 'A2', timing: 'saved' })
    expect(d.media).toBe(media)
  })

  it('uses a file name that maps back to the same lesson id', () => {
    expect(slugFromPath(d.fileName ?? '')).toBe(lesson.id)
  })
})
