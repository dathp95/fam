/**
 * Placeholder for the next step: automatic speech recognition (Whisper) in a Web Worker.
 * Not implemented yet. The worker (e.g. `transcribe.worker.ts`) should accept a
 * TranscribeRequest and post TranscribeResponse messages, so NewLesson can later offer
 * "tự động nhận dạng" instead of requiring a pasted transcript.
 */

export interface TranscribeRequest {
  type: 'transcribe'
  /** Mono 16 kHz PCM samples. */
  samples: Float32Array
  /** Language key from languages.ts. */
  langId: string
}

export interface TranscribedChunk {
  text: string
  start: number
  end: number
}

export type TranscribeResponse =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; chunks: TranscribedChunk[] }
  | { type: 'error'; message: string }
