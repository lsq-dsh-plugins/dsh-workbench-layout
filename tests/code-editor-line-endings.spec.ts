import { describe, expect, it } from 'vitest'
import {
  detectEditorLineEnding,
  normalizeEditorText,
  restoreEditorLineEndings,
} from '../src/client/editor-line-endings.ts'

describe('CodeEditor line endings', () => {
  it('compares CRLF files in CodeMirror canonical form without marking them changed', () => {
    const source = 'first\r\nsecond\r\n'
    expect(normalizeEditorText(source)).toBe('first\nsecond\n')
    expect(normalizeEditorText(source)).toBe(normalizeEditorText(source))
  })

  it('restores the original file line ending after a real editor change', () => {
    const source = 'first\r\nsecond\r\n'
    expect(detectEditorLineEnding(source)).toBe('\r\n')
    expect(restoreEditorLineEndings('first\nchanged\n', detectEditorLineEnding(source)))
      .toBe('first\r\nchanged\r\n')
  })
})
