/** Shared domain types. */

export interface Sentence {
  id: string
  text: string
}

/** A sentence that maps to a time range inside an uploaded media file (seconds). */
export interface TimedSentence extends Sentence {
  start: number
  end: number
}

interface LessonBase {
  id: string
  title: string
  /** Key into LANGUAGES (see languages.ts). */
  langId: string
  createdAt: number
}

/** Built-in lesson read aloud by speechSynthesis. */
export interface SampleLesson extends LessonBase {
  kind: 'tts'
  sentences: Sentence[]
}

/** User lesson backed by an audio/video Blob stored separately in IndexedDB. */
export interface MediaLesson extends LessonBase {
  kind: 'media'
  duration: number
  sentences: TimedSentence[]
}

export type Level = 'A1' | 'A2'
export const LEVELS: readonly Level[] = ['A1', 'A2']

export interface SourceInfo {
  name: string
  url: string
  license: string
}

/** Lesson shipped with the app (public/lessons/index.json); audio is fetched by URL. */
export interface StaticLesson extends LessonBase {
  kind: 'static'
  /** Path relative to BASE_URL, e.g. "lessons/voa/l01.mp3". */
  audioUrl: string
  duration: number
  sentences: TimedSentence[]
  level: Level
  topic: string
  source: SourceInfo
  seriesId?: string
  /** Position inside the series (starts at 1). */
  order?: number
}

export type Lesson = SampleLesson | MediaLesson | StaticLesson

/** Where practice audio comes from: a stored file, a URL, or nothing (TTS). */
export type PlaybackSource = Blob | string | null

/** A lesson being created/edited in the review screen, before it is saved. */
export interface Draft {
  id: string
  title: string
  langId: string
  createdAt: number
  media: Blob
  duration: number
  sentences: TimedSentence[]
  /** How the timings were obtained (shown as a hint in the review screen). */
  timing: 'snapped' | 'estimated' | 'saved'
}
