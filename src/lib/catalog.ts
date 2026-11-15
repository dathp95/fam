/** Catalogs of built-in lessons (public/lessons/index.json) and pictures (public/pictures/index.json): loading and runtime validation. */

import { LEVELS, type Picture, type PictureCommentary, type StaticLesson, type TimedSentence } from './types.ts'

export interface Catalog {
  lessons: StaticLesson[]
  pictures: Picture[]
  /** Human-readable notes about entries that were skipped. */
  warnings: string[]
}

export interface LoadedCatalog extends Catalog {
  /** Set when the lessons file could not be loaded at all (network or JSON error). */
  error: string | null
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Catalog files, relative to public/ (and to BASE_URL at runtime). */
export const LESSONS_INDEX = 'lessons/index.json'
export const PICTURES_INDEX = 'pictures/index.json'

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
      ...(order !== undefined && { order }),
    },
  }
}

const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** Non-empty list of non-empty strings (trimmed), else null. */
function textList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const out = (v as unknown[]).map(text)
  return out.every((s): s is string => s !== null) ? out : null
}

/** story, view and takeaway must all be non-empty strings (strict: no defaults). */
export function parseCommentary(raw: unknown): ParseResult<PictureCommentary> {
  if (!isRecord(raw)) return fail('thiếu commentary (cần story, view và takeaway).')
  const story = text(raw.story)
  if (!story) return fail('commentary.story phải là chuỗi không rỗng.')
  const view = text(raw.view)
  if (!view) return fail('commentary.view phải là chuỗi không rỗng.')
  const takeaway = text(raw.takeaway)
  if (!takeaway) return fail('commentary.takeaway phải là chuỗi không rỗng.')
  return { ok: true, value: { story, view, takeaway } }
}

/**
 * Validate one picture from JSON. Only the structure is checked here; the sentence-count and
 * word-count rules live in `contentIssues` (pictures.ts) so a long sentence never hides a picture.
 */
export function parsePicture(raw: unknown): ParseResult<Picture> {
  if (!isRecord(raw)) return fail('không phải một đối tượng.')
  const id = text(raw.id)
  if (!id) return fail('thiếu id.')
  const title = text(raw.title)
  if (!title) return fail('thiếu title.')

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

  const description = textList(raw.description)
  if (!description) return fail('description phải có ít nhất một câu không rỗng.')
  const commentary = parseCommentary(raw.commentary)
  if (!commentary.ok) return commentary
  const intro = textList(raw.intro)
  if (!intro) return fail('intro phải có ít nhất một câu không rỗng.')
  let byline: string | undefined
  if (raw.byline !== undefined) {
    byline = text(raw.byline) ?? undefined
    if (!byline) return fail('byline (nếu có) phải là chuỗi không rỗng.')
  }

  return {
    ok: true,
    value: {
      id,
      title,
      ...(byline !== undefined && { byline }),
      image: { src, width, height, alt, credit: { text: creditText, url: creditUrl } },
      description,
      commentary: commentary.value,
      intro,
    },
  }
}

export interface LessonsFile {
  lessons: StaticLesson[]
  warnings: string[]
}

export interface PicturesFile {
  pictures: Picture[]
  warnings: string[]
}

/** Shared checks for a catalog file: object, version 1, array under `key`. Returns the array or a warning. */
function listOf(raw: unknown, key: 'lessons' | 'pictures', what: string): { list: unknown[] } | { warning: string } {
  if (!isRecord(raw)) return { warning: `${what} không đúng định dạng.` }
  if (raw.version !== SUPPORTED_VERSION) {
    return { warning: `Phiên bản ${what.toLowerCase()} không được hỗ trợ (cần version ${SUPPORTED_VERSION}).` }
  }
  const list = raw[key]
  if (!Array.isArray(list)) return { warning: `${what} thiếu mảng "${key}".` }
  return { list: list as unknown[] }
}

const idOf = (item: unknown): string | null => (isRecord(item) ? text(item.id) : null)

/**
 * Validate the lessons file (public/lessons/index.json); invalid or duplicate lessons are skipped
 * and listed in warnings. Legacy "series" and "pictures" keys are ignored.
 */
export function parseLessonsFile(raw: unknown): LessonsFile {
  const found = listOf(raw, 'lessons', 'Danh mục bài')
  if ('warning' in found) return { lessons: [], warnings: [found.warning] }
  const warnings: string[] = []
  const lessons: StaticLesson[] = []
  const ids = new Set<string>()
  found.list.forEach((item, i) => {
    const label = `Bài #${i + 1}${idOf(item) ? ` (${idOf(item)})` : ''}`
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
  return { lessons, warnings }
}

/** Validate the pictures file (public/pictures/index.json); invalid or duplicate pictures are skipped and listed in warnings. */
export function parsePicturesFile(raw: unknown): PicturesFile {
  const found = listOf(raw, 'pictures', 'Danh mục tranh')
  if ('warning' in found) return { pictures: [], warnings: [found.warning] }
  const warnings: string[] = []
  const pictures: Picture[] = []
  const ids = new Set<string>()
  found.list.forEach((item, i) => {
    const label = `Tranh #${i + 1}${idOf(item) ? ` (${idOf(item)})` : ''}`
    const parsed = parsePicture(item)
    if (!parsed.ok) {
      warnings.push(`${label}: ${parsed.error}`)
    } else if (ids.has(parsed.value.id)) {
      warnings.push(`${label}: trùng id, đã bỏ qua.`)
    } else {
      ids.add(parsed.value.id)
      pictures.push(parsed.value)
    }
  })
  return { pictures, warnings }
}

const LOAD_ERROR = 'Không tải được danh sách bài có sẵn. Bạn vẫn có thể dùng bài mẫu hoặc tải file của bạn.'
const PICTURES_LOAD_ERROR = 'Không tải được danh sách tranh.'

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(assetUrl(path))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Fetch and validate both catalog files in parallel. Never throws; one file failing does not hide
 * the other. `error` is set (as before) only when the lessons file could not be loaded, and a
 * pictures failure is added to `warnings`. Both failing sets `error` and keeps the pictures note.
 */
export async function loadCatalog(): Promise<LoadedCatalog> {
  const [lessonsRes, picturesRes] = await Promise.allSettled([fetchJson(LESSONS_INDEX), fetchJson(PICTURES_INDEX)])
  const warnings: string[] = []
  let lessons: StaticLesson[] = []
  let pictures: Picture[] = []
  let error: string | null = null

  if (lessonsRes.status === 'fulfilled') {
    const parsed = parseLessonsFile(lessonsRes.value)
    lessons = parsed.lessons
    warnings.push(...parsed.warnings)
  } else {
    error = LOAD_ERROR
  }
  if (picturesRes.status === 'fulfilled') {
    const parsed = parsePicturesFile(picturesRes.value)
    pictures = parsed.pictures
    warnings.push(...parsed.warnings)
  } else {
    warnings.push(PICTURES_LOAD_ERROR)
  }
  return { lessons, pictures, warnings, error }
}
