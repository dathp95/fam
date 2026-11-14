import { describe, expect, it } from 'vitest'
import { hasAdminParam, isSourcePickerVisible, SOURCE_PICKER_ENABLED } from './features.ts'

describe('hasAdminParam', () => {
  it('detects the admin parameter, with or without a value', () => {
    expect(hasAdminParam('?admin')).toBe(true)
    expect(hasAdminParam('?admin=1')).toBe(true)
    expect(hasAdminParam('?x=1&admin')).toBe(true)
  })

  it('is false without it', () => {
    expect(hasAdminParam('')).toBe(false)
    expect(hasAdminParam('?')).toBe(false)
    expect(hasAdminParam('?administrator=1')).toBe(false)
    expect(hasAdminParam('?user=admin')).toBe(false)
  })
})

describe('isSourcePickerVisible', () => {
  it('is hidden by default for regular learners', () => {
    expect(SOURCE_PICKER_ENABLED).toBe(false)
    expect(isSourcePickerVisible('')).toBe(false)
  })

  it('is shown to an admin even while the switch is off', () => {
    expect(isSourcePickerVisible('?admin')).toBe(true)
  })

  it('is shown to everyone when the switch is on', () => {
    expect(isSourcePickerVisible('', true)).toBe(true)
    expect(isSourcePickerVisible('?admin', true)).toBe(true)
  })
})
