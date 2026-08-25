import { useEffect, useRef } from 'react'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import {
  detectEditorLineEnding,
  normalizeEditorText,
  restoreEditorLineEndings,
  type EditorLineEnding,
} from './editor-line-endings.ts'
import css from './Workbench.module.css'
import {
  DEFAULT_GIT_LINE_LABELS,
  gitLineDecorations,
  type GitLineDecorationLabels,
} from './git-line-decorations.ts'

export interface CodeEditorProps {
  value: string
  onChange: (value: string, source: CodeEditorChangeSource) => void
  ariaLabel: string
  gitOriginal?: string
  gitLabels?: GitLineDecorationLabels
}

export type CodeEditorChangeSource = 'input' | 'git-revert'

/** CodeMirror surface themed entirely through DSH design tokens. */
export function CodeEditor({ value, onChange, ariaLabel, gitOriginal, gitLabels }: CodeEditorProps) {
  const parent = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const lineEndingRef = useRef<EditorLineEnding>(detectEditorLineEnding(value))
  const syncingRef = useRef(false)
  const gitChanges = useRef(new Compartment())
  onChangeRef.current = onChange
  lineEndingRef.current = detectEditorLineEnding(value)

  useEffect(() => {
    if (parent.current === null) return
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: normalizeEditorText(value),
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingRef.current) {
              const source = update.transactions.some(transaction => (
                transaction.annotation(Transaction.userEvent) === 'input.git-revert'
              )) ? 'git-revert' : 'input'
              onChangeRef.current(
                restoreEditorLineEndings(update.state.doc.toString(), lineEndingRef.current),
                source,
              )
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: 'var(--dsw-alias-bg-base)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: '13px',
            },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
              lineHeight: '1.65',
            },
            '.cm-content': { padding: '18px 8px 80px' },
            '.cm-gutters': {
              backgroundColor: 'var(--dsw-alias-bg-base)',
              color: 'var(--dsw-alias-label-tertiary)',
              borderRight: '1px solid var(--dsw-alias-border-l1)',
            },
            '.cm-activeLine, .cm-activeLineGutter': {
              backgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
            },
            '.cm-selectionBackground, ::selection': {
              backgroundColor: 'var(--dsw-alias-interactive-bg-active) !important',
            },
            '&.cm-focused': { outline: 'none' },
            '.cm-cursor': { borderLeftColor: 'var(--dsw-alias-label-primary)' },
          }),
          gitChanges.current.of(gitLineDecorations(gitOriginal ?? null, gitLabels ?? DEFAULT_GIT_LINE_LABELS)),
        ],
      }),
    })
    view.current = editor
    return () => {
      view.current = null
      editor.destroy()
    }
  }, [ariaLabel])

  useEffect(() => {
    const editor = view.current
    if (editor === null) return
    const current = editor.state.doc.toString()
    const normalized = normalizeEditorText(value)
    if (current === normalized) return
    syncingRef.current = true
    try {
      editor.dispatch({ changes: { from: 0, to: current.length, insert: normalized } })
    } finally {
      syncingRef.current = false
    }
  }, [value])

  useEffect(() => {
    const editor = view.current
    if (editor === null) return
    editor.dispatch({
      effects: gitChanges.current.reconfigure(gitLineDecorations(
        gitOriginal ?? null,
        gitLabels ?? DEFAULT_GIT_LINE_LABELS,
      )),
    })
  }, [gitLabels, gitOriginal])

  return <div ref={parent} className={css.codeEditorHost} />
}
