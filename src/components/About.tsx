import { ABOUT, CONTACT_EMAIL, mailto } from '../lib/siteInfo.ts'

interface Props {
  onBack: () => void
  onDonate: () => void
}

const external = { target: '_blank', rel: 'noreferrer noopener' } as const

export function About({ onBack, onDonate }: Props) {
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
