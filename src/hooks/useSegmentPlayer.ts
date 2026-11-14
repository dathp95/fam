import { useCallback, useEffect, useRef } from 'react'

/** Plays [start, end) ranges of an audio/video Blob through a detached media element. */
export function useSegmentPlayer(blob: Blob | null) {
  const elRef = useRef<HTMLMediaElement | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const el = document.createElement(blob.type.startsWith('video') ? 'video' : 'audio')
    el.preload = 'auto'
    if (el instanceof HTMLVideoElement) el.playsInline = true
    el.src = url
    elRef.current = el
    return () => {
      window.clearInterval(timer.current)
      el.pause()
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
      elRef.current = null
    }
  }, [blob])

  const stop = useCallback(() => {
    window.clearInterval(timer.current)
    elRef.current?.pause()
  }, [])

  const play = useCallback(
    (start: number, end: number, rate = 1) => {
      const el = elRef.current
      if (!el || end <= start) return
      window.clearInterval(timer.current)
      el.currentTime = start
      el.playbackRate = rate
      el.play().catch(() => {})
      timer.current = window.setInterval(() => {
        if (el.currentTime >= end || el.ended) {
          el.pause()
          window.clearInterval(timer.current)
        }
      }, 60)
    },
    [],
  )

  return { play, stop }
}
