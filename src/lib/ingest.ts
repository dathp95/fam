/**
 * Pure parts of the picture ingest tool (scripts/ingest-pictures.ts): file names, Met API data,
 * credit text, building a Picture and merging it into public/lessons/index.json.
 */

import { parseCatalog, parseCommentary, type ParseResult } from './catalog.ts'
import { contentIssues } from './pictures.ts'
import type { Picture, PictureCommentary } from './types.ts'

export const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/'

export const metApiUrl = (objectId: string) => `${MET_API}${objectId}`
export const pictureId = (objectId: string) => `met-${objectId}`
/** Path of the converted image, relative to public/ (and to BASE_URL at runtime). */
export const pictureSrc = (objectId: string) => `pictures/${pictureId(objectId)}.webp`

/** "435809.jpeg" -> "435809" (jpg, jpeg, png; any case). Anything else (e.g. drafts) gives null. */
export function objectIdFromFilename(name: string): string | null {
  return /^(\d+)\.(?:jpe?g|png)$/i.exec(name)?.[1] ?? null
}

/** The only Met API fields kept in a draft. */
export const DRAFT_FIELDS = [
  'title',
  'artistDisplayName',
  'objectDate',
  'medium',
  'dimensions',
  'department',
  'culture',
  'period',
  'creditLine',
  'objectURL',
] as const

export type MetDraft = Record<(typeof DRAFT_FIELDS)[number], string>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Strictly `true`: a missing field, "true" or 1 does not count as public domain. */
export function isPublicDomain(api: unknown): boolean {
  return isRecord(api) && api.isPublicDomain === true
}

/** Keep only the draft fields from an API response; missing or non-string values become "". */
export function pickDraftFields(api: unknown): MetDraft {
  const src = isRecord(api) ? api : {}
  const out = {} as MetDraft
  for (const key of DRAFT_FIELDS) {
    const v = src[key]
    out[key] = typeof v === 'string' ? v.trim() : ''
  }
  return out
}

/**
 * `<artist>, "<title>", <date>. The Metropolitan Museum of Art, <creditLine>. Ảnh thuộc phạm vi
 * công cộng (Met Open Access).` The artist is omitted when empty (so are an empty date or credit line).
 */
export function buildCreditText(d: Pick<MetDraft, 'title' | 'artistDisplayName' | 'objectDate' | 'creditLine'>): string {
  const artist = d.artistDisplayName.trim()
  const date = d.objectDate.trim()
  const credit = d.creditLine.trim()
  const work = `${artist ? `${artist}, ` : ''}"${d.title.trim()}"${date ? `, ${date}` : ''}`
  return `${work}. The Metropolitan Museum of Art${credit ? `, ${credit}` : ''}. Ảnh thuộc phạm vi công cộng (Met Open Access).`
}

/** What is written by hand (in a session) for each draft: inbox/images/<id>.content.json. */
export interface PictureContent {
  /** Vietnamese alt text; optional, a neutral one is used when missing. */
  alt?: string
  description: string[]
  /** Required: story, view and takeaway (Vietnamese; takeaway without the "Rút ra" label). */
  commentary: PictureCommentary
  intro: string[]
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function sentences(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = (v as unknown[]).map((s) => (typeof s === 'string' ? s.trim() : ''))
  return out.length > 0 && out.every(Boolean) ? out : null
}

export function parseContent(raw: unknown): ParseResult<PictureContent> {
  if (!isRecord(raw)) return fail('file nội dung phải là một đối tượng JSON.')
  const description = sentences(raw.description)
  if (!description) return fail('description phải là danh sách câu tiếng Việt không rỗng.')
  const commentary = parseCommentary(raw.commentary)
  if (!commentary.ok) return fail(`${commentary.error} (file nội dung cần commentary: { story, view, takeaway }).`)
  const intro = sentences(raw.intro)
  if (!intro) return fail('intro phải là danh sách câu tiếng Anh không rỗng.')
  if (raw.alt !== undefined && (typeof raw.alt !== 'string' || !raw.alt.trim())) {
    return fail('alt (nếu có) phải là chuỗi không rỗng.')
  }
  return {
    ok: true,
    value: { alt: typeof raw.alt === 'string' ? raw.alt.trim() : undefined, description, commentary: commentary.value, intro },
  }
}

/** "Artist · date" from the draft (either part may be missing); "" when both are empty. */
export function buildByline(d: Pick<MetDraft, 'artistDisplayName' | 'objectDate'>): string {
  return [d.artistDisplayName.trim(), d.objectDate.trim()].filter(Boolean).join(' · ')
}

export function buildPicture(args: {
  objectId: string
  draft: MetDraft
  content: PictureContent
  width: number
  height: number
}): Picture {
  const { objectId, draft, content, width, height } = args
  const byline = buildByline(draft)
  return {
    id: pictureId(objectId),
    title: draft.title,
    ...(byline && { byline }),
    image: {
      src: pictureSrc(objectId),
      width,
      height,
      alt: content.alt ?? `Tác phẩm ${draft.title}`,
      credit: { text: buildCreditText(draft), url: draft.objectURL },
    },
    description: content.description,
    commentary: content.commentary,
    intro: content.intro,
  }
}

/** Replace the picture with the same id, or append it. Does not mutate the input. */
export function mergePicture(pictures: Picture[], picture: Picture): Picture[] {
  const i = pictures.findIndex((p) => p.id === picture.id)
  return i === -1 ? [...pictures, picture] : pictures.map((p, k) => (k === i ? picture : p))
}

/**
 * Merge pictures into the raw index.json object (same id replaces, others are kept as they are)
 * and validate the whole result with the catalog parser and the content rules. Returns the new
 * object only when there are no problems, so the caller never writes an invalid index.json.
 */
export function mergeIntoCatalog(
  rawCatalog: unknown,
  pictures: Picture[],
): { ok: true; catalog: Record<string, unknown> } | { ok: false; errors: string[] } {
  if (!isRecord(rawCatalog)) return { ok: false, errors: ['index.json không phải một đối tượng JSON.'] }
  let list: unknown[] = Array.isArray(rawCatalog.pictures) ? [...(rawCatalog.pictures as unknown[])] : []
  for (const picture of pictures) {
    const i = list.findIndex((x) => isRecord(x) && x.id === picture.id)
    list = i === -1 ? [...list, picture] : list.map((x, k) => (k === i ? picture : x))
  }
  const catalog: Record<string, unknown> = { ...rawCatalog, pictures: list }

  const parsed = parseCatalog(catalog)
  const errors = [...parsed.warnings]
  for (const picture of pictures) {
    if (!parsed.pictures.some((p) => p.id === picture.id)) {
      errors.push(`${picture.id}: không qua được kiểm tra định dạng nên không được ghi.`)
    }
  }
  for (const p of parsed.pictures) errors.push(...contentIssues(p))
  return errors.length > 0 ? { ok: false, errors } : { ok: true, catalog }
}
