import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import css from './Workbench.module.css'

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}

/** CodeMirror surface themed entirely through DSH design tokens. */
export function CodeEditor({ value, onChange, ariaLabel }: CodeEditorProps) {
  const parent = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (parent.current === null) return
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
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
    if (current === value) return
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={parent} className={css.codeEditorHost} />
}
