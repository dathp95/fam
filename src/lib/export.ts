/** Build a StaticLesson (for public/lessons/index.json) from the review screen, and download it. */

import { parseStaticLesson, type ParseResult } from './catalog.ts'
import { LEVELS, type StaticLesson, type TimedSentence } from './types.ts'

export interface PublishInput {
  /** Optional; derived from audioUrl when blank. */
  id: string
  title: string
  langId: string
  createdAt: number
  duration: number
  sentences: TimedSentence[]
  level: string
  topic: string
  source: { name: string; url: string; license: string }
  /** Blank = no series. */
  seriesId: string
  /** Blank = no order; otherwise an integer ≥ 1 as typed. */
  order: string
  /** Path relative to BASE_URL, e.g. "lessons/voa/l01.mp3". */
  audioUrl: string
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** "lessons/voa/L01 Welcome.mp3" -> "l01-welcome". */
export function slugFromPath(path: string): string {
  const file = path.split('/').pop() ?? ''
  return file
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Validate the publish form and return a StaticLesson, or a Vietnamese error message. */
export function buildStaticLesson(input: PublishInput): ParseResult<StaticLesson> {
  const rawAudio = input.audioUrl.trim().replaceAll('\\', '/')
  if (!rawAudio) return fail('Hãy nhập đường dẫn audio, ví dụ lessons/voa/l01.mp3.')
  // Reject full URLs ("https:", "data:", "//host") before leading slashes are stripped below.
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(rawAudio)) {
    return fail('Đường dẫn audio phải là đường dẫn tương đối trong thư mục public, ví dụ lessons/voa/l01.mp3.')
  }
  const audioUrl = rawAudio.replace(/^(?:\.?\/)+/, '')
  if (!audioUrl) return fail('Hãy nhập đường dẫn audio, ví dụ lessons/voa/l01.mp3.')

  const id = input.id.trim() || slugFromPath(audioUrl)
  if (!id) return fail('Không tạo được mã bài (id). Hãy nhập id hoặc đường dẫn audio hợp lệ.')

  const title = input.title.trim()
  if (!title) return fail('Hãy nhập tên bài.')

  const level = LEVELS.find((l) => l === input.level)
  if (!level) return fail(`Hãy chọn trình độ (${LEVELS.join(' hoặc ')}).`)

  const topic = input.topic.trim()
  if (!topic) return fail('Hãy nhập chủ đề.')

  const name = input.source.name.trim()
  const url = input.source.url.trim()
  const license = input.source.license.trim()
  if (!name || !url || !license) return fail('Hãy nhập đủ thông tin nguồn: tên nguồn, đường dẫn và giấy phép.')
  if (!/^https?:\/\//i.test(url)) return fail('Đường dẫn nguồn phải bắt đầu bằng http:// hoặc https://.')

  const seriesId = input.seriesId.trim()
  const orderText = input.order.trim()
  let order: number | undefined
  if (orderText) {
    order = Number(orderText)
    if (!Number.isInteger(order) || order < 1) return fail('Thứ tự (order) phải là số nguyên từ 1 trở lên.')
  }

  const result = parseStaticLesson({
    id,
    kind: 'static',
    title,
    langId: input.langId,
    createdAt: input.createdAt,
    audioUrl,
    duration: input.duration,
    sentences: input.sentences,
    level,
    topic,
    source: { name, url, license },
    ...(seriesId && { seriesId }),
    ...(order !== undefined && { order }),
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
