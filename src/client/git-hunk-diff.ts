import type { Text } from '@codemirror/state'
import type { Chunk } from '@codemirror/merge'

export type GitHunkDiffRowKind = 'context' | 'removed' | 'added'
export type GitHunkDiffSegmentKind = 'plain' | 'changed'

export interface GitHunkDiffSegment {
  kind: GitHunkDiffSegmentKind
  text: string
}

export interface GitHunkDiffRow {
  kind: GitHunkDiffRowKind
  oldLine: number | null
  newLine: number | null
  text: string
  segments: GitHunkDiffSegment[]
}

export interface GitHunkDiff {
  header: string
  rows: GitHunkDiffRow[]
  additions: number
  deletions: number
}

interface ChangedLineRange {
  start: number
  count: number
}

interface CharacterRange {
  from: number
  to: number
}

/** Build one Unified Diff hunk with context, paired line numbers, and character ranges. */
export function buildGitHunkDiff(
  original: Text,
  current: Text,
  chunk: Chunk,
  previous?: Chunk,
  next?: Chunk,
  contextLines = 3,
): GitHunkDiff {
  const originalLines = contentLines(original.toString())
  const currentLines = contentLines(current.toString())
  const oldRange = changedLineRange(original, chunk.fromA, chunk.toA)
  const newRange = changedLineRange(current, chunk.fromB, chunk.toB)
  const previousOld = previous === undefined ? undefined : changedLineRange(original, previous.fromA, previous.toA)
  const previousNew = previous === undefined ? undefined : changedLineRange(current, previous.fromB, previous.toB)
  const nextOld = next === undefined ? undefined : changedLineRange(original, next.fromA, next.toA)
  const nextNew = next === undefined ? undefined : changedLineRange(current, next.fromB, next.toB)
  const oldCharacterRanges = chunk.changes.map(change => ({
    from: chunk.fromA + change.fromA,
    to: chunk.fromA + change.toA,
  }))
  const newCharacterRanges = chunk.changes.map(change => ({
    from: chunk.fromB + change.fromB,
    to: chunk.fromB + change.toB,
  }))
  const beforeCount = boundedContext(
    contextLines,
    oldRange.start - 1,
    newRange.start - 1,
    previousOld === undefined ? Infinity : oldRange.start - rangeAfter(previousOld),
    previousNew === undefined ? Infinity : newRange.start - rangeAfter(previousNew),
  )
  const oldAfter = rangeAfter(oldRange)
  const newAfter = rangeAfter(newRange)
  const afterCount = boundedContext(
    contextLines,
    originalLines.length - oldAfter + 1,
    currentLines.length - newAfter + 1,
    nextOld === undefined ? Infinity : nextOld.start - oldAfter,
    nextNew === undefined ? Infinity : nextNew.start - newAfter,
  )
  const rows: GitHunkDiffRow[] = []

  for (let offset = beforeCount; offset > 0; offset--) {
    const oldLine = oldRange.start - offset
    const newLine = newRange.start - offset
    rows.push({
      kind: 'context',
      oldLine,
      newLine,
      text: currentLines[newLine - 1] ?? originalLines[oldLine - 1] ?? '',
      segments: [{ kind: 'plain', text: currentLines[newLine - 1] ?? originalLines[oldLine - 1] ?? '' }],
    })
  }
  for (let offset = 0; offset < oldRange.count; offset++) {
    const oldLine = oldRange.start + offset
    rows.push(changedRow('removed', original, oldLine, oldCharacterRanges))
  }
  for (let offset = 0; offset < newRange.count; offset++) {
    const newLine = newRange.start + offset
    rows.push(changedRow('added', current, newLine, newCharacterRanges))
  }
  for (let offset = 0; offset < afterCount; offset++) {
    const oldLine = oldAfter + offset
    const newLine = newAfter + offset
    rows.push({
      kind: 'context',
      oldLine,
      newLine,
      text: currentLines[newLine - 1] ?? originalLines[oldLine - 1] ?? '',
      segments: [{ kind: 'plain', text: currentLines[newLine - 1] ?? originalLines[oldLine - 1] ?? '' }],
    })
  }

  const oldCount = rows.reduce((count, row) => count + (row.oldLine === null ? 0 : 1), 0)
  const newCount = rows.reduce((count, row) => count + (row.newLine === null ? 0 : 1), 0)
  const oldStart = rows.find(row => row.oldLine !== null)?.oldLine ?? Math.max(0, oldRange.start - 1)
  const newStart = rows.find(row => row.newLine !== null)?.newLine ?? Math.max(0, newRange.start - 1)
  return {
    header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    rows,
    additions: newRange.count,
    deletions: oldRange.count,
  }
}

function changedRow(
  kind: 'removed' | 'added',
  document: Text,
  lineNumber: number,
  characterRanges: readonly CharacterRange[],
): GitHunkDiffRow {
  const line = document.line(lineNumber)
  return {
    kind,
    oldLine: kind === 'removed' ? lineNumber : null,
    newLine: kind === 'added' ? lineNumber : null,
    text: line.text,
    segments: lineSegments(document, lineNumber, characterRanges),
  }
}

function lineSegments(
  document: Text,
  lineNumber: number,
  characterRanges: readonly CharacterRange[],
): GitHunkDiffSegment[] {
  const line = document.line(lineNumber)
  const ranges = characterRanges
    .map(range => ({ from: Math.max(line.from, range.from), to: Math.min(line.to, range.to) }))
    .filter(range => range.from < range.to)
    .sort((left, right) => left.from - right.from || left.to - right.to)
  if (ranges.length === 0) return [{ kind: 'plain', text: line.text }]
  const segments: GitHunkDiffSegment[] = []
  let position = line.from
  for (const range of ranges) {
    if (range.from > position) {
      segments.push({ kind: 'plain', text: document.sliceString(position, range.from) })
    }
    const changedFrom = Math.max(position, range.from)
    if (range.to > changedFrom) {
      segments.push({ kind: 'changed', text: document.sliceString(changedFrom, range.to) })
    }
    position = Math.max(position, range.to)
  }
  if (position < line.to) segments.push({ kind: 'plain', text: document.sliceString(position, line.to) })
  return segments
}

function changedLineRange(document: Text, from: number, to: number): ChangedLineRange {
  const boundedFrom = Math.min(from, document.length)
  const text = document.sliceString(boundedFrom, Math.min(to, document.length))
  return {
    start: document.lineAt(boundedFrom).number,
    count: contentLines(text).length,
  }
}

function rangeAfter(range: ChangedLineRange): number {
  return range.start + range.count
}

function boundedContext(limit: number, ...available: number[]): number {
  return Math.max(0, Math.min(Math.max(0, limit), ...available))
}

function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}
