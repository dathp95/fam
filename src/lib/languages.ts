/**
 * Language configuration. English is the only registered language for now.
 *
 * To add a language (e.g. Vietnamese), define a config with `makeTokenizer` and
 * register it in LANGUAGES:
 *
 *   const vi: LanguageConfig = {
 *     id: 'vi', name: 'Tiếng Việt', tts: 'vi-VN', hasDiacritics: true,
 *     tokenize: makeTokenizer(/[^\p{L}\p{N}'\s]/gu),
 *   }
 *
 * With `ignoreDiacritics`, "đẹp" and "dep" compare as equal.
 */

export interface TokenizeOptions {
  /** Compare words without accents/diacritics (only meaningful when hasDiacritics). */
  ignoreDiacritics?: boolean
}

export interface LanguageConfig {
  id: string
  /** Display name (Vietnamese UI). */
  name: string
  /** BCP-47 locale for speechSynthesis. */
  tts: string
  /** Whether this language uses diacritics that a learner may want to ignore. */
  hasDiacritics: boolean
  /** Split text into normalized comparison tokens. */
  tokenize: (text: string, options?: TokenizeOptions) => string[]
}

export function foldDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC')
}

/** Build a tokenizer: lowercase, unify apostrophes, replace chars matched by `drop` with spaces. */
export function makeTokenizer(drop: RegExp) {
  return (text: string, options: TokenizeOptions = {}): string[] => {
    const base = options.ignoreDiacritics ? foldDiacritics(text) : text
    return base
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(drop, ' ')
      .split(/\s+/)
      .filter(Boolean)
  }
}

const en: LanguageConfig = {
  id: 'en',
  name: 'English',
  tts: 'en-US',
  hasDiacritics: false,
  tokenize: makeTokenizer(/[^a-z0-9'\s]/g),
}

export const LANGUAGES: Record<string, LanguageConfig> = { en }

export const DEFAULT_LANGUAGE_ID = 'en'

export function getLanguage(id: string | undefined): LanguageConfig {
  return (id && LANGUAGES[id]) || LANGUAGES[DEFAULT_LANGUAGE_ID]
}
