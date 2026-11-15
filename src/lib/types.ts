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

/** Where a picture comes from. `text` is shown as-is (Vietnamese); `url` is the museum page. */
export interface PictureCredit {
  text: string
  url: string
}

/** Short Vietnamese commentary on a picture, shown once it is complete. */
export interface PictureCommentary {
  /** What is happening in the scene. */
  story: string
  /** How the artist shows it / what to notice. */
  view: string
  /** One-sentence life lesson. Stored WITHOUT the "Rút ra" label (the UI adds it). */
  takeaway: string
}

/** A public-domain artwork the learner uncovers tile by tile (public/pictures/index.json). */
export interface Picture {
  /** "met-<objectId>" */
  id: string
  title: string
  /** "Artist · date", shown (muted) under the title of a completed picture. Optional. */
  byline?: string
  image: {
    /** Path relative to BASE_URL, e.g. "pictures/met-39799.webp". */
    src: string
    width: number
    height: number
    /** Vietnamese description for screen readers. */
    alt: string
    credit: PictureCredit
  }
  /** Vietnamese sentences about the artwork, shown once the picture is complete. No dimensions. */
  description: string[]
  /** Story / view / takeaway, shown after the description once the picture is complete. */
  commentary: PictureCommentary
  /** English A1 sentences (present simple, ≤ 10 words) used by the bonus dictation lesson. */
  intro: string[]
}

/** The picture the learner is uncovering now. */
export interface PictureProgress {
  id: string
  /** Tiles opened so far, 0..PICTURE_TILES. */
  opened: number
  /** Random permutation of 0..PICTURE_TILES-1: the n-th pass opens tile order[n-1]. */
  order: number[]
}

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
