import { RangeSet, StateField, Text, type Extension, type Range } from '@codemirror/state'
import { Chunk, type DiffConfig } from '@codemirror/merge'
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  type DecorationSet,
} from '@codemirror/view'
import { normalizeEditorText } from './editor-line-endings.ts'

export type GitLineChangeKind = 'added' | 'modified' | 'deleted'

interface GitLineDecorationState {
  chunks: readonly Chunk[]
  decorations: DecorationSet
  markers: RangeSet<GutterMarker>
}

const DIFF_CONFIG: DiffConfig = { scanLimit: 1_000, timeout: 100 }

class GitLineMarker extends GutterMarker {
  override readonly elementClass: string

  constructor(readonly kind: GitLineChangeKind) {
    super()
    this.elementClass = markerClass(kind)
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof GitLineMarker && other.kind === this.kind
  }

}

const MARKERS: Record<GitLineChangeKind, GitLineMarker> = {
  added: new GitLineMarker('added'),
  modified: new GitLineMarker('modified'),
  deleted: new GitLineMarker('deleted'),
}

/** Editable CodeMirror decorations comparing the current buffer with one Git HEAD baseline. */
export function gitLineDecorations(original: string | null): Extension {
  const originalDocument = original === null
    ? null
    : Text.of(normalizeEditorText(original).split('\n'))
  const field = StateField.define<GitLineDecorationState>({
    create(state) {
      return originalDocument === null
        ? emptyDecorationState()
        : decorationState(Chunk.build(originalDocument, state.doc, DIFF_CONFIG), state.doc)
    },
    update(value, transaction) {
      if (originalDocument === null || !transaction.docChanged) return value
      const chunks = Chunk.updateB(value.chunks, originalDocument, transaction.state.doc, transaction.changes, DIFF_CONFIG)
      return decorationState(chunks, transaction.state.doc)
    },
    provide: source => EditorView.decorations.from(source, value => value.decorations),
  })
  return [
    field,
    gutter({
      class: 'cm-gitChangeGutter',
      markers: view => view.state.field(field).markers,
    }),
    gitLineTheme,
  ]
}

function emptyDecorationState(): GitLineDecorationState {
  return { chunks: [], decorations: Decoration.none, markers: RangeSet.empty }
}

function decorationState(chunks: readonly Chunk[], document: Text): GitLineDecorationState {
  const decorations: Array<Range<Decoration>> = []
  const markerKinds = new Map<number, GitLineChangeKind>()
  for (const chunk of chunks) {
    const kind = changeKind(chunk)
    if (kind === 'deleted') {
      mergeMarker(markerKinds, deletionMarkerPosition(document, chunk.fromB), kind)
      continue
    }
    forEachChangedLine(document, chunk.fromB, chunk.endB, (lineFrom) => {
      decorations.push(Decoration.line({ class: kind === 'added' ? 'cm-gitLineAdded' : 'cm-gitLineModified' }).range(lineFrom))
      mergeMarker(markerKinds, lineFrom, kind)
    })
    for (const change of chunk.changes) {
      const from = chunk.fromB + change.fromB
      const to = chunk.fromB + change.toB
      if (from < to) {
        decorations.push(Decoration.mark({ class: kind === 'added' ? 'cm-gitTextAdded' : 'cm-gitTextModified' }).range(from, to))
      }
    }
  }
  const markers = [...markerKinds.entries()].map(([position, kind]) => MARKERS[kind].range(position))
  return {
    chunks,
    decorations: Decoration.set(decorations, true),
    markers: RangeSet.of(markers, true),
  }
}

function changeKind(chunk: Chunk): GitLineChangeKind {
  if (chunk.fromB === chunk.toB) return 'deleted'
  return chunk.fromA === chunk.toA ? 'added' : 'modified'
}

function forEachChangedLine(document: Text, from: number, to: number, visit: (lineFrom: number) => void): void {
  if (from === to) return
  let line = document.lineAt(Math.min(from, document.length))
  for (;;) {
    visit(line.from)
    if (line.to >= Math.min(to, document.length) || line.number >= document.lines) return
    line = document.line(line.number + 1)
  }
}

function deletionMarkerPosition(document: Text, position: number): number {
  if (document.length === 0) return 0
  return document.lineAt(Math.min(position, document.length)).from
}

function mergeMarker(target: Map<number, GitLineChangeKind>, position: number, kind: GitLineChangeKind): void {
  const current = target.get(position)
  if (current === undefined || markerPriority(kind) > markerPriority(current)) target.set(position, kind)
}

function markerPriority(kind: GitLineChangeKind): number {
  switch (kind) {
    case 'modified': return 1
    case 'added': return 2
    case 'deleted': return 3
  }
}

function markerClass(kind: GitLineChangeKind): string {
  switch (kind) {
    case 'added': return 'cm-gitAddedLineGutter'
    case 'modified': return 'cm-gitModifiedLineGutter'
    case 'deleted': return 'cm-gitDeletedLineGutter'
  }
}

const gitLineTheme = EditorView.theme({
  '.cm-gitChangeGutter': {
    width: '5px',
    minWidth: '5px',
    backgroundColor: 'var(--dsw-alias-bg-base)',
    borderRight: '0',
  },
  '.cm-gitChangeGutter .cm-gutterElement': {
    boxSizing: 'border-box',
    width: '5px',
    minWidth: '5px',
    padding: '0',
  },
  '.cm-gitAddedLineGutter': {
    background: 'var(--dsw-alias-state-success-primary)',
  },
  '.cm-gitModifiedLineGutter': {
    background: 'var(--dsw-alias-state-business-primary)',
  },
  '.cm-gitDeletedLineGutter': {
    position: 'relative',
  },
  '.cm-gitDeletedLineGutter::after': {
    content: '""',
    position: 'absolute',
    insetInlineStart: '0',
    insetBlockStart: '-3px',
    width: '0',
    height: '0',
    borderBlock: '3px solid transparent',
    borderInlineStart: '5px solid var(--dsw-alias-state-error-primary)',
  },
  '.cm-gitLineAdded': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent)',
  },
  '.cm-gitLineModified': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent)',
  },
  '.cm-gitTextAdded': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent)',
  },
  '.cm-gitTextModified': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)',
  },
})
