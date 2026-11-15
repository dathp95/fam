import { describe, expect, it, vi } from 'vitest'
import { publishLesson } from './adminPublish.ts'
import type { StaticLesson } from './types.ts'

const lesson: StaticLesson = {
  id: 'voa-l90-a',
  kind: 'static',
  title: 'Test',
  langId: 'en',
  createdAt: 1,
  audioUrl: 'lessons/voa/voa-l90-a.mp3',
  duration: 10,
  sentences: [{ id: 's1', text: 'Hi.', start: 0, end: 2 }],
  level: 'A1',
  topic: 'Greetings',
  source: { name: 'n', url: 'https://example.com', license: 'l' },
  order: 1,
}

const reply = (status: number, body: unknown) =>
  vi.fn(() => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response))

describe('publishLesson', () => {
  it('POSTs {lesson, force} as JSON to <base>__admin/publish-lesson', async () => {
    const fetchFn = reply(200, { ok: true, id: 'voa-l90-a', action: 'added', audio: 'lessons/voa/voa-l90-a.mp3' })
    const r = await publishLesson(lesson, false, fetchFn as unknown as typeof fetch, '/')
    expect(r).toEqual({ ok: true, id: 'voa-l90-a', action: 'added', audio: 'lessons/voa/voa-l90-a.mp3' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/__admin/publish-lesson')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ lesson, force: false })
  })

  it('works under a sub-path base and sends force: true', async () => {
    const fetchFn = reply(200, { ok: true, id: 'voa-l90-a', action: 'replaced', audio: 'a' })
    const r = await publishLesson(lesson, true, fetchFn as unknown as typeof fetch, '/fam')
    expect(r.ok && r.action).toBe('replaced')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/fam/__admin/publish-lesson')
    expect(JSON.parse(init.body as string).force).toBe(true)
  })

  it('returns the script error and the "exists" flag', async () => {
    const fetchFn = reply(400, { ok: false, error: 'Bài "voa-l90-a" đã có trong danh mục.', exists: true })
    const r = await publishLesson(lesson, false, fetchFn as unknown as typeof fetch, '/')
    expect(r).toEqual({ ok: false, error: 'Bài "voa-l90-a" đã có trong danh mục.', exists: true })
  })

  it('returns other errors without the exists flag', async () => {
    const fetchFn = reply(400, { ok: false, error: 'Không tìm thấy file audio.' })
    const r = await publishLesson(lesson, false, fetchFn as unknown as typeof fetch, '/')
    expect(r).toEqual({ ok: false, error: 'Không tìm thấy file audio.', exists: false })
  })

  it('reports a 403 from the bridge', async () => {
    const fetchFn = reply(403, { ok: false, error: 'Chỉ nhận yêu cầu từ chính máy này.' })
    const r = await publishLesson(lesson, false, fetchFn as unknown as typeof fetch, '/')
    expect(r.ok).toBe(false)
  })

  it('handles a non-JSON answer (e.g. the production server has no bridge)', async () => {
    const fetchFn = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('x')) } as unknown as Response))
    const r = await publishLesson(lesson, false, fetchFn as unknown as typeof fetch, '/')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('404')
  })

  it('handles a network error without throwing', async () => {
    const r = await publishLesson(lesson, false, (() => Promise.reject(new Error('down'))) as unknown as typeof fetch, '/')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('npm run dev')
  })

  it('does not report success for an ok answer without an id', async () => {
    const r = await publishLesson(lesson, false, reply(200, { ok: true }) as unknown as typeof fetch, '/')
    expect(r.ok).toBe(false)
  })
})
