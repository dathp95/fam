import { describe, expect, it } from 'vitest'
import { normalizeBase } from './base.ts'

describe('normalizeBase', () => {
  it('defaults to the site root', () => {
    for (const v of [undefined, '', '  ', '/']) expect(normalizeBase(v)).toBe('/')
  })

  it('adds the missing leading and trailing slash', () => {
    for (const v of ['fam', '/fam', 'fam/', '/fam/', ' /fam/ ']) expect(normalizeBase(v)).toBe('/fam/')
  })

  it('supports nested paths', () => {
    expect(normalizeBase('/a/b')).toBe('/a/b/')
  })

  it('rejects values that are not a path', () => {
    for (const v of ['https://x.github.io/fam/', '//cdn/fam', '/a//b', '/../x', '/a b/', '/fam?x', '/fam#x', '/./x', 'C:\\fam', 'C:/Program Files/Git/fam/']) {
      expect(() => normalizeBase(v), v).toThrow(/VITE_BASE/)
    }
  })
})
