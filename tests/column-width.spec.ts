// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_STORAGE_KEY,
  loadChatWidth,
  parseStoredChatWidth,
  resolveChatWidth,
  storeChatWidth,
} from '../src/client/column-width.ts'

afterEach(() => { window.localStorage.clear() })

describe('conversation column width', () => {
  it('uses a narrow default and protects both editor and conversation minimums', () => {
    expect(resolveChatWidth(CHAT_WIDTH_DEFAULT, 1600, 280)).toBe(440)
    expect(resolveChatWidth(900, 1600, 280)).toBe(680)
    expect(resolveChatWidth(680, 900, 280)).toBe(300)
  })

  it('accepts only bounded integer preferences and persists safely', () => {
    expect(parseStoredChatWidth('512')).toBe(512)
    expect(parseStoredChatWidth('900')).toBeUndefined()
    expect(parseStoredChatWidth('wide')).toBeUndefined()
    storeChatWidth(512)
    expect(window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY)).toBe('512')
    expect(loadChatWidth()).toBe(512)
  })
})
