import { describe, expect, it } from 'vitest'
import { unifiedDiffOptions } from '../src/client/DiffSurface.tsx'

describe('full-file Diff surface modes', () => {
  it('keeps Unified rows separate and enables character-inline rendering only in Inline mode', () => {
    expect(unifiedDiffOptions('unified', 'before')).toMatchObject({
      original: 'before',
      allowInlineDiffs: false,
      highlightChanges: true,
      gutter: true,
    })
    expect(unifiedDiffOptions('inline', 'before')).toMatchObject({
      original: 'before',
      allowInlineDiffs: true,
      highlightChanges: true,
      gutter: true,
    })
  })
})
