import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { MergeView, unifiedMergeView } from '@codemirror/merge'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'

export interface DiffSurfaceProps {
  original: string
  modified: string
  originalLabel: string
  modifiedLabel: string
  mode: 'split' | 'inline'
}

const COLLAPSE_UNCHANGED = { margin: 3, minSize: 8 } as const

/** 使用只读 CodeMirror MergeView 渲染一个文件的前后版本。 */
export function DiffSurface(props: DiffSurfaceProps) {
  const parent = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (parent.current === null) return
    const extensions = (label: string) => [
      basicSetup,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label }),
      diffTheme,
    ]

    if (props.mode === 'split') {
      const merge = new MergeView({
        parent: parent.current,
        a: { doc: props.original, extensions: extensions(props.originalLabel) },
        b: { doc: props.modified, extensions: extensions(props.modifiedLabel) },
        collapseUnchanged: COLLAPSE_UNCHANGED,
        diffConfig: { timeout: 800 },
        gutter: true,
        highlightChanges: true,
      })
      merge.dom.style.height = '100%'
      merge.dom.style.overflow = 'auto'
      return () => { merge.destroy() }
    }

    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: props.modified,
        extensions: [
          ...extensions(`${props.originalLabel} / ${props.modifiedLabel}`),
          unifiedMergeView({
            original: props.original,
            allowInlineDiffs: true,
            collapseUnchanged: COLLAPSE_UNCHANGED,
            diffConfig: { timeout: 800 },
            gutter: true,
            highlightChanges: true,
            mergeControls: false,
            syntaxHighlightDeletions: true,
          }),
        ],
      }),
    })
    return () => { view.destroy() }
  }, [props.mode, props.modified, props.modifiedLabel, props.original, props.originalLabel])

  return <div ref={parent} data-diff-surface={props.mode} style={{ height: '100%', minHeight: 0 }} />
}

const diffTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12.5px',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '10px 0 72px' },
  '.cm-gutters': {
    backgroundColor: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-quaternary)',
    borderRight: '1px solid var(--dsw-alias-border-l1)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--dsw-alias-interactive-bg-active) !important',
  },
  '&.cm-focused': { outline: 'none' },
  '&.cm-merge-a .cm-changedLine, .cm-deletedChunk': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 11%, transparent)',
  },
  '&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent)',
  },
  '&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText, &.cm-merge-b .cm-deletedText': {
    background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 23%, transparent)',
    textDecoration: 'none',
  },
  '&.cm-merge-b .cm-changedText, .cm-insertedLine': {
    background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 23%, transparent)',
    textDecoration: 'none',
  },
  '&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter': {
    backgroundColor: 'var(--dsw-alias-state-error-primary)',
  },
  '&.cm-merge-b .cm-changedLineGutter': {
    backgroundColor: 'var(--dsw-alias-state-success-primary)',
  },
  '.cm-inlineChangedLineGutter': {
    backgroundColor: 'var(--dsw-alias-brand-primary)',
  },
  '.cm-collapsedLines': {
    borderBlock: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-tertiary)',
  },
})
