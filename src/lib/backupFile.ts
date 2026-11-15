/** Browser side of the progress backup: share sheet or download, and reading a chosen file. */

import { backupFileName, exportProgress, MAX_BACKUP_BYTES, parseBackup, type BackupResult } from './backup.ts'
import type { Progress } from './progress.ts'

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Share sheet where files can be shared (iPhone: "Save to Files"), otherwise a normal download. */
export async function exportProgressFile(p: Progress, now: Date = new Date()): Promise<ExportOutcome> {
  const text = exportProgress(p, now)
  const name = backupFileName(now)
  const file = new File([text], name, { type: 'application/json' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason: fall back to a download below.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

/** Read and validate a backup file chosen by the learner. */
export async function readBackupFile(file: File): Promise<BackupResult> {
  if (file.size > MAX_BACKUP_BYTES) return parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)) // same "too large" error
  try {
    return parseBackup(await file.text())
  } catch {
    return { ok: false, error: 'Không đọc được file này.' }
  }
}
