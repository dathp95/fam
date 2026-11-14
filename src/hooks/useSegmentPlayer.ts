import { useCallback, useEffect, useRef } from 'react'
import { isVideoUrl } from '../lib/media.ts'
import type { PlaybackSource } from '../lib/types.ts'

/**
 * Plays [start, end) ranges of an audio/video source through a detached media element.
 * A Blob is played through a temporary object URL; a string is used directly as `src`
 * (the caller resolves BASE_URL) and nothing is created or revoked.
 */
export function useSegmentPlayer(source: PlaybackSource) {
  const elRef = useRef<HTMLMediaElement | null>(null)
  const timer = useRef<number | undefined>(undefined)
  /** Cancels a pending "wait for metadata" listener, if any. */
  const cancelPending = useRef<(() => void) | null>(null)

  const clearPending = useCallback(() => {
    cancelPending.current?.()
    cancelPending.current = null
  }, [])

  useEffect(() => {
    if (!source) return
    const isBlob = typeof source !== 'string'
    const url = isBlob ? URL.createObjectURL(source) : source
    const isVideo = isBlob ? source.type.startsWith('video') : isVideoUrl(source)
    const el = document.createElement(isVideo ? 'video' : 'audio')
    el.preload = 'auto'
    if (el instanceof HTMLVideoElement) el.playsInline = true
    el.src = url
    elRef.current = el
    return () => {
      clearPending()
      window.clearInterval(timer.current)
      el.pause()
      el.removeAttribute('src')
      el.load()
      if (isBlob) URL.revokeObjectURL(url)
      elRef.current = null
    }
  }, [source, clearPending])

  const stop = useCallback(() => {
    clearPending()
    window.clearInterval(timer.current)
    elRef.current?.pause()
  }, [clearPending])

  const play = useCallback(
    (start: number, end: number, rate = 1) => {
      const el = elRef.current
      if (!el || end <= start) return
      clearPending()
      window.clearInterval(timer.current)

      const run = () => {
        el.currentTime = start
        el.playbackRate = rate
        el.play().catch(() => {})
        timer.current = window.setInterval(() => {
          if (el.currentTime >= end || el.ended) {
            el.pause()
            window.clearInterval(timer.current)
          }
        }, 60)
      }

      if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
        const onReady = () => {
          cancelPending.current = null
          run()
        }
        el.addEventListener('loadedmetadata', onReady, { once: true })
        cancelPending.current = () => el.removeEventListener('loadedmetadata', onReady)
      } else {
        run()
      }
    },
    [clearPending],
  )

  return { play, stop }
}
