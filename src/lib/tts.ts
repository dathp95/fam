/** speechSynthesis helpers (used for the built-in sample lesson). */

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function speak(text: string, locale: string, slow: boolean): boolean {
  if (!ttsSupported()) return false
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = locale
    u.rate = slow ? 0.65 : 0.95
    speechSynthesis.speak(u)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return
  try {
    speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}
