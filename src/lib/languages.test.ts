import { describe, expect, it } from 'vitest'
import { foldDiacritics, getLanguage } from './languages.ts'

const en = getLanguage('en')

describe('English tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(en.tokenize('Hello, World! How are you?')).toEqual(['hello', 'world', 'how', 'are', 'you'])
  })

  it('normalizes curly apostrophes', () => {
    expect(en.tokenize('I don’t know, it‘s fine')).toEqual(['i', "don't", 'know', "it's", 'fine'])
    expect(en.tokenize('don’t')).toEqual(en.tokenize("don't"))
  })

  it('keeps digits and collapses whitespace', () => {
    expect(en.tokenize('  At   6\n am ')).toEqual(['at', '6', 'am'])
  })

  it('returns [] for text with no words', () => {
    expect(en.tokenize('... !? —')).toEqual([])
    expect(en.tokenize('')).toEqual([])
  })

  it('optionally ignores diacritics', () => {
    expect(en.tokenize('café', { ignoreDiacritics: true })).toEqual(['cafe'])
  })
})

describe('getLanguage / foldDiacritics', () => {
  it('falls back to English for unknown ids', () => {
    expect(getLanguage('xx').id).toBe('en')
    expect(getLanguage(undefined).id).toBe('en')
  })

  it('folds Vietnamese diacritics including đ', () => {
    expect(foldDiacritics('Đẹp quá')).toBe('Dep qua')
  })
})
