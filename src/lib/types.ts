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

export type Lesson = SampleLesson | MediaLesson

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
