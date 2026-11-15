/** Export / import of the learner's progress as a small JSON file (pure; the UI does the file work). */

import { parseProgress, type Progress } from './progress.ts'

export const BACKUP_APP = 'fam'
export const BACKUP_KIND = 'progress'
export const BACKUP_VERSION = 1
/** Larger files are refused before parsing (a real backup is a few KB). */
export const MAX_BACKUP_BYTES = 1024 * 1024

export type BackupResult = { ok: true; progress: Progress } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** The backup file content (pretty-printed JSON). */
export function exportProgress(p: Progress, now: Date = new Date()): string {
  return (
    JSON.stringify(
      { app: BACKUP_APP, kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(), progress: p },
      null,
      2,
    ) + '\n'
  )
}

/** "fam-progress-2026-11-15.json" (local date). */
export function backupFileName(now: Date = new Date()): string {
  return `fam-progress-${now.toLocaleDateString('en-CA')}.json`
}

/** Validate a backup file's text. The progress is sanitised the same way as data read from localStorage. */
export function parseBackup(text: string): BackupResult {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    return fail('File quá lớn (tối đa 1 MB). Đây không phải file sao lưu của FAM.')
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('File không đọc được: không phải JSON hợp lệ.')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('Đây không phải file sao lưu tiến độ của FAM.')
  }
  const file = raw as Record<string, unknown>
  if (file.app !== BACKUP_APP || file.kind !== BACKUP_KIND) {
    return fail('Đây không phải file sao lưu tiến độ của FAM.')
  }
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) {
    return fail('File sao lưu thiếu hoặc sai số phiên bản.')
  }
  if (file.version > BACKUP_VERSION) {
    return fail('File sao lưu được tạo bởi phiên bản FAM mới hơn. Hãy cập nhật ứng dụng rồi thử lại.')
  }
  if (typeof file.progress !== 'object' || file.progress === null || Array.isArray(file.progress)) {
    return fail('File sao lưu không có dữ liệu tiến độ.')
  }
  return { ok: true, progress: parseProgress(file.progress) }
}
