/**
 * Picture ingest tool. Run with `npm run ingest:pictures`.
 *
 * Step 1 (default): for each inbox/images/<objectId>.(jpg|jpeg|png), fetch the Met Open Access
 *   record, skip anything that is not public domain, convert to public/pictures/met-<id>.webp
 *   (1600 px wide) and write inbox/images/<id>.draft.json with the API fields.
 * Step 2 (`--merge`): for each draft that has inbox/images/<id>.content.json (alt, description,
 *   intro written by hand), build the picture and merge it into public/lessons/index.json. The file
 *   is written only when the whole catalog validates.
 *
 * ffmpeg/ffprobe are taken from FFMPEG_PATH / FFPROBE_PATH, then PATH, then a WinGet install.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  buildPicture,
  isPublicDomain,
  mergeIntoCatalog,
  metApiUrl,
  objectIdFromFilename,
  parseContent,
  pickDraftFields,
  pictureId,
  pictureSrc,
  type MetDraft,
} from '../src/lib/ingest.ts'
import { contentIssues } from '../src/lib/pictures.ts'

const ROOT = resolve(import.meta.dirname, '..')
const IMAGES_DIR = join(ROOT, 'inbox', 'images')
const PICTURES_DIR = join(ROOT, 'public', 'pictures')
const INDEX_PATH = join(ROOT, 'public', 'lessons', 'index.json')
const WIDTH = 1600

class UserError extends Error {}

const draftPath = (id: string) => join(IMAGES_DIR, `${id}.draft.json`)
const contentPath = (id: string) => join(IMAGES_DIR, `${id}.content.json`)
const webpPath = (id: string) => join(PICTURES_DIR, `${pictureId(id)}.webp`)

function works(cmd: string): boolean {
  return spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0
}

/** Find ffmpeg or ffprobe: env override, PATH, then a WinGet "Gyan.FFmpeg" install. */
function findTool(name: 'ffmpeg' | 'ffprobe'): string {
  const fromEnv = process.env[`${name.toUpperCase()}_PATH`]
  if (fromEnv) {
    if (works(fromEnv)) return fromEnv
    throw new UserError(`Không chạy được ${fromEnv} (biến ${name.toUpperCase()}_PATH).`)
  }
  if (works(name)) return name
  const winget = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
  if (winget && existsSync(winget)) {
    for (const pkg of readdirSync(winget).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
      const root = join(winget, pkg)
      for (const build of readdirSync(root).filter((d) => d.startsWith('ffmpeg'))) {
        const exe = join(root, build, 'bin', `${name}.exe`)
        if (existsSync(exe) && works(exe)) return exe
      }
    }
  }
  throw new UserError(
    `Không tìm thấy ${name}. Hãy cài ffmpeg (ví dụ: winget install Gyan.FFmpeg) hoặc đặt biến ${name.toUpperCase()}_PATH.`,
  )
}

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  if (r.status !== 0) throw new UserError(`${cmd} báo lỗi: ${(r.stderr || r.error?.message || '').trim().split('\n')[0]}`)
  return r.stdout
}

function probeSize(ffprobe: string, file: string): { width: number; height: number } {
  const out = run(ffprobe, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file,
  ])
  const stream = (JSON.parse(out) as { streams?: { width?: number; height?: number }[] }).streams?.[0]
  if (!stream?.width || !stream.height) throw new UserError(`Không đọc được kích thước của ${file}.`)
  return { width: stream.width, height: stream.height }
}

async function fetchMetObject(id: string): Promise<unknown> {
  const res = await fetch(metApiUrl(id), { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new UserError(`API của Met trả về lỗi ${res.status} cho đối tượng ${id}.`)
  return res.json()
}

const listImages = () =>
  readdirSync(IMAGES_DIR)
    .map((name) => ({ name, id: objectIdFromFilename(name) }))
    .filter((f): f is { name: string; id: string } => f.id !== null)
    .sort((a, b) => Number(a.id) - Number(b.id))

async function convert(): Promise<number> {
  if (!existsSync(IMAGES_DIR)) throw new UserError('Không thấy thư mục inbox/images/.')
  const images = listImages()
  if (images.length === 0) throw new UserError('Không có ảnh .jpg/.jpeg/.png nào trong inbox/images/.')
  const ffmpeg = findTool('ffmpeg')
  const ffprobe = findTool('ffprobe')
  mkdirSync(PICTURES_DIR, { recursive: true })

  let failures = 0
  const ready: string[] = []
  for (const { name, id } of images) {
    try {
      const api = await fetchMetObject(id)
      if (!isPublicDomain(api)) {
        console.log(`Bỏ qua ${name}: tác phẩm ${id} không thuộc phạm vi công cộng (isPublicDomain không phải true).`)
        continue
      }
      const draft = pickDraftFields(api)
      run(ffmpeg, ['-y', '-loglevel', 'error', '-i', join(IMAGES_DIR, name), '-vf', `scale=${WIDTH}:-2`, '-q:v', '80', webpPath(id)])
      const { width, height } = probeSize(ffprobe, webpPath(id))
      writeFileSync(draftPath(id), JSON.stringify(draft, null, 2) + '\n')
      ready.push(id)
      console.log(`Đã xử lý ${name}: public/pictures/${pictureId(id)}.webp (${width}×${height}), "${draft.title}".`)
    } catch (e) {
      failures++
      console.log(`Lỗi với ${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (ready.length > 0) {
    console.log(
      `\nTiếp theo: tạo inbox/images/<id>.content.json (alt, description, intro) cho: ${ready.join(', ')}, ` +
        'rồi chạy: npm run ingest:pictures -- --merge',
    )
  }
  return failures
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function merge(): number {
  const ffprobe = findTool('ffprobe')
  const drafts = readdirSync(IMAGES_DIR).flatMap((n) => /^(\d+)\.draft\.json$/.exec(n)?.[1] ?? [])
  if (drafts.length === 0) throw new UserError('Chưa có file .draft.json. Hãy chạy npm run ingest:pictures trước.')

  const pictures = []
  const problems: string[] = []
  for (const id of drafts.sort((a, b) => Number(a) - Number(b))) {
    if (!existsSync(contentPath(id))) {
      console.log(`Bỏ qua ${id}: chưa có ${id}.content.json.`)
      continue
    }
    const content = parseContent(readJson(contentPath(id)))
    if (!content.ok) {
      problems.push(`${id}: ${content.error}`)
      continue
    }
    if (!existsSync(webpPath(id))) {
      problems.push(`${id}: thiếu ${pictureSrc(id)}. Hãy chạy lại bước chuyển ảnh.`)
      continue
    }
    const { width, height } = probeSize(ffprobe, webpPath(id))
    const picture = buildPicture({ objectId: id, draft: readJson(draftPath(id)) as MetDraft, content: content.value, width, height })
    problems.push(...contentIssues(picture))
    pictures.push(picture)
  }
  if (problems.length > 0) return report(problems)
  if (pictures.length === 0) throw new UserError('Không có bức tranh nào để ghép.')

  const merged = mergeIntoCatalog(readJson(INDEX_PATH), pictures)
  if (!merged.ok) return report(merged.errors)

  const tmp = `${INDEX_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(merged.catalog, null, 2) + '\n')
  renameSync(tmp, INDEX_PATH)
  console.log(`Đã ghi ${pictures.length} bức tranh vào public/lessons/index.json: ${pictures.map((p) => p.id).join(', ')}.`)
  return 0
}

function report(errors: string[]): number {
  console.log('Không ghi index.json vì có lỗi:')
  for (const e of errors) console.log(`  - ${e}`)
  return 1
}

try {
  const code = process.argv.includes('--merge') ? merge() : await convert()
  process.exitCode = code === 0 ? 0 : 1
} catch (e) {
  console.log(e instanceof UserError ? e.message : `Lỗi không mong đợi: ${e instanceof Error ? e.stack : String(e)}`)
  process.exitCode = 1
}
