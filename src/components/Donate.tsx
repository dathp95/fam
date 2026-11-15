import { useState } from 'react'
import { assetUrl } from '../lib/catalog.ts'
import { CONTACT_EMAIL, DONATE, mailto, QR_IMAGE, TRANSFER_NOTE } from '../lib/siteInfo.ts'

export function Donate({ onBack }: { onBack: () => void }) {
  const [qrFailed, setQrFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(TRANSFER_NOTE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard not available: stay silent */
    }
  }

  return (
    <div className="stack">
      <button className="btn link" onClick={onBack}>
        ← Quay lại
      </button>
      <h2>{DONATE.title}</h2>
      <p>{DONATE.vi}</p>
      <p lang="en">{DONATE.en}</p>
      {qrFailed ? (
        <p className="muted donate-center">
          {DONATE.qrMissingVi}
          <br />
          {DONATE.qrMissingEn}
        </p>
      ) : (
        <img className="donate-qr" src={assetUrl(QR_IMAGE)} alt={DONATE.qrAlt} onError={() => setQrFailed(true)} />
      )}
      <div className="stack donate-center">
        <p>
          {DONATE.accountVi}
          <br />
          {DONATE.noteVi}
        </p>
        <p lang="en" className="muted">
          {DONATE.accountEn}
          <br />
          {DONATE.noteEn}
        </p>
        <div className="row donate-center">
          <button className="btn" onClick={() => void copyNote()}>
            {DONATE.copyButton}
          </button>
          {copied && (
            <span className="status" role="status">
              {DONATE.copied}
            </span>
          )}
        </div>
      </div>
      <p>
        {DONATE.contactLabel} <a href={mailto()}>{CONTACT_EMAIL}</a>
      </p>
    </div>
  )
}
