/** Normalises the deploy base path (env VITE_BASE) so Vite always gets "/", or "/name/" (sub-path). */

/**
 * "" / undefined / "/" -> "/"; "fam" or "/fam" or "fam/" -> "/fam/". Throws a readable error for
 * values that cannot be a path (full URLs, spaces, "?", "#", "..", empty segments).
 */
export function normalizeBase(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (value === '' || value === '/') return '/'
  const segments = value.split('/').filter((s, i, all) => !(s === '' && (i === 0 || i === all.length - 1)))
  const bad = segments.find((s) => s === '' || s === '.' || s === '..' || /[\s?#:\\]/.test(s))
  if (bad !== undefined) {
    throw new Error(`VITE_BASE không hợp lệ: "${raw}". Dùng dạng "/" hoặc "/ten-repo/".`)
  }
  return `/${segments.join('/')}/`
}
