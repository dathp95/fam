import { describe, expect, it } from 'vitest'
import {
  adminPublish,
  isAllowedOrigin,
  isLoopbackAddress,
  MAX_BODY_BYTES,
  parseLastJsonLine,
  parsePublishBody,
  pythonCandidates,
  scriptArgs,
} from './admin-publish.ts'

describe('isLoopbackAddress', () => {
  it('accepts the three loopback forms', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopbackAddress(a), a).toBe(true)
  })

  it('rejects everything else (LAN, public, empty, look-alikes)', () => {
    for (const a of ['192.168.1.5', '10.0.0.2', '::ffff:192.168.1.5', '8.8.8.8', '', '127.0.0.2', '127.0.0.1.evil.com', undefined]) {
      expect(isLoopbackAddress(a), String(a)).toBe(false)
    }
  })
})

describe('isAllowedOrigin', () => {
  it('allows a missing Origin', () => {
    expect(isAllowedOrigin(undefined, 'localhost:5173')).toBe(true)
  })

  it('allows the dev server\'s own local origin', () => {
    expect(isAllowedOrigin('http://localhost:5173', 'localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:5173', '127.0.0.1:5173')).toBe(true)
    expect(isAllowedOrigin('http://[::1]:5173', '[::1]:5173')).toBe(true)
  })

  it('rejects another origin, even one that matches its own Host (DNS rebinding)', () => {
    expect(isAllowedOrigin('http://evil.com', 'localhost:5173')).toBe(false)
    expect(isAllowedOrigin('http://evil.com:5173', 'evil.com:5173')).toBe(false)
    expect(isAllowedOrigin('http://192.168.1.5:5173', '192.168.1.5:5173')).toBe(false)
  })

  it('rejects a different port or a malformed or non-http origin', () => {
    expect(isAllowedOrigin('http://localhost:3000', 'localhost:5173')).toBe(false)
    expect(isAllowedOrigin('null', 'localhost:5173')).toBe(false)
    expect(isAllowedOrigin('not a url', 'localhost:5173')).toBe(false)
    expect(isAllowedOrigin('file://localhost', 'localhost')).toBe(false)
    expect(isAllowedOrigin('http://localhost:5173', undefined)).toBe(false)
  })
})

describe('parsePublishBody', () => {
  const json = 'application/json'
  const body = (o: unknown) => JSON.stringify(o)

  it('accepts {lesson} and {lesson, force}', () => {
    expect(parsePublishBody(json, body({ lesson: { id: 'a' } }))).toEqual({ ok: true, lesson: { id: 'a' }, force: false })
    expect(parsePublishBody('application/json; charset=utf-8', body({ lesson: { id: 'a' }, force: true }))).toEqual({
      ok: true,
      lesson: { id: 'a' },
      force: true,
    })
  })

  it('requires Content-Type application/json', () => {
    for (const ct of [undefined, '', 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonx']) {
      const r = parsePublishBody(ct, body({ lesson: {} }))
      expect(r.ok, String(ct)).toBe(false)
      if (!r.ok) expect(r.status).toBe(415)
    }
  })

  it('rejects a body larger than 1 MB', () => {
    const r = parsePublishBody(json, body({ lesson: { pad: 'x'.repeat(MAX_BODY_BYTES) } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(413)
  })

  it('rejects invalid JSON, non-objects, a missing lesson and a non-boolean force', () => {
    for (const raw of ['{', '', 'null', '[]', '5', body({}), body({ lesson: null }), body({ lesson: [] }), body({ lesson: 'x' }), body({ lesson: {}, force: 'yes' })]) {
      const r = parsePublishBody(json, raw)
      expect(r.ok, raw).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    }
  })
})

describe('parseLastJsonLine', () => {
  it('uses the last non-empty line', () => {
    expect(parseLastJsonLine('log line\n{"ok":true,"id":"a"}\n')).toEqual({ ok: true, id: 'a' })
    expect(parseLastJsonLine('{"ok":false,"error":"x"}\r\n\r\n')).toEqual({ ok: false, error: 'x' })
  })

  it('ignores earlier JSON lines', () => {
    expect(parseLastJsonLine('{"ok":false,"error":"old"}\n{"ok":true}\n')).toEqual({ ok: true })
  })

  it('returns null when the last line is not a JSON object with a boolean ok', () => {
    for (const out of ['', '\n\n', 'plain text', '{"ok":true}\nlog after', '[1]', '{"ok":"yes"}', '{"id":"a"}', '5']) {
      expect(parseLastJsonLine(out), out).toBeNull()
    }
  })
})

describe('python command', () => {
  it('tries python, then py -3 on Windows, then python3', () => {
    expect(pythonCandidates('win32')).toEqual([
      { command: 'python', prefix: [] },
      { command: 'py', prefix: ['-3'] },
      { command: 'python3', prefix: [] },
    ])
    expect(pythonCandidates('linux').map((c) => c.command)).toEqual(['python', 'python3'])
  })

  it('builds fixed arguments; the lesson never appears in them', () => {
    expect(scriptArgs({ command: 'python', prefix: [] }, false)).toEqual(['process_lesson.py', '--import-json', '-'])
    expect(scriptArgs({ command: 'py', prefix: ['-3'] }, true)).toEqual(['-3', 'process_lesson.py', '--import-json', '-', '--force'])
  })
})

describe('adminPublish plugin', () => {
  it('only exists while serving (apply: "serve")', () => {
    const plugin = adminPublish()
    expect(plugin.apply).toBe('serve')
    expect(plugin.name).toBe('fam-admin-publish')
  })
})
