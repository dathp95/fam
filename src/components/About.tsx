import { useRef, useState } from 'react'
import { exportProgressFile, readBackupFile } from '../lib/backupFile.ts'
import type { Progress } from '../lib/progress.ts'
import { ABOUT, BACKUP, CONTACT_EMAIL, INSTALL_HINT, mailto } from '../lib/siteInfo.ts'

interface Props {
  onBack: () => void
  onDonate: () => void
  progress: Progress
  /** Replace the current progress with the imported one (already validated). */
  onImportProgress: (p: Progress) => void
}

const external = { target: '_blank', rel: 'noreferrer noopener' } as const

export function About({ onBack, onDonate, progress, onImportProgress }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function exportFile() {
    try {
      const outcome = await exportProgressFile(progress)
      if (outcome === 'downloaded') setMessage({ ok: true, text: BACKUP.exported })
      else if (outcome === 'shared') setMessage({ ok: true, text: BACKUP.shared })
    } catch {
      setMessage({ ok: false, text: 'Không xuất được file.' })
    }
  }

  async function importFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '' // allow choosing the same file again
    if (!file) return
    const result = await readBackupFile(file)
    if (!result.ok) return setMessage({ ok: false, text: result.error })
    if (!window.confirm(BACKUP.confirmImport)) return
    onImportProgress(result.progress)
    setMessage({ ok: true, text: BACKUP.imported })
  }

  return (
    <div className="stack">
      <button className="btn link" onClick={onBack}>
        ← Quay lại
      </button>
      <h2>{ABOUT.title}</h2>
      <section className="card stack">
        <p>{ABOUT.intro}</p>
        <p>{ABOUT.nonProfit}</p>
      </section>
      <section className="card stack" aria-labelledby="sources-heading">
        <h3 id="sources-heading">{ABOUT.sourcesTitle}</h3>
        <p>
          {ABOUT.lessonSource.text}{' '}
          <a href={ABOUT.lessonSource.url} {...external}>
            {ABOUT.lessonSource.linkLabel}
          </a>
        </p>
        <p>
          {ABOUT.pictureSource.text}{' '}
          <a href={ABOUT.pictureSource.url} {...external}>
            {ABOUT.pictureSource.linkLabel}
          </a>
        </p>
        <p className="muted">{ABOUT.creditNote}</p>
      </section>
      <section className="card stack" aria-labelledby="backup-heading">
        <h3 id="backup-heading">{BACKUP.title}</h3>
        <div className="backup-actions">
          <button className="btn" onClick={() => void exportFile()}>
            {BACKUP.exportButton}
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            {BACKUP.importButton}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
        </div>
        {message && (
          <p className={message.ok ? 'status' : 'err'} role="status">
            {message.text}
          </p>
        )}
        <p className="muted">
          {BACKUP.noteVi}
          <br />
          <span lang="en">{BACKUP.noteEn}</span>
        </p>
        <p className="muted">
          {INSTALL_HINT.android}
          <br />
          {INSTALL_HINT.iphone}
        </p>
      </section>
      <p>
        {ABOUT.contactLabel} <a href={mailto()}>{CONTACT_EMAIL}</a>
      </p>
      <div className="row">
        <button className="btn primary" onClick={onDonate}>
          {ABOUT.donateButton}
        </button>
      </div>
    </div>
  )
}
