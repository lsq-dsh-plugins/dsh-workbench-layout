// @vitest-environment jsdom

import { EditorView } from '@codemirror/view'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeEditor } from '../src/client/CodeEditor.tsx'

afterEach(() => { cleanup() })

describe('editable Git line decorations', () => {
  it('marks added and modified content inside a normal source editor', () => {
    const view = render(
      <CodeEditor
        value={'first\nchanged\nthird\nadded\n'}
        gitOriginal={'first\nsecond\nthird\n'}
        onChange={() => {}}
        ariaLabel="changed.txt"
      />,
    )

    expect(view.container.querySelectorAll('.cm-gitLineModified')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitModifiedLineGutter')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitLineAdded')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitAddedLineGutter')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitTextModified')).toHaveLength(1)
  })

  it('shows a deletion marker at the surviving line boundary without inserting deleted text', () => {
    const view = render(
      <CodeEditor
        value={'first\nthird\n'}
        gitOriginal={'first\nremoved\nthird\n'}
        onChange={() => {}}
        ariaLabel="deleted.txt"
      />,
    )

    expect(view.container.querySelectorAll('.cm-gitDeletedLineGutter')).toHaveLength(1)
    expect(view.container.textContent).not.toContain('removed')
  })

  it('updates line markers incrementally while the buffer is edited', () => {
    const view = render(
      <CodeEditor value={'first\n'} gitOriginal={'first\n'} onChange={() => {}} ariaLabel="live.txt" />,
    )
    const editorElement = view.container.querySelector('.cm-editor')
    expect(editorElement).toBeInstanceOf(HTMLElement)
    const editor = EditorView.findFromDOM(editorElement as HTMLElement)
    expect(editor).not.toBeNull()
    editor?.dispatch({ changes: { from: 5, insert: '\nadded' } })

    expect(view.container.querySelectorAll('.cm-gitLineAdded')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitAddedLineGutter')).toHaveLength(1)
  })

  it('removes decorations when no Git baseline is available', () => {
    const view = render(
      <CodeEditor value={'new\n'} gitOriginal="" onChange={() => {}} ariaLabel="ignored.txt" />,
    )
    expect(view.container.querySelectorAll('.cm-gitLineAdded')).toHaveLength(1)

    view.rerender(<CodeEditor value={'new\n'} onChange={() => {}} ariaLabel="ignored.txt" />)
    expect(view.container.querySelectorAll('.cm-gitLineAdded')).toHaveLength(0)
    expect(view.container.querySelectorAll('.cm-gitAddedLineGutter')).toHaveLength(0)
  })

  it('does not treat CRLF and LF representations as Git changes', () => {
    const view = render(
      <CodeEditor value={'first\r\nsecond\r\n'} gitOriginal={'first\nsecond\n'} onChange={() => {}} ariaLabel="lines.txt" />,
    )

    expect(view.container.querySelectorAll('[class*="cm-gitLine"]')).toHaveLength(0)
    expect(view.container.querySelectorAll('[class*="cm-gitAddedLineGutter"], [class*="cm-gitModifiedLineGutter"], [class*="cm-gitDeletedLineGutter"]')).toHaveLength(0)
  })
})
