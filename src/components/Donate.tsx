import { useState } from 'react'
import { assetUrl } from '../lib/catalog.ts'
import { copyText } from '../lib/clipboard.ts'
import { CONTACT_EMAIL, DONATE, mailto, QR_IMAGE, TRANSFER_NOTE } from '../lib/siteInfo.ts'

export function Donate({ onBack }: { onBack: () => void }) {
  const [qrFailed, setQrFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyNote() {
    if (await copyText(TRANSFER_NOTE)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
        <DetailLines lines={DONATE.detailsVi} />
        <DetailLines lines={DONATE.detailsEn} lang="en" muted />
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

/** Each line on its own row. */
function DetailLines({ lines, lang, muted }: { lines: readonly string[]; lang?: string; muted?: boolean }) {
  return (
    <p lang={lang} className={muted ? 'muted' : undefined}>
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block' }}>
          {line}
        </span>
      ))}
    </p>
  )
}
