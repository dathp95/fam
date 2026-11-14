/** Feature switches for the current development stage. */

/**
 * Show "Chọn nguồn bài" (uploading your own files, other sources) to everyone.
 * Off for now: only an admin adds lessons. Set to true to bring it back for all learners.
 */
export const SOURCE_PICKER_ENABLED = false

/** True when the query string has an `admin` parameter, e.g. "?admin". A convenience, not security. */
export const hasAdminParam = (search: string): boolean => new URLSearchParams(search).has('admin')

/** Whether Home shows the source picker (and the "Bài của bạn" section even when it is empty). */
export function isSourcePickerVisible(search: string, enabled: boolean = SOURCE_PICKER_ENABLED): boolean {
  return enabled || hasAdminParam(search)
}
