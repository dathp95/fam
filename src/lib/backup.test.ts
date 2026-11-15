import { describe, expect, it } from 'vitest'
import { backupFileName, exportProgress, MAX_BACKUP_BYTES, parseBackup } from './backup.ts'
import type { Progress } from './progress.ts'

const sample = (): Progress => ({
  xp: 230,
  streak: 4,
  last: '2026-11-14',
  sentences: 57,
  lessonsDone: { 'voa-l01-welcome': { best: 92, at: 1700000000000 } },
  picture: { id: 'met-1', opened: 3, order: [3, 1, 5, 0, 2, 4] },
  picturesDone: ['met-9'],
  album: ['met-9', 'met-8'],
  history: { 'voa-l01-welcome': [40, 75, 92] },
})

const wrap = (over: Record<string, unknown>) =>
  JSON.stringify({ app: 'fam', kind: 'progress', version: 1, exportedAt: 'x', progress: sample(), ...over })

describe('exportProgress', () => {
  it('writes the envelope with app, kind, version, date and progress', () => {
    const now = new Date('2026-11-15T10:00:00Z')
    const parsed = JSON.parse(exportProgress(sample(), now))
    expect(parsed).toEqual({ app: 'fam', kind: 'progress', version: 1, exportedAt: now.toISOString(), progress: sample() })
  })

  it('round trips: export then parse gives the same progress', () => {
    const r = parseBackup(exportProgress(sample()))
    expect(r.ok && r.progress).toEqual(sample())
  })

  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 10, 5))).toBe('fam-progress-2026-11-05.json')
  })
})

describe('parseBackup: rejects bad files with a Vietnamese error', () => {
  const error = (text: string) => {
    const r = parseBackup(text)
    if (r.ok) throw new Error('expected an error')
    return r.error
  }

  it('not JSON', () => {
    expect(error('not json {')).toContain('JSON')
    expect(error('')).toContain('JSON')
  })

  it('JSON that is not an object', () => {
    for (const t of ['null', '5', '"x"', '[]', '[1,2]']) expect(error(t)).toContain('không phải file sao lưu')
  })

  it('wrong app or kind', () => {
    expect(error(wrap({ app: 'other' }))).toContain('không phải file sao lưu')
    expect(error(wrap({ kind: 'settings' }))).toContain('không phải file sao lưu')
    expect(error(JSON.stringify({ xp: 5, streak: 1 }))).toContain('không phải file sao lưu')
  })

  it('missing, invalid or future version', () => {
    expect(error(wrap({ version: undefined }))).toContain('phiên bản')
    expect(error(wrap({ version: '1' }))).toContain('phiên bản')
    expect(error(wrap({ version: 0 }))).toContain('phiên bản')
    expect(error(wrap({ version: 1.5 }))).toContain('phiên bản')
    expect(error(wrap({ version: 2 }))).toContain('mới hơn')
  })

  it('missing progress', () => {
    for (const progress of [undefined, null, 'x', [], 3]) expect(error(wrap({ progress }))).toContain('dữ liệu tiến độ')
  })

  it('oversized input', () => {
    const big = wrap({ padding: 'x'.repeat(MAX_BACKUP_BYTES) })
    expect(error(big)).toContain('quá lớn')
  })
})

describe('parseBackup: sanitises the progress', () => {
  it('drops garbage fields, bad history scores and defaults the rest', () => {
    const r = parseBackup(
      wrap({
        progress: {
          xp: 'abc',
          streak: -0,
          sentences: null,
          lessonsDone: { ok: { best: 80, at: 1, extra: 'x' }, bad: { best: 'x' }, num: 5 },
          picture: { id: 'met-1', opened: 99, order: [1, 2] },
          picturesDone: ['a', 'a', '', 3],
          history: { l1: [50, 'x', null, 120, -5, 77], l2: 'nope', l3: [] },
          junk: { a: 1 },
        },
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.progress).toEqual({
      xp: 0,
      streak: 0,
      last: '',
      sentences: 0,
      lessonsDone: { ok: { best: 80, at: 1 } },
      picture: null,
      picturesDone: ['a'],
      album: ['a'],
      history: { l1: [50, 77] },
    })
    expect('junk' in r.progress).toBe(false)
  })

  it('ignores a __proto__ key in lessonsDone and history', () => {
    const text = wrap({}).replace(
      '"history":',
      '"history":{"__proto__":[1,2,3]},"lessonsDone":{"__proto__":{"best":99,"at":1}},"x":',
    )
    const r = parseBackup(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.progress.history)).toEqual([])
    expect(Object.keys(r.progress.lessonsDone)).toEqual([])
    expect(Object.getPrototypeOf(r.progress.lessonsDone)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(r.progress.history)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).best).toBeUndefined()
  })

  it('accepts an empty progress object (everything defaults)', () => {
    const r = parseBackup(wrap({ progress: {} }))
    expect(r.ok && r.progress.xp).toBe(0)
    expect(r.ok && r.progress.history).toEqual({})
  })
})
