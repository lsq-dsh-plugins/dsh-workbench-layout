import { RangeSet, StateEffect, StateField, Text, Transaction, type Extension } from '@codemirror/state'
import { Chunk, type DiffConfig } from '@codemirror/merge'
import {
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  showTooltip,
  type Tooltip,
} from '@codemirror/view'
import { normalizeEditorText } from './editor-line-endings.ts'
import { buildGitHunkDiff, type GitHunkDiffRow } from './git-hunk-diff.ts'
import {
  makeGitHunkPeekResizable,
  type GitHunkPeekStorageOperation,
} from './git-hunk-peek-resize.ts'

export type GitLineChangeKind = 'added' | 'modified' | 'deleted'

export interface GitLineDecorationLabels {
  added: string
  modified: string
  deleted: string
  before: string
  current: string
  previous: string
  next: string
  revert: string
  close: string
  resizeWidth: string
}

export interface GitLineDecorationCallbacks {
  onHunkOpen?: () => void
  onHunkResize?: (width: number) => void
  onHunkResizeStorageError?: (operation: GitHunkPeekStorageOperation) => void
  onHunkDismissOutside?: () => void
}

interface GitLineChange {
  kind: GitLineChangeKind
  chunk: Chunk
  anchorPosition: number
  markerPositions: number[]
}

interface GitLineDecorationState {
  chunks: readonly Chunk[]
  changes: GitLineChange[]
  markers: RangeSet<GutterMarker>
  selectedAnchor: number | null
  tooltip: Tooltip | null
}

const DIFF_CONFIG: DiffConfig = { scanLimit: 1_000, timeout: 100 }
const setGitChangePeek = StateEffect.define<number | null>()

export const DEFAULT_GIT_LINE_LABELS: GitLineDecorationLabels = {
  added: 'Added change',
  modified: 'Modified change',
  deleted: 'Deleted change',
  before: 'HEAD',
  current: 'Current',
  previous: 'Previous',
  next: 'Next',
  revert: 'Revert',
  close: 'Close',
  resizeWidth: 'Resize change width',
}

class GitLineMarker extends GutterMarker {
  override readonly elementClass = 'cm-gitChangedGutterElement'

  constructor(
    readonly kind: GitLineChangeKind,
    readonly label: string,
    readonly anchorPosition: number,
    readonly selected: boolean,
  ) { super() }

  override eq(other: GutterMarker): boolean {
    return other instanceof GitLineMarker
      && other.kind === this.kind
      && other.label === this.label
      && other.anchorPosition === this.anchorPosition
      && other.selected === this.selected
  }

  override toDOM(): Node {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-gitLineMarker'
    button.dataset.kind = this.kind
    button.dataset.anchor = String(this.anchorPosition)
    if (this.selected) button.dataset.selected = 'true'
    button.title = this.label
    button.setAttribute('aria-label', this.label)
    return button
  }
}

/** Clickable Git gutter comparing an editable buffer with one Git HEAD baseline. */
export function gitLineDecorations(
  original: string | null,
  labels: GitLineDecorationLabels = DEFAULT_GIT_LINE_LABELS,
  callbacks: GitLineDecorationCallbacks = {},
): Extension {
  const originalDocument = original === null
    ? null
    : Text.of(normalizeEditorText(original).split('\n'))
  const field: StateField<GitLineDecorationState> = StateField.define<GitLineDecorationState>({
    create(state): GitLineDecorationState {
      const chunks = originalDocument === null ? [] : Chunk.build(originalDocument, state.doc, DIFF_CONFIG)
      return decorationState(chunks, originalDocument, state.doc, null, labels, field, callbacks)
    },
    update(value, transaction): GitLineDecorationState {
      let selectedAnchor = value.selectedAnchor
      if (selectedAnchor !== null && transaction.docChanged) {
        selectedAnchor = transaction.changes.mapPos(selectedAnchor)
      }
      for (const effect of transaction.effects) {
        if (effect.is(setGitChangePeek)) selectedAnchor = effect.value
      }
      const chunks = originalDocument === null
        ? []
        : transaction.docChanged
          ? Chunk.updateB(value.chunks, originalDocument, transaction.state.doc, transaction.changes, DIFF_CONFIG)
          : value.chunks
      return decorationState(chunks, originalDocument, transaction.state.doc, selectedAnchor, labels, field, callbacks)
    },
    provide: source => showTooltip.from(source, value => value.tooltip),
  })
  return [
    field,
    gutter({
      class: 'cm-gitChangeGutter',
      markers: view => view.state.field(field).markers,
      domEventHandlers: {
        click(view, _line, event) {
          const target = event.target
          if (!(target instanceof Element)) return false
          const marker = target.closest<HTMLElement>('.cm-gitLineMarker')
          if (marker === null) return false
          const anchor = Number(marker.dataset.anchor)
          if (!Number.isInteger(anchor)) return false
          const state = view.state.field(field)
          const opening = state.selectedAnchor !== anchor
          event.preventDefault()
          view.dispatch({ effects: setGitChangePeek.of(opening ? anchor : null) })
          if (opening) callbacks.onHunkOpen?.()
          return true
        },
      },
    }),
    keymap.of([{
      key: 'Escape',
      run(view) {
        if (view.state.field(field).selectedAnchor === null) return false
        view.dispatch({ effects: setGitChangePeek.of(null) })
        return true
      },
    }]),
    gitLineTheme,
  ]
}

function decorationState(
  chunks: readonly Chunk[],
  original: Text | null,
  current: Text,
  requestedAnchor: number | null,
  labels: GitLineDecorationLabels,
  field: StateField<GitLineDecorationState>,
  callbacks: GitLineDecorationCallbacks,
): GitLineDecorationState {
  if (original === null) return emptyDecorationState()
  const changes = chunks.map(chunk => lineChange(chunk, original, current))
  const selectedChange = resolveSelectedChange(changes, requestedAnchor)
  const selectedAnchor = selectedChange?.anchorPosition ?? null
  const markerChoices = new Map<number, { kind: GitLineChangeKind; anchor: number }>()
  for (const change of changes) {
    for (const position of change.markerPositions) {
      const existing = markerChoices.get(position)
      if (existing === undefined || markerPriority(change.kind) > markerPriority(existing.kind)) {
        markerChoices.set(position, { kind: change.kind, anchor: change.anchorPosition })
      }
    }
  }
  const markerRanges = [...markerChoices.entries()].map(([position, choice]) => {
    return new GitLineMarker(
      choice.kind,
      markerLabel(choice.kind, labels),
      choice.anchor,
      choice.anchor === selectedAnchor,
    ).range(position)
  })
  const selectedIndex = selectedChange === undefined ? -1 : changes.indexOf(selectedChange)
  return {
    chunks,
    changes,
    markers: RangeSet.of(markerRanges, true),
    selectedAnchor,
    tooltip: selectedChange === undefined
      ? null
      : changeTooltip(
        selectedChange,
        selectedIndex,
        changes.length,
        labels,
        field,
        original,
        current,
        changes[selectedIndex - 1]?.chunk,
        changes[selectedIndex + 1]?.chunk,
        callbacks,
      ),
  }
}

function emptyDecorationState(): GitLineDecorationState {
  return {
    chunks: [],
    changes: [],
    markers: RangeSet.empty,
    selectedAnchor: null,
    tooltip: null,
  }
}

function lineChange(chunk: Chunk, original: Text, current: Text): GitLineChange {
  const kind = changeKind(chunk)
  const markerPositions = kind === 'deleted'
    ? [deletionMarkerPosition(current, chunk.fromB)]
    : changedLinePositions(current, chunk.fromB, chunk.endB)
  return {
    kind,
    chunk,
    anchorPosition: markerPositions[0] ?? deletionMarkerPosition(current, chunk.fromB),
    markerPositions,
  }
}

function resolveSelectedChange(changes: readonly GitLineChange[], anchor: number | null): GitLineChange | undefined {
  if (anchor === null || changes.length === 0) return undefined
  return changes.find(change => change.anchorPosition === anchor)
    ?? [...changes].sort((left, right) => (
      Math.abs(left.anchorPosition - anchor) - Math.abs(right.anchorPosition - anchor)
    ))[0]
}

function changeKind(chunk: Chunk): GitLineChangeKind {
  if (chunk.fromB === chunk.toB) return 'deleted'
  return chunk.fromA === chunk.toA ? 'added' : 'modified'
}

function changedLinePositions(document: Text, from: number, to: number): number[] {
  if (from === to) return []
  const positions: number[] = []
  let line = document.lineAt(Math.min(from, document.length))
  for (;;) {
    positions.push(line.from)
    if (line.to >= Math.min(to, document.length) || line.number >= document.lines) return positions
    line = document.line(line.number + 1)
  }
}

function deletionMarkerPosition(document: Text, position: number): number {
  if (document.length === 0) return 0
  return document.lineAt(Math.min(position, document.length)).from
}

function markerPriority(kind: GitLineChangeKind): number {
  switch (kind) {
    case 'modified': return 1
    case 'added': return 2
    case 'deleted': return 3
  }
}

function markerLabel(kind: GitLineChangeKind, labels: GitLineDecorationLabels): string {
  switch (kind) {
    case 'added': return labels.added
    case 'modified': return labels.modified
    case 'deleted': return labels.deleted
  }
}

function changeTooltip(
  change: GitLineChange,
  index: number,
  total: number,
  labels: GitLineDecorationLabels,
  field: StateField<GitLineDecorationState>,
  original: Text,
  current: Text,
  previous: Chunk | undefined,
  next: Chunk | undefined,
  callbacks: GitLineDecorationCallbacks,
): Tooltip {
  return {
    pos: change.anchorPosition,
    clip: false,
    create(view) {
      const dom = document.createElement('section')
      dom.className = 'cm-gitChangePeek'
      dom.dataset.kind = change.kind
      dom.setAttribute('role', 'dialog')
      dom.setAttribute('aria-label', `${markerLabel(change.kind, labels)} ${index + 1}/${total}`)

      const header = document.createElement('header')
      header.className = 'cm-gitChangePeekHeader'
      const identity = document.createElement('div')
      identity.className = 'cm-gitChangePeekIdentity'
      const dot = document.createElement('span')
      dot.className = 'cm-gitChangePeekDot'
      dot.setAttribute('aria-hidden', 'true')
      const title = document.createElement('strong')
      title.textContent = markerLabel(change.kind, labels)
      const count = document.createElement('span')
      count.textContent = `${index + 1}/${total}`
      identity.append(dot, title, count)

      const actions = document.createElement('div')
      actions.className = 'cm-gitChangePeekActions'
      actions.append(
        peekButton('previous', labels.previous),
        peekButton('next', labels.next),
        peekButton('revert', labels.revert),
        peekButton('close', labels.close),
      )
      header.append(identity, actions)

      const body = gitHunkDiffDom(
        buildGitHunkDiff(original, current, change.chunk, previous, next),
        labels,
      )
      dom.append(header, body)
      const resize = makeGitHunkPeekResizable(dom, {
        label: labels.resizeWidth,
        requestMeasure: () => { view.requestMeasure() },
        ...(callbacks.onHunkResize === undefined ? {} : { onCommit: callbacks.onHunkResize }),
        ...(callbacks.onHunkResizeStorageError === undefined
          ? {}
          : { onStorageError: callbacks.onHunkResizeStorageError }),
      })

      const onClick = (event: MouseEvent): void => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest<HTMLButtonElement>('button[data-git-peek-action]')
        if (button === null) return
        event.preventDefault()
        switch (button.dataset.gitPeekAction) {
          case 'previous': navigateChange(view, field, -1); break
          case 'next': navigateChange(view, field, 1); break
          case 'revert': revertSelectedChange(view, field, original); break
          case 'close': view.dispatch({ effects: setGitChangePeek.of(null) }); view.focus(); break
        }
      }
      dom.addEventListener('click', onClick)
      const onDocumentPointerDown = (event: PointerEvent): void => {
        const target = event.target
        if (!(target instanceof Node) || dom.contains(target)) return
        view.dispatch({ effects: setGitChangePeek.of(null) })
        callbacks.onHunkDismissOutside?.()
      }
      dom.ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true)
      return {
        dom,
        getCoords() {
          return view.dom.querySelector<HTMLElement>('.cm-gitLineMarker[data-selected="true"]')?.getBoundingClientRect()
            ?? view.coordsAtPos(change.anchorPosition)
            ?? view.dom.getBoundingClientRect()
        },
        destroy() {
          resize.destroy()
          dom.ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true)
          dom.removeEventListener('click', onClick)
        },
      }
    },
  }
}

function peekButton(action: 'previous' | 'next' | 'revert' | 'close', label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.gitPeekAction = action
  button.textContent = label
  return button
}

function gitHunkDiffDom(
  diff: ReturnType<typeof buildGitHunkDiff>,
  labels: GitLineDecorationLabels,
): HTMLElement {
  const body = document.createElement('div')
  body.className = 'cm-gitChangePeekBody'
  body.dataset.gitLocalDiff = ''
  const largestLineNumber = diff.rows.reduce((largest, row) => (
    Math.max(largest, row.oldLine ?? 0, row.newLine ?? 0)
  ), 0)
  body.style.setProperty('--dsw-git-diff-line-number-width', `${Math.max(4, String(largestLineNumber).length + 1)}ch`)
  const metadata = document.createElement('div')
  metadata.className = 'cm-gitChangePeekHunkHeader'
  const sides = document.createElement('span')
  sides.textContent = `${labels.before} ↔ ${labels.current}`
  const header = document.createElement('code')
  header.textContent = diff.header
  metadata.append(sides, header)
  const rows = document.createElement('div')
  rows.className = 'cm-gitChangePeekRows'
  rows.setAttribute('role', 'list')
  rows.setAttribute('aria-label', `${labels.before} / ${labels.current}`)
  for (const row of diff.rows) rows.append(gitHunkDiffRowDom(row, labels))
  body.append(metadata, rows)
  return body
}

function gitHunkDiffRowDom(row: GitHunkDiffRow, labels: GitLineDecorationLabels): HTMLElement {
  const element = document.createElement('div')
  element.className = 'cm-gitChangePeekRow'
  element.dataset.diffKind = row.kind
  element.setAttribute('role', 'listitem')
  element.setAttribute('aria-label', diffRowLabel(row, labels))
  const oldLine = document.createElement('span')
  oldLine.className = 'cm-gitChangePeekLineNumber'
  oldLine.dataset.side = 'old'
  oldLine.textContent = row.oldLine?.toString() ?? ''
  const newLine = document.createElement('span')
  newLine.className = 'cm-gitChangePeekLineNumber'
  newLine.dataset.side = 'new'
  newLine.textContent = row.newLine?.toString() ?? ''
  const prefix = document.createElement('span')
  prefix.className = 'cm-gitChangePeekPrefix'
  prefix.setAttribute('aria-hidden', 'true')
  prefix.textContent = row.kind === 'removed' ? '-' : row.kind === 'added' ? '+' : ' '
  const content = document.createElement('code')
  content.className = 'cm-gitChangePeekCode'
  for (const segment of row.segments) {
    const span = document.createElement('span')
    span.dataset.diffSegment = segment.kind
    span.textContent = segment.text
    content.append(span)
  }
  element.append(oldLine, newLine, prefix, content)
  return element
}

function diffRowLabel(row: GitHunkDiffRow, labels: GitLineDecorationLabels): string {
  switch (row.kind) {
    case 'removed': return `${labels.before} ${row.oldLine ?? ''}: ${row.text}`
    case 'added': return `${labels.current} ${row.newLine ?? ''}: ${row.text}`
    case 'context': return `${labels.before} ${row.oldLine ?? ''}, ${labels.current} ${row.newLine ?? ''}: ${row.text}`
  }
}

function navigateChange(view: EditorView, field: StateField<GitLineDecorationState>, direction: -1 | 1): void {
  const state = view.state.field(field)
  if (state.changes.length === 0) return
  const current = state.changes.findIndex(change => change.anchorPosition === state.selectedAnchor)
  const index = current < 0 ? 0 : (current + direction + state.changes.length) % state.changes.length
  const anchor = state.changes[index]?.anchorPosition
  if (anchor === undefined) return
  view.dispatch({
    effects: [setGitChangePeek.of(anchor), EditorView.scrollIntoView(anchor, { y: 'center' })],
  })
}

function revertSelectedChange(
  view: EditorView,
  field: StateField<GitLineDecorationState>,
  original: Text,
): void {
  const state = view.state.field(field)
  const change = state.changes.find(candidate => candidate.anchorPosition === state.selectedAnchor)
  if (change === undefined) return
  view.dispatch({
    changes: {
      from: Math.min(change.chunk.fromB, view.state.doc.length),
      to: Math.min(change.chunk.toB, view.state.doc.length),
      insert: original.sliceString(
        Math.min(change.chunk.fromA, original.length),
        Math.min(change.chunk.toA, original.length),
      ),
    },
    effects: setGitChangePeek.of(null),
    annotations: Transaction.userEvent.of('input.git-revert'),
  })
  view.focus()
}

const gitLineTheme = EditorView.theme({
  '.cm-gitChangeGutter': {
    width: '8px',
    minWidth: '8px',
    backgroundColor: 'var(--dsw-alias-bg-base)',
    borderRight: '0',
  },
  '.cm-gitChangeGutter .cm-gutterElement': {
    boxSizing: 'border-box',
    width: '8px',
    minWidth: '8px',
    padding: '0',
  },
  '.cm-gitChangedGutterElement': {
    position: 'relative',
  },
  '.cm-gitLineMarker': {
    position: 'absolute',
    inset: '0',
    display: 'block',
    width: '100%',
    minWidth: '0',
    padding: '0',
    border: '0',
    borderRadius: '2px',
    background: 'transparent',
    cursor: 'pointer',
  },
  '.cm-gitLineMarker::before': {
    content: '""',
    position: 'absolute',
    insetInlineStart: '0',
    insetBlock: '0',
    width: '3px',
    borderRadius: '0 2px 2px 0',
    background: 'var(--dsw-alias-state-business-primary)',
  },
  '.cm-gitLineMarker[data-kind="added"]::before': {
    background: 'var(--dsw-alias-state-success-primary)',
  },
  '.cm-gitLineMarker[data-kind="deleted"]::before': {
    insetBlock: '-3px auto',
    width: '0',
    height: '0',
    borderBlock: '3px solid transparent',
    borderInlineStart: '6px solid var(--dsw-alias-state-error-primary)',
    borderRadius: '0',
    background: 'transparent',
  },
  '.cm-gitLineMarker:hover, .cm-gitLineMarker:focus-visible, .cm-gitLineMarker[data-selected="true"]': {
    background: 'var(--dsw-alias-interactive-bg-hover)',
  },
  '.cm-gitLineMarker:focus-visible': {
    outline: '1px solid var(--dsw-alias-brand-border)',
    outlineOffset: '-1px',
  },
  '.cm-tooltip.cm-gitChangePeek': {
    boxSizing: 'border-box',
    overflow: 'hidden',
    border: '1px solid var(--dsw-alias-border-inverted)',
    borderRadius: '12px',
    background: 'var(--dsw-specific-menu)',
    color: 'var(--dsw-alias-label-primary)',
    boxShadow: 'var(--dsw-shadow-lv3)',
  },
  '.cm-gitChangePeekHeader': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    minHeight: '38px',
    padding: '5px 7px 5px 12px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
  },
  '.cm-gitChangePeekIdentity': {
    display: 'flex',
    alignItems: 'center',
    minWidth: '0',
    gap: '7px',
    font: 'var(--dsw-font-xxs-12)',
  },
  '.cm-gitChangePeekIdentity strong': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: '600',
  },
  '.cm-gitChangePeekIdentity > span:last-child': {
    color: 'var(--dsw-alias-label-tertiary)',
  },
  '.cm-gitChangePeekDot': {
    flex: '0 0 auto',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--dsw-alias-state-business-primary)',
  },
  '.cm-gitChangePeek[data-kind="added"] .cm-gitChangePeekDot': {
    background: 'var(--dsw-alias-state-success-primary)',
  },
  '.cm-gitChangePeek[data-kind="deleted"] .cm-gitChangePeekDot': {
    background: 'var(--dsw-alias-state-error-primary)',
  },
  '.cm-gitChangePeekActions': {
    display: 'flex',
    flex: '0 0 auto',
    alignItems: 'center',
    gap: '2px',
  },
  '.cm-gitChangePeekActions button': {
    minWidth: '0',
    height: '27px',
    padding: '0 8px',
    border: '0',
    borderRadius: '7px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    font: 'var(--dsw-font-xxs-12)',
    cursor: 'pointer',
  },
  '.cm-gitChangePeekActions button:hover, .cm-gitChangePeekActions button:focus-visible': {
    background: 'var(--dsw-alias-interactive-bg-hover)',
    color: 'var(--dsw-alias-label-primary)',
    outline: 'none',
  },
  '.cm-gitChangePeekBody': {
    minWidth: '0',
    background: 'var(--dsw-alias-markdown-code-block)',
  },
  '.cm-gitChangePeekHunkHeader': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '7px 10px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    color: 'var(--dsw-alias-label-tertiary)',
    font: 'var(--dsw-font-xxs-12)',
  },
  '.cm-gitChangePeekHunkHeader code': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    font: 'var(--dsw-font-markdown-code-block)',
  },
  '.cm-gitChangePeekRows': {
    maxHeight: '260px',
    overflow: 'auto',
    paddingBlock: '5px',
    font: 'var(--dsw-font-markdown-code-block)',
  },
  '.cm-gitChangePeekRow': {
    display: 'grid',
    gridTemplateColumns: 'var(--dsw-git-diff-line-number-width) var(--dsw-git-diff-line-number-width) 14px minmax(0, 1fr)',
    alignItems: 'start',
    minHeight: '20px',
    color: 'var(--dsw-alias-label-primary)',
  },
  '.cm-gitChangePeekLineNumber': {
    boxSizing: 'border-box',
    minHeight: '20px',
    paddingInlineEnd: '5px',
    color: 'var(--dsw-alias-label-tertiary)',
    textAlign: 'right',
    userSelect: 'none',
  },
  '.cm-gitChangePeekLineNumber[data-side="new"]': {
    borderInlineEnd: '1px solid var(--dsw-alias-border-l1)',
  },
  '.cm-gitChangePeekPrefix': {
    minHeight: '20px',
    textAlign: 'center',
    userSelect: 'none',
  },
  '.cm-gitChangePeekCode': {
    minWidth: '0',
    minHeight: '20px',
    paddingInlineEnd: '10px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    font: 'inherit',
  },
  '.cm-gitChangePeekRow[data-diff-kind="removed"] .cm-gitChangePeekPrefix, .cm-gitChangePeekRow[data-diff-kind="removed"] .cm-gitChangePeekCode': {
    color: 'var(--dsw-alias-state-error-primary)',
  },
  '.cm-gitChangePeekRow[data-diff-kind="removed"]': {
    background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 11%, transparent)',
  },
  '.cm-gitChangePeekRow[data-diff-kind="added"] .cm-gitChangePeekPrefix, .cm-gitChangePeekRow[data-diff-kind="added"] .cm-gitChangePeekCode': {
    color: 'var(--dsw-alias-state-success-primary)',
  },
  '.cm-gitChangePeekRow[data-diff-kind="added"]': {
    background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent)',
  },
  '.cm-gitChangePeekRow[data-diff-kind="removed"] [data-diff-segment="changed"]': {
    borderRadius: '2px',
    background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 23%, transparent)',
  },
  '.cm-gitChangePeekRow[data-diff-kind="added"] [data-diff-segment="changed"]': {
    borderRadius: '2px',
    background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 23%, transparent)',
  },
  '.cm-tooltip.cm-gitChangePeek > .cm-gitChangePeekResizeHandle': {
    position: 'absolute',
    zIndex: '3',
    boxSizing: 'border-box',
    padding: '0',
    border: '0',
    background: 'transparent',
    touchAction: 'none',
    userSelect: 'none',
  },
  '.cm-gitChangePeekResizeHandle': {
    insetBlock: '38px 10px',
    insetInlineEnd: '0',
    width: '8px',
    cursor: 'col-resize',
  },
  '.cm-tooltip.cm-gitChangePeek > .cm-gitChangePeekResizeHandle::after': {
    content: '""',
    position: 'absolute',
    boxSizing: 'border-box',
    opacity: '0',
    transition: 'opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out)',
  },
  '.cm-gitChangePeekResizeHandle::after': {
    insetBlockStart: '50%',
    insetInlineEnd: '2px',
    width: '2px',
    height: '28px',
    borderRadius: '2px',
    background: 'var(--dsw-alias-label-tertiary)',
    transform: 'translateY(-50%)',
  },
  '.cm-gitChangePeek:hover .cm-gitChangePeekResizeHandle::after': {
    opacity: '0.45',
  },
  '.cm-gitChangePeekResizeHandle:hover::after, .cm-gitChangePeekResizeHandle:focus-visible::after, .cm-gitChangePeek[data-resizing] .cm-gitChangePeekResizeHandle::after': {
    opacity: '1',
  },
  '.cm-gitChangePeekResizeHandle:focus-visible': {
    outline: '1px solid var(--dsw-alias-brand-border)',
    outlineOffset: '-2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '.cm-gitChangePeekResizeHandle::after': {
      transition: 'none',
    },
  },
})
