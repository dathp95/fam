/** Service worker registration (production only) and the "new version" signal for the UpdateBanner. */

const UPDATE_EVENT = 'fam:sw-update'

let waiting: ServiceWorker | null = null
let reloadRequested = false

/** A new worker is installed and waiting for the learner to accept it. */
export const hasWaitingUpdate = () => waiting !== null

export const onUpdateAvailable = (listener: () => void): (() => void) => {
  window.addEventListener(UPDATE_EVENT, listener)
  return () => window.removeEventListener(UPDATE_EVENT, listener)
}

function setWaiting(worker: ServiceWorker) {
  waiting = worker
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

/** Ask the waiting worker to take over; the page reloads once it has (see registerServiceWorker). */
export function applyUpdate(): void {
  if (!waiting) return
  reloadRequested = true
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

/** Register `<BASE_URL>sw.js`. Does nothing in development (it would break HMR) or without support. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        // A worker may already be waiting from a previous visit.
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting)
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker)
          })
        })
      })
      .catch(() => {
        /* offline support is optional: the app works without it */
      })
  })
  // Reload only when the learner asked for the update, never on its own (e.g. during practice).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) window.location.reload()
  })
}
