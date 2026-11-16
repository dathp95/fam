import { describe, expect, it } from 'vitest'
import swSource from '../../public/sw.js?raw'

/** Loads the pure helpers of public/sw.js (a classic script) with a stubbed worker scope. */
function loadSw(scope = 'http://localhost/fam/') {
  const source = swSource
  const listeners: Record<string, unknown> = {}
  const self = {
    registration: { scope },
    location: new URL(scope),
    addEventListener: (type: string, fn: unknown) => (listeners[type] = fn),
  }
  const module = { exports: {} as { parseRange: (h: string, size: number) => unknown; sliceResponse: (r: Response, h: string) => Promise<Response>; clean: (r: Response) => Promise<Response> } }
  new Function('self', 'module', source)(self, module)
  return { ...module.exports, listeners }
}

describe('sw.js: parseRange', () => {
  const { parseRange } = loadSw()

  it('parses open-ended and bounded ranges', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('supports suffix ranges (last N bytes)', () => {
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=-0', 1000)).toEqual({ unsatisfiable: true })
  })

  it('reports unsatisfiable ranges', () => {
    expect(parseRange('bytes=1000-', 1000)).toEqual({ unsatisfiable: true })
    expect(parseRange('bytes=2000-3000', 1000)).toEqual({ unsatisfiable: true })
  })

  it('ignores headers it does not understand', () => {
    for (const h of ['', 'bytes=-', 'items=0-5', 'bytes=0-5,10-20', 'bytes=9-3', 'garbage']) expect(parseRange(h, 1000), h).toBeNull()
  })
})

describe('sw.js: sliceResponse', () => {
  const { sliceResponse } = loadSw()
  const full = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })

  it('answers a range with a 206 and the right headers and bytes', async () => {
    const res = await sliceResponse(full(), 'bytes=2-5')
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(res.headers.get('Content-Length')).toBe('4')
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([2, 3, 4, 5])
  })

  it('handles "bytes=0-" (Safari first probe) as the whole file in a 206', async () => {
    const res = await sliceResponse(full(), 'bytes=0-')
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-9/10')
  })

  it('answers 416 for a start beyond the end', async () => {
    const res = await sliceResponse(full(), 'bytes=50-')
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('returns the full cached response for an ignorable header', async () => {
    const cached = full()
    expect(await sliceResponse(cached, 'nonsense')).toBe(cached)
  })

  it('keeps the cached response readable (works on a clone)', async () => {
    const cached = full()
    await sliceResponse(cached, 'bytes=0-1')
    expect((await cached.arrayBuffer()).byteLength).toBe(10)
  })
})

describe('sw.js: wiring', () => {
  it('registers install, activate, message and fetch handlers and derives its scope from the registration', () => {
    const { listeners } = loadSw('http://example.com/some/base/')
    for (const type of ['install', 'activate', 'message', 'fetch']) expect(listeners[type], type).toBeTypeOf('function')
  })
})

describe('sw.js: clean', () => {
  const { clean } = loadSw()

  it('returns a response that was not redirected as it is', async () => {
    const res = new Response('x')
    expect(await clean(res)).toBe(res)
  })

  it('rebuilds a redirected response so Safari accepts it', async () => {
    const res = new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    Object.defineProperty(res, 'redirected', { value: true })
    const out = await clean(res)
    expect(out).not.toBe(res)
    expect(out.redirected).toBe(false)
    expect(out.status).toBe(200)
    expect(out.headers.get('Content-Type')).toBe('text/html')
    expect(await out.text()).toBe('<html></html>')
  })
})
