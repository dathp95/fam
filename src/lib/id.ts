/** Short unique id. Avoids crypto.randomUUID, which needs a secure context (breaks on http://LAN). */
export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
