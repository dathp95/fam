/**
 * Dev-only bridge for the admin Review screen: POST /__admin/publish-lesson { lesson, force? } runs
 * `python process_lesson.py --import-json -` and answers with the JSON line the script prints last.
 *
 * POST /__admin/delete-lesson { id } runs `python process_lesson.py --delete-lesson=<id>` the same way.
 *
 * It is a Vite plugin with `apply: 'serve'`, so it exists only in `npm run dev`: not in `vite build`,
 * not in `vite preview`, not in a deployed site. Requests are accepted only from this machine (loopback
 * socket, local Origin and Host) and the command is built from fixed arguments (no shell).
 */

import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export const PUBLISH_PATH = '/__admin/publish-lesson'
export const DELETE_PATH = '/__admin/delete-lesson'
export const MAX_BODY_BYTES = 1024 * 1024
const PYTHON_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------- pure helpers (unit tested)

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** True for the three loopback forms of the peer address. */
export const isLoopbackAddress = (address: string | undefined): boolean =>
  address !== undefined && LOOPBACK_ADDRESSES.has(address)

/**
 * The Origin header (when present) must be this dev server itself: a local host name whose host:port
 * equals the Host header. A missing Origin (curl, same-origin GET-like tools) is allowed, since the
 * socket check already restricts the caller to this machine.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTNAMES.has(url.hostname) && url.host === host
}

export type PublishBody =
  | { ok: true; lesson: Record<string, unknown>; force: boolean }
  | { ok: false; status: number; error: string }

/** Validate the request body: Content-Type application/json, size <= 1 MB, {lesson: object, force?: boolean}. */
export function parsePublishBody(contentType: string | undefined, raw: string): PublishBody {
  if (!/^application\/json\s*(;|$)/i.test(contentType ?? '')) {
    return { ok: false, status: 415, error: 'Content-Type phải là application/json.' }
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Nội dung quá lớn (tối đa 1 MB).' }
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, status: 400, error: 'Nội dung không phải JSON hợp lệ.' }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, status: 400, error: 'Cần một đối tượng {lesson, force?}.' }
  }
  const { lesson, force } = data as Record<string, unknown>
  if (typeof lesson !== 'object' || lesson === null || Array.isArray(lesson)) {
    return { ok: false, status: 400, error: 'Thiếu "lesson" (một đối tượng bài học).' }
  }
  if (force !== undefined && typeof force !== 'boolean') {
    return { ok: false, status: 400, error: '"force" phải là true hoặc false.' }
  }
  return { ok: true, lesson: lesson as Record<string, unknown>, force: force === true }
}

export type DeleteBody = { ok: true; id: string } | { ok: false; status: number; error: string }

/** Lesson ids as the script accepts them; no leading "-" so the id can never look like an option. */
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/

/** Validate the delete request: Content-Type application/json and {id: string} with a safe lesson id. */
export function parseDeleteBody(contentType: string | undefined, raw: string): DeleteBody {
  if (!/^application\/json\s*(;|$)/i.test(contentType ?? '')) {
    return { ok: false, status: 415, error: 'Content-Type phải là application/json.' }
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Nội dung quá lớn (tối đa 1 MB).' }
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, status: 400, error: 'Nội dung không phải JSON hợp lệ.' }
  }
  const id = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>).id : undefined
  if (typeof id !== 'string' || !SAFE_ID.test(id)) {
    return { ok: false, status: 400, error: 'Cần {id} là mã bài hợp lệ (chữ thường, số, dấu gạch ngang).' }
  }
  return { ok: true, id }
}

export interface ScriptResult {
  ok: boolean
  error?: string
  exists?: boolean
  [key: string]: unknown
}

/** The script's answer: its last non-empty stdout line, as a JSON object with a boolean "ok". */
export function parseLastJsonLine(stdout: string): ScriptResult | null {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim() !== '')
  const last = lines.at(-1)
  if (last === undefined) return null
  try {
    const data: unknown = JSON.parse(last)
    if (typeof data === 'object' && data !== null && !Array.isArray(data) && typeof (data as ScriptResult).ok === 'boolean') {
      return data as ScriptResult
    }
  } catch {
    /* not JSON */
  }
  return null
}

export interface PythonCommand {
  command: string
  /** Arguments that come before the script (e.g. "-3" for the Windows launcher). */
  prefix: string[]
}

/** Interpreters to try, in order: `python`, then `py -3` on Windows, then `python3`. */
export function pythonCandidates(platform: string = process.platform): PythonCommand[] {
  const list: PythonCommand[] = [{ command: 'python', prefix: [] }]
  if (platform === 'win32') list.push({ command: 'py', prefix: ['-3'] })
  list.push({ command: 'python3', prefix: [] })
  return list
}

/** Fixed argument list: the lesson travels on stdin, never on the command line. */
export const scriptArgs = (candidate: PythonCommand, force: boolean): string[] => [
  ...candidate.prefix,
  'process_lesson.py',
  '--import-json',
  '-',
  ...(force ? ['--force'] : []),
]

export const deleteArgs = (candidate: PythonCommand, id: string): string[] => [
  ...candidate.prefix,
  'process_lesson.py',
  `--delete-lesson=${id}`,
]

// ---------------------------------------------------------------- the plugin (runs only in `vite` dev)

interface RunOutcome {
  /** null = this interpreter is not usable (try the next one). */
  result: { stdout: string; stderr: string; code: number | null } | null
}

function runPython(candidate: PythonCommand, args: string[], cwd: string, input: string): Promise<RunOutcome> {
  return new Promise((resolveRun) => {
    const child = spawn(candidate.command, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), PYTHON_TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d))
    child.on('error', () => {
      clearTimeout(timer)
      resolveRun({ result: null }) // e.g. ENOENT: no such interpreter
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      // 9009 = Windows "command not found" / Store stub: try the next interpreter.
      resolveRun({ result: code === 9009 ? null : { stdout, stderr, code } })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input, 'utf8')
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<{ ok: true; text: string } | { ok: false }> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        resolveBody({ ok: false })
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    req.on('error', () => resolveBody({ ok: false }))
  })
}

export function adminPublish(): Plugin {
  let root = process.cwd()
  return {
    name: 'fam-admin-publish',
    apply: 'serve', // never part of `vite build` or `vite preview`
    configResolved(config) {
      root = resolve(config.root)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        const isPublish = pathname.endsWith(PUBLISH_PATH)
        const isDelete = pathname.endsWith(DELETE_PATH)
        if (!isPublish && !isDelete) return next()

        if (!isLoopbackAddress(req.socket.remoteAddress) || !isAllowedOrigin(req.headers.origin, req.headers.host)) {
          return send(res, 403, { ok: false, error: 'Chỉ nhận yêu cầu từ chính máy này.' })
        }
        if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Chỉ nhận POST.' })

        const body = await readBody(req)
        if (!body.ok) return send(res, 413, { ok: false, error: 'Nội dung quá lớn (tối đa 1 MB).' })
        let input = ''
        let makeArgs: (candidate: PythonCommand) => string[]
        if (isDelete) {
          const parsed = parseDeleteBody(req.headers['content-type'], body.text)
          if (!parsed.ok) return send(res, parsed.status, { ok: false, error: parsed.error })
          makeArgs = (c) => deleteArgs(c, parsed.id)
        } else {
          const parsed = parsePublishBody(req.headers['content-type'], body.text)
          if (!parsed.ok) return send(res, parsed.status, { ok: false, error: parsed.error })
          input = JSON.stringify(parsed.lesson)
          makeArgs = (c) => scriptArgs(c, parsed.force)
        }

        for (const candidate of pythonCandidates()) {
          const { result } = await runPython(candidate, makeArgs(candidate), root, input)
          if (result === null) continue
          const answer = parseLastJsonLine(result.stdout)
          if (answer) return send(res, answer.ok ? 200 : 400, answer)
          return send(res, 500, { ok: false, error: `process_lesson.py không trả kết quả (mã ${result.code}). ${result.stderr.trim().split('\n').at(-1) ?? ''}`.trim() })
        }
        return send(res, 500, { ok: false, error: 'Không chạy được Python (đã thử python, py -3 và python3).' })
      })
    },
  }
}
