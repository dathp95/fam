/** Client of the dev-only publish bridge (scripts/admin-publish.ts). Only called from guarded dev code. */

import type { StaticLesson } from './types.ts'

export type PublishResult =
  | { ok: true; id: string; action: 'added' | 'replaced'; audio: string }
  | { ok: false; error: string; /** The lesson id is already in the catalog: offer "Thay bài cũ". */ exists: boolean }

/**
 * POST the lesson to the dev server, which runs `process_lesson.py --import-json -`. Never throws:
 * network and parsing problems come back as `{ ok: false, error }` in Vietnamese.
 */
export async function publishLesson(
  lesson: StaticLesson,
  force = false,
  fetchFn: typeof fetch = fetch,
  base: string = import.meta.env.BASE_URL,
): Promise<PublishResult> {
  // The path is built here, not in a top-level constant, so a production build drops it with the caller.
  const url = `${base.endsWith('/') ? base : base + '/'}__admin/publish-lesson`
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson, force }),
    })
    const data: unknown = await res.json().catch(() => null)
    if (typeof data !== 'object' || data === null || typeof (data as { ok?: unknown }).ok !== 'boolean') {
      return { ok: false, error: `Máy chủ dev trả về dữ liệu lạ (HTTP ${res.status}).`, exists: false }
    }
    const answer = data as { ok: boolean; id?: unknown; action?: unknown; audio?: unknown; error?: unknown; exists?: unknown }
    if (answer.ok && res.ok && typeof answer.id === 'string') {
      return {
        ok: true,
        id: answer.id,
        action: answer.action === 'replaced' ? 'replaced' : 'added',
        audio: typeof answer.audio === 'string' ? answer.audio : '',
      }
    }
    return {
      ok: false,
      error: typeof answer.error === 'string' && answer.error ? answer.error : `Không đưa được bài vào danh mục (HTTP ${res.status}).`,
      exists: answer.exists === true,
    }
  } catch {
    return { ok: false, error: 'Không gọi được máy chủ dev. Hãy chạy bằng npm run dev (không phải bản build).', exists: false }
  }
}
