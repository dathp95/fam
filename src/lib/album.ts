/** Pure helpers for moving between the pictures of the album detail view. */

/** Index after moving `delta` steps, kept inside 0..length-1 (no wrap-around). */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index + delta))
}

const MIN_SWIPE_PX = 60
/** A swipe must be clearly more horizontal than vertical, so scrolling the page does not flip pictures. */
const HORIZONTAL_RATIO = 1.5

/**
 * Direction of a finished touch: +1 = next picture (swipe left), -1 = previous (swipe right),
 * 0 = not a horizontal swipe.
 */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return 0
  return dx < 0 ? 1 : -1
}
