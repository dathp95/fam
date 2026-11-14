import { describe, expect, it } from 'vitest'
import { isVideoUrl } from './media.ts'

describe('isVideoUrl', () => {
  it('treats .mp4 and .webm as video, ignoring case and query strings', () => {
    expect(isVideoUrl('lessons/a.mp4')).toBe(true)
    expect(isVideoUrl('lessons/A.WEBM')).toBe(true)
    expect(isVideoUrl('lessons/a.mp4?v=2')).toBe(true)
    expect(isVideoUrl('/fam/lessons/a.webm#t=3')).toBe(true)
  })

  it('treats everything else as audio', () => {
    expect(isVideoUrl('lessons/a.mp3')).toBe(false)
    expect(isVideoUrl('lessons/a.m4a')).toBe(false)
    expect(isVideoUrl('lessons/amp4')).toBe(false)
    expect(isVideoUrl('lessons/mp4/a.mp3')).toBe(false)
  })
})
