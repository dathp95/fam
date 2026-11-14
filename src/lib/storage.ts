/** IndexedDB persistence for lessons and their media files (via `idb`). */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { MediaLesson } from './types.ts'

interface DlwDB extends DBSchema {
  lessons: { key: string; value: MediaLesson }
  media: { key: string; value: Blob }
}

let dbPromise: Promise<IDBPDatabase<DlwDB>> | null = null

function db() {
  dbPromise ??= openDB<DlwDB>('dlw', 1, {
    upgrade(d) {
      d.createObjectStore('lessons', { keyPath: 'id' })
      d.createObjectStore('media')
    },
  })
  return dbPromise
}

/** Ask the browser not to evict our data (best effort). */
export function requestPersistence(): void {
  void navigator.storage?.persist?.().catch(() => {})
}

export async function listLessons(): Promise<MediaLesson[]> {
  const all = await (await db()).getAll('lessons')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

/** Save lesson metadata and its media file atomically. */
export async function saveLesson(lesson: MediaLesson, media: Blob): Promise<void> {
  const d = await db()
  const tx = d.transaction(['lessons', 'media'], 'readwrite')
  await Promise.all([tx.objectStore('lessons').put(lesson), tx.objectStore('media').put(media, lesson.id), tx.done])
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  return (await db()).get('media', id)
}

export async function deleteLesson(id: string): Promise<void> {
  const d = await db()
  const tx = d.transaction(['lessons', 'media'], 'readwrite')
  await Promise.all([tx.objectStore('lessons').delete(id), tx.objectStore('media').delete(id), tx.done])
}
