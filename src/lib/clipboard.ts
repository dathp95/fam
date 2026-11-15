/** Copy text to the clipboard. Returns true when it worked; never throws. */
export async function copyText(text: string): Promise<boolean> {
  // Modern API: needs a secure context (https or localhost) and a user gesture.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy way */
  }
  // Legacy fallback (plain http on a phone, some in-app browsers): select a hidden textarea and copy.
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
