/** Catalog of built-in lessons (public/lessons/index.json): loading and runtime validation. */

import { LEVELS, type Series, type StaticLesson, type TimedSentence } from './types.ts'

export interface Catalog {
  lessons: StaticLesson[]
  series: Series[]
  /** Human-readable notes about entries that were skipped. */
  warnings: string[]
}

export interface LoadedCatalog extends Catalog {
  /** Set when the file could not be loaded at all (network or JSON error). */
  error: string | null
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

const SUPPORTED_VERSION = 1
const TIME_TOLERANCE = 0.01

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Non-empty trimmed string, else null. */
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Join BASE_URL and a catalog-relative path ("lessons/voa/l01.mp3"). */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  const root = base.endsWith('/') ? base : base + '/'
  return root + path.replace(/^(?:\.?\/)+/, '')
}

function parseSentences(raw: unknown, lessonId: string, duration: number): ParseResult<TimedSentence[]> {
  if (!Array.isArray(raw) || raw.length === 0) return fail('thiếu danh sách câu (sentences).')
  const seen = new Set<string>()
  const out: TimedSentence[] = []
  for (let i = 0; i < raw.length; i++) {
    const s: unknown = raw[i]
    const n = i + 1
    if (!isRecord(s)) return fail(`câu ${n} sai định dạng.`)
    const body = text(s.text)
    if (!body) return fail(`câu ${n} chưa có chữ (text).`)
    if (!finite(s.start) || !finite(s.end)) return fail(`câu ${n} thiếu start/end dạng số.`)
    if (s.start < 0 || s.end <= s.start || s.end > duration + TIME_TOLERANCE) {
      return fail(`câu ${n} có thời gian không hợp lệ (cần 0 ≤ start < end ≤ duration).`)
    }
    const id = text(s.id) ?? `${lessonId}-${n}`
    if (seen.has(id)) return fail(`câu ${n} trùng id "${id}".`)
    seen.add(id)
    out.push({ id, text: body, start: s.start, end: s.end })
  }
  return { ok: true, value: out }
}

/** Validate one lesson from JSON. Optional fields get defaults (langId "en", createdAt 0). */
export function parseStaticLesson(raw: unknown): ParseResult<StaticLesson> {
  if (!isRecord(raw)) return fail('không phải một đối tượng.')
  if (raw.kind !== 'static') return fail('kind phải là "static".')
  const id = text(raw.id)
  if (!id) return fail('thiếu id.')
  const title = text(raw.title)
  if (!title) return fail('thiếu title.')
  const audioUrl = text(raw.audioUrl)
  if (!audioUrl) return fail('thiếu audioUrl.')
  if (!finite(raw.duration) || raw.duration <= 0) return fail('duration phải là số dương (giây).')
  const level = LEVELS.find((l) => l === raw.level)
  if (!level) return fail(`level phải là ${LEVELS.join(' hoặc ')}.`)
  const topic = text(raw.topic)
  if (!topic) return fail('thiếu topic.')
  if (!isRecord(raw.source)) return fail('thiếu source.')
  const name = text(raw.source.name)
  const url = text(raw.source.url)
  const license = text(raw.source.license)
  if (!name || !url || !license) return fail('source cần đủ name, url và license.')

  let seriesId: string | undefined
  if (raw.seriesId !== undefined) {
    seriesId = text(raw.seriesId) ?? undefined
    if (!seriesId) return fail('seriesId phải là chuỗi không rỗng.')
  }
  let order: number | undefined
  if (raw.order !== undefined) {
    if (!finite(raw.order) || !Number.isInteger(raw.order) || raw.order < 1) {
      return fail('order phải là số nguyên từ 1 trở lên.')
    }
    order = raw.order
  }

  const sentences = parseSentences(raw.sentences, id, raw.duration)
  if (!sentences.ok) return sentences

  return {
    ok: true,
    value: {
      id,
      kind: 'static',
      title,
      langId: text(raw.langId) ?? 'en',
      createdAt: finite(raw.createdAt) ? raw.createdAt : 0,
      audioUrl,
      duration: raw.duration,
      sentences: sentences.value,
      level,
      topic,
      source: { name, url, license },
      ...(seriesId !== undefined && { seriesId }),
      ...(order !== undefined && { order }),
    },
  }
}

const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** True when `order` holds each of 0..n-1 exactly once. */
function isPermutation(order: unknown, n: number): order is number[] {
  if (!Array.isArray(order) || order.length !== n) return false
  const seen = new Set<number>()
  for (const v of order as unknown[]) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) return false
    seen.add(v)
  }
  return true
}

/** Validate one picture series from JSON (grid, reveal order, lessons, intro, image). */
export function parseSeries(raw: unknown): ParseResult<Series> {
  if (!isRecord(raw)) return fail('không phải một đối tượng.')
  const id = text(raw.id)
  if (!id) return fail('thiếu id.')
  const title = text(raw.title)
  if (!title) return fail('thiếu title.')
  const level = LEVELS.find((l) => l === raw.level)
  if (!level) return fail(`level phải là ${LEVELS.join(' hoặc ')}.`)

  if (!isRecord(raw.image)) return fail('thiếu image.')
  const { src: rawSrc, alt: rawAlt, width, height, credit } = raw.image
  const src = text(rawSrc)
  const alt = text(rawAlt)
  if (!src) return fail('image.src bị thiếu.')
  if (!alt) return fail('image.alt bị thiếu.')
  if (!positiveInt(width) || !positiveInt(height)) return fail('image.width và image.height phải là số nguyên dương.')
  if (!isRecord(credit)) return fail('thiếu image.credit.')
  const creditText = text(credit.text)
  const creditUrl = text(credit.url)
  if (!creditText || !creditUrl) return fail('image.credit cần đủ text và url.')

  if (!isRecord(raw.grid) || !positiveInt(raw.grid.cols) || !positiveInt(raw.grid.rows)) {
    return fail('grid cần cols và rows là số nguyên dương.')
  }
  const { cols, rows } = raw.grid
  const lessonIds = Array.isArray(raw.lessonIds) ? (raw.lessonIds as unknown[]).map(text) : null
  if (!lessonIds || lessonIds.some((x) => x === null)) return fail('lessonIds phải là danh sách id không rỗng.')
  const ids = lessonIds as string[]
  if (new Set(ids).size !== ids.length) return fail('lessonIds có id bị lặp.')
  if (cols * rows !== ids.length) {
    return fail(`lưới ${cols}×${rows} cần ${cols * rows} bài nhưng lessonIds có ${ids.length}.`)
  }
  if (!isPermutation(raw.revealOrder, ids.length)) {
    return fail(`revealOrder phải là hoán vị của 0..${ids.length - 1}.`)
  }
  const intro = Array.isArray(raw.intro) ? (raw.intro as unknown[]).map(text) : null
  if (!intro || intro.length === 0 || intro.some((x) => x === null)) {
    return fail('intro phải có ít nhất một câu không rỗng.')
  }

  return {
    ok: true,
    value: {
      id,
      title,
      level,
      image: { src, width, height, alt, credit: { text: creditText, url: creditUrl } },
      grid: { cols, rows },
      revealOrder: raw.revealOrder,
      lessonIds: ids,
      intro: intro as string[],
    },
  }
}

/** Validate the series list; invalid or duplicate series are skipped and listed in warnings. */
function parseSeriesList(raw: unknown, warnings: string[]): Series[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('"series" phải là một mảng.')
    return []
  }
  const out: Series[] = []
  const ids = new Set<string>()
  raw.forEach((item: unknown, i: number) => {
    const label = `Chuỗi #${i + 1}${isRecord(item) && text(item.id) ? ` (${text(item.id)})` : ''}`
    const parsed = parseSeries(item)
    if (!parsed.ok) {
      warnings.push(`${label}: ${parsed.error}`)
    } else if (ids.has(parsed.value.id)) {
      warnings.push(`${label}: trùng id, đã bỏ qua.`)
    } else {
      ids.add(parsed.value.id)
      out.push(parsed.value)
    }
  })
  return out
}

/** Validate the whole catalog; invalid or duplicate lessons/series are skipped and listed in warnings. */
export function parseCatalog(raw: unknown): Catalog {
  if (!isRecord(raw)) return { lessons: [], series: [], warnings: ['Danh mục bài không đúng định dạng.'] }
  if (raw.version !== SUPPORTED_VERSION) {
    return {
      lessons: [],
      series: [],
      warnings: [`Phiên bản danh mục không được hỗ trợ (cần version ${SUPPORTED_VERSION}).`],
    }
  }
  const warnings: string[] = []
  if (!Array.isArray(raw.lessons)) {
    return { lessons: [], series: [], warnings: ['Danh mục thiếu mảng "lessons".'] }
  }
  const lessons: StaticLesson[] = []
  const ids = new Set<string>()
  raw.lessons.forEach((item: unknown, i: number) => {
    const label = `Bài #${i + 1}${isRecord(item) && text(item.id) ? ` (${text(item.id)})` : ''}`
    const parsed = parseStaticLesson(item)
    if (!parsed.ok) {
      warnings.push(`${label}: ${parsed.error}`)
    } else if (ids.has(parsed.value.id)) {
      warnings.push(`${label}: trùng id, đã bỏ qua.`)
    } else {
      ids.add(parsed.value.id)
      lessons.push(parsed.value)
    }
  })
  const series = parseSeriesList(raw.series, warnings)
  return { lessons, series, warnings }
}

const LOAD_ERROR = 'Không tải được danh sách bài có sẵn. Bạn vẫn có thể dùng bài mẫu hoặc tải file của bạn.'

/** Fetch and validate the catalog. Never throws: failures give an empty catalog and a message. */
export async function loadCatalog(): Promise<LoadedCatalog> {
  try {
    const res = await fetch(assetUrl('lessons/index.json'))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw: unknown = await res.json()
    return { ...parseCatalog(raw), error: null }
  } catch {
    return { lessons: [], series: [], warnings: [], error: LOAD_ERROR }
  }
}
