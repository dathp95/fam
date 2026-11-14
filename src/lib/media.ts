/** Reading uploaded audio/video: duration and silence analysis. */

import { findSilences } from './segment.ts'

/** True for video files (decided by extension when the source is a URL). */
export const isVideoUrl = (url: string): boolean => /\.(?:mp4|webm)(?:[?#].*)?$/i.test(url)

/** Hard limit for uploads (seconds). */
export const MAX_DURATION_SEC = 600

export interface MediaAnalysis {
  duration: number
  /** Silence midpoints in seconds; empty if the audio could not be decoded. */
  silences: number[]
}

function elementDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const el = document.createElement(blob.type.startsWith('video') ? 'video' : 'audio')
    const done = () => {
      el.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      const d = el.duration
      done()
      resolve(d)
    }
    el.onerror = () => {
      done()
      reject(new Error('Không đọc được file này.'))
    }
    el.src = url
  })
}

async function decode(blob: Blob): Promise<AudioBuffer | null> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer())
  } catch {
    return null
  } finally {
    void ctx.close()
  }
}

/** Validate length (≤ 10 min) and detect silences. Throws Vietnamese error messages. */
export async function analyzeMedia(blob: Blob): Promise<MediaAnalysis> {
  let duration = await elementDuration(blob).catch((e: unknown) => {
    throw e instanceof Error ? e : new Error('Không đọc được file này.')
  })
  if (Number.isFinite(duration) && duration > MAX_DURATION_SEC) {
    throw new Error('File dài hơn 10 phút. Hãy dùng file ngắn khoảng 5 phút.')
  }
  const decoded = await decode(blob)
  if (!Number.isFinite(duration) || duration <= 0) duration = decoded?.duration ?? NaN
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Không xác định được độ dài file.')
  }
  if (duration > MAX_DURATION_SEC) {
    throw new Error('File dài hơn 10 phút. Hãy dùng file ngắn khoảng 5 phút.')
  }
  const silences = decoded ? findSilences(decoded.getChannelData(0), decoded.sampleRate) : []
  return { duration, silences }
}
