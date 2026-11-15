/** Feature switches for the current development stage. */

/**
 * Show "Chọn nguồn bài" (uploading your own files, other sources) to everyone.
 * Off for now: only an admin adds lessons. Set to true to bring it back for all learners.
 */
export const SOURCE_PICKER_ENABLED = false

/** True when the query string has an `admin` parameter, e.g. "?admin". A convenience, not security. */
export const hasAdminParam = (search: string): boolean => new URLSearchParams(search).has('admin')

/**
 * Admin tools (source picker, edit/delete catalog lessons, publish to the catalog) exist only on the
 * dev server: `dev` is `import.meta.env.DEV`, false in every production build, so `?admin` does
 * nothing on a deployed site or on another machine. Components that must vanish from the bundle
 * write `import.meta.env.DEV && hasAdminParam(...)` inline, so the bundler can drop the code.
 */
export const isAdminMode = (search: string, dev: boolean = import.meta.env.DEV): boolean => dev && hasAdminParam(search)

/** Whether Home shows the source picker (and the "Bài của bạn" section even when it is empty). */
export function isSourcePickerVisible(
  search: string,
  enabled: boolean = SOURCE_PICKER_ENABLED,
  dev: boolean = import.meta.env.DEV,
): boolean {
  return enabled || isAdminMode(search, dev)
}
