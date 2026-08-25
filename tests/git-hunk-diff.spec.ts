import { Text } from '@codemirror/state'
import { Chunk } from '@codemirror/merge'
import { describe, expect, it } from 'vitest'
import { buildGitHunkDiff, type GitHunkDiffRow } from '../src/client/git-hunk-diff.ts'

describe('Git local Unified Diff hunk', () => {
  it('renders modified lines with paired context and old/new line numbers', () => {
    const { original, current, chunks } = diff('one\ntwo\nthree\n', 'one\nTWO\nthree\n')
    const hunk = buildGitHunkDiff(original, current, chunks[0]!)

    expect(hunk.header).toBe('@@ -1,3 +1,3 @@')
    expect(withoutSegments(hunk.rows)).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'one' },
      { kind: 'removed', oldLine: 2, newLine: null, text: 'two' },
      { kind: 'added', oldLine: null, newLine: 2, text: 'TWO' },
      { kind: 'context', oldLine: 3, newLine: 3, text: 'three' },
    ])
    expect(hunk).toMatchObject({ additions: 1, deletions: 1 })
  })

  it('uses shifted new line numbers for a pure addition', () => {
    const { original, current, chunks } = diff(
      'one\ntwo\nthree\n',
      'one\nadded\ntwo\nthree\n',
    )
    const hunk = buildGitHunkDiff(original, current, chunks[0]!)

    expect(hunk.header).toBe('@@ -1,3 +1,4 @@')
    expect(withoutSegments(hunk.rows)).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'one' },
      { kind: 'added', oldLine: null, newLine: 2, text: 'added' },
      { kind: 'context', oldLine: 2, newLine: 3, text: 'two' },
      { kind: 'context', oldLine: 3, newLine: 4, text: 'three' },
    ])
  })

  it('uses shifted old line numbers for a pure deletion', () => {
    const { original, current, chunks } = diff(
      'one\nremoved\ntwo\nthree\n',
      'one\ntwo\nthree\n',
    )
    const hunk = buildGitHunkDiff(original, current, chunks[0]!)

    expect(hunk.header).toBe('@@ -1,4 +1,3 @@')
    expect(withoutSegments(hunk.rows)).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'one' },
      { kind: 'removed', oldLine: 2, newLine: null, text: 'removed' },
      { kind: 'context', oldLine: 3, newLine: 2, text: 'two' },
      { kind: 'context', oldLine: 4, newLine: 3, text: 'three' },
    ])
  })

  it('renders a multi-line replacement as removed rows followed by added rows', () => {
    const { original, current, chunks } = diff(
      'before\nold one\nold two\nafter\n',
      'before\nnew one\nnew two\nnew three\nafter\n',
    )
    const hunk = buildGitHunkDiff(original, current, chunks[0]!)

    expect(hunk.rows.filter(row => row.kind === 'removed').map(row => row.text)).toEqual([
      'old one',
      'old two',
    ])
    expect(hunk.rows.filter(row => row.kind === 'added').map(row => row.text)).toEqual([
      'new one',
      'new two',
      'new three',
    ])
    expect(hunk).toMatchObject({ additions: 3, deletions: 2 })
  })

  it('retains character-level ranges inside modified lines', () => {
    const { original, current, chunks } = diff(
      'const value = 123;\n',
      'const value = 456;\n',
    )
    const hunk = buildGitHunkDiff(original, current, chunks[0]!)
    const removed = hunk.rows.find(row => row.kind === 'removed')
    const added = hunk.rows.find(row => row.kind === 'added')

    expect(removed?.segments).toEqual([
      { kind: 'plain', text: 'const value = ' },
      { kind: 'changed', text: '123' },
      { kind: 'plain', text: ';' },
    ])
    expect(added?.segments).toEqual([
      { kind: 'plain', text: 'const value = ' },
      { kind: 'changed', text: '456' },
      { kind: 'plain', text: ';' },
    ])
  })

  it('preserves Unicode and whitespace-only character ranges', () => {
    const unicode = diff('状态：开启\n', '状态：关闭\n')
    const unicodeHunk = buildGitHunkDiff(unicode.original, unicode.current, unicode.chunks[0]!)
    expect(changedText(unicodeHunk.rows, 'removed')).toBe('开启')
    expect(changedText(unicodeHunk.rows, 'added')).toBe('关闭')

    const whitespace = diff('value = 1\n', 'value  = 1\n')
    const whitespaceHunk = buildGitHunkDiff(whitespace.original, whitespace.current, whitespace.chunks[0]!)
    expect(changedText(whitespaceHunk.rows, 'added')).toBe(' ')
  })

  it('uses zero-length hunk coordinates when one file side is empty', () => {
    const addition = diff('', 'new\n')
    const added = buildGitHunkDiff(addition.original, addition.current, addition.chunks[0]!)
    expect(added.header).toBe('@@ -0,0 +1,1 @@')
    expect(withoutSegments(added.rows)).toEqual([{ kind: 'added', oldLine: null, newLine: 1, text: 'new' }])

    const deletion = diff('old\n', '')
    const removed = buildGitHunkDiff(deletion.original, deletion.current, deletion.chunks[0]!)
    expect(removed.header).toBe('@@ -1,1 +0,0 @@')
    expect(withoutSegments(removed.rows)).toEqual([{ kind: 'removed', oldLine: 1, newLine: null, text: 'old' }])
  })

  it('stops context before a neighboring change chunk', () => {
    const originalText = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\n'
    const currentText = 'one\nTWO\nthree\nfour\nFIVE\nsix\nseven\n'
    const { original, current, chunks } = diff(originalText, currentText)
    expect(chunks).toHaveLength(2)

    const first = buildGitHunkDiff(original, current, chunks[0]!, undefined, chunks[1])
    expect(first.rows.map(row => row.text)).toEqual(['one', 'two', 'TWO', 'three', 'four'])
    expect(first.rows.some(row => row.text.toLowerCase() === 'five')).toBe(false)

    const second = buildGitHunkDiff(original, current, chunks[1]!, chunks[0])
    expect(second.rows.map(row => row.text)).toEqual(['three', 'four', 'five', 'FIVE', 'six', 'seven'])
    expect(second.rows.some(row => row.text.toLowerCase() === 'two')).toBe(false)
  })
})

function diff(originalText: string, currentText: string) {
  const original = Text.of(originalText.split('\n'))
  const current = Text.of(currentText.split('\n'))
  return { original, current, chunks: Chunk.build(original, current) }
}

function withoutSegments(rows: GitHunkDiffRow[]) {
  return rows.map(({ segments: _segments, ...row }) => row)
}

function changedText(rows: GitHunkDiffRow[], kind: 'removed' | 'added'): string {
  return rows
    .filter(row => row.kind === kind)
    .flatMap(row => row.segments)
    .filter(segment => segment.kind === 'changed')
    .map(segment => segment.text)
    .join('')
}
