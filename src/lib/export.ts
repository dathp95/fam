/** Build a StaticLesson (for public/lessons/index.json) from the review screen, and download it. */

import { parseStaticLesson, type ParseResult } from './catalog.ts'
import { DEFAULT_LESSON_SOURCE } from './sources.ts'
import { LEVELS, type StaticLesson, type TimedSentence } from './types.ts'

export interface PublishInput {
  title: string
  langId: string
  createdAt: number
  duration: number
  sentences: TimedSentence[]
  level: string
  topic: string
  /** Name of the chosen audio file; the lesson id and audioUrl are derived from it. */
  fileName: string
  /** Lessons of the loaded catalog, used to pick the order (may be empty). */
  existing: StaticLesson[]
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** "lessons/voa/L01 Welcome.mp3" -> "l01-welcome". */
export function slugFromPath(path: string): string {
  const file = path.split(/[/\\]/).pop() ?? ''
  return file
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Where the exported lesson's audio goes, relative to public/. */
export const audioUrlFor = (id: string) => `lessons/voa/${id}.mp3`

/**
 * Order of an exported lesson: the order of the catalog lesson with the same id if it has one,
 * otherwise (highest order among lessons with the same level and topic) + 1, or 1 when none.
 */
export function nextOrder(existing: StaticLesson[], id: string, level: string, topic: string): number {
  const same = existing.find((l) => l.id === id)
  if (same?.order !== undefined) return same.order
  const orders = existing.filter((l) => l.level === level && l.topic === topic).map((l) => l.order ?? 0)
  return Math.max(0, ...orders) + 1
}

/** Validate the export form and return a StaticLesson, or a Vietnamese error message. */
export function buildStaticLesson(input: PublishInput): ParseResult<StaticLesson> {
  const id = slugFromPath(input.fileName)
  if (!id) return fail('Không tạo được mã bài (id) từ tên file. Hãy đổi tên file audio (dùng chữ và số) rồi tải lại.')

  const title = input.title.trim()
  if (!title) return fail('Hãy nhập tên bài.')

  const level = LEVELS.find((l) => l === input.level)
  if (!level) return fail(`Hãy chọn trình độ (${LEVELS.join(' hoặc ')}).`)

  const topic = input.topic.trim()
  if (!topic) return fail('Hãy nhập chủ đề.')

  const result = parseStaticLesson({
    id,
    kind: 'static',
    title,
    langId: input.langId,
    createdAt: input.createdAt,
    audioUrl: audioUrlFor(id),
    duration: input.duration,
    sentences: input.sentences,
    level,
    topic,
    source: DEFAULT_LESSON_SOURCE,
    order: nextOrder(input.existing, id, level, topic),
  })
  return result.ok ? result : fail(`Dữ liệu chưa hợp lệ: ${result.error}`)
}

/** Download JSON through a temporary <a download> link. The audio file is never included. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
