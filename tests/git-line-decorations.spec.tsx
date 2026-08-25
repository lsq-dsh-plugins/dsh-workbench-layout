// @vitest-environment jsdom

import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../src/client/CodeEditor.tsx'
import { GIT_HUNK_PEEK_STORAGE_KEY } from '../src/client/git-hunk-peek-resize.ts'

const rangeGetClientRects = Range.prototype.getClientRects
const rangeGetBoundingClientRect = Range.prototype.getBoundingClientRect

beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })
})

afterAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: rangeGetClientRects,
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: rangeGetBoundingClientRect,
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('editable Git line decorations', () => {
  it('marks added and modified lines only in the clickable gutter', () => {
    const view = render(
      <CodeEditor
        value={'first\nchanged\nthird\nadded\n'}
        gitOriginal={'first\nsecond\nthird\n'}
        onChange={() => {}}
        ariaLabel="changed.txt"
      />,
    )

    expect(view.container.querySelectorAll('.cm-gitLineMarker[data-kind="modified"]')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitLineMarker[data-kind="added"]')).toHaveLength(1)
    expect(view.container.querySelectorAll('.cm-gitLineAdded, .cm-gitLineModified, .cm-gitTextAdded, .cm-gitTextModified')).toHaveLength(0)
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

    expect(view.container.querySelectorAll('.cm-gitLineMarker[data-kind="deleted"]')).toHaveLength(1)
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

    expect(view.container.querySelectorAll('.cm-gitLineMarker[data-kind="added"]')).toHaveLength(1)
  })

  it('removes decorations when no Git baseline is available', () => {
    const view = render(
      <CodeEditor value={'new\n'} gitOriginal="" onChange={() => {}} ariaLabel="ignored.txt" />,
    )
    expect(view.container.querySelectorAll('.cm-gitLineMarker[data-kind="added"]')).toHaveLength(1)

    view.rerender(<CodeEditor value={'new\n'} onChange={() => {}} ariaLabel="ignored.txt" />)
    expect(view.container.querySelectorAll('.cm-gitLineMarker')).toHaveLength(0)
  })

  it('does not treat CRLF and LF representations as Git changes', () => {
    const view = render(
      <CodeEditor value={'first\r\nsecond\r\n'} gitOriginal={'first\nsecond\n'} onChange={() => {}} ariaLabel="lines.txt" />,
    )

    expect(view.container.querySelectorAll('.cm-gitLineMarker')).toHaveLength(0)
  })

  it('keeps the foreground marker visible on the active editor line', () => {
    const view = render(
      <CodeEditor value={'first\nchanged\n'} gitOriginal={'first\nsecond\n'} onChange={() => {}} ariaLabel="active.txt" />,
    )
    const editor = editorFrom(view.container)
    act(() => { editor.dispatch({ selection: { anchor: 7 } }) })

    const marker = gitMarker(view.container, 'modified')
    expect(marker.closest('.cm-gutterElement')?.classList.contains('cm-activeLineGutter')).toBe(true)
    expect(marker.dataset.kind).toBe('modified')
  })

  it('opens and toggles a local Unified Diff hunk from a gutter marker', () => {
    const onGitHunkOpen = vi.fn()
    const view = render(
      <CodeEditor
        value={'first\nchanged\n'}
        gitOriginal={'first\nsecond\n'}
        onChange={() => {}}
        onGitHunkOpen={onGitHunkOpen}
        ariaLabel="peek.txt"
      />,
    )
    const marker = gitMarker(view.container, 'modified')
    fireEvent.click(marker)

    const dialog = view.getByRole('dialog', { name: 'Modified change 1/1' })
    expect(dialog.querySelector('[data-git-local-diff]')).not.toBeNull()
    expect(dialog.querySelector('.cm-gitChangePeekVersion')).toBeNull()
    expect(within(dialog).getByText('@@ -1,2 +1,2 @@')).toBeTruthy()
    expect(dialog.querySelectorAll('[data-diff-kind="context"]')).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-diff-kind="removed"]')).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-diff-kind="added"]')).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-diff-kind="removed"] [data-diff-segment="changed"]')).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-diff-kind="added"] [data-diff-segment="changed"]')).toHaveLength(1)
    expect(dialog.querySelector('[data-diff-kind="removed"] .cm-gitChangePeekCode')?.textContent).toBe('second')
    expect(dialog.querySelector('[data-diff-kind="added"] .cm-gitChangePeekCode')?.textContent).toBe('changed')
    expect(gitMarker(view.container, 'modified').dataset.selected).toBe('true')
    expect(onGitHunkOpen).toHaveBeenCalledOnce()

    fireEvent.click(gitMarker(view.container, 'modified'))
    expect(view.queryByRole('dialog')).toBeNull()
    expect(onGitHunkOpen).toHaveBeenCalledOnce()
  })

  it('navigates between change blocks and closes the peek', () => {
    const view = render(
      <CodeEditor
        value={'one\nTWO\nthree\nFOUR\n'}
        gitOriginal={'one\ntwo\nthree\nfour\n'}
        onChange={() => {}}
        ariaLabel="navigate.txt"
      />,
    )
    fireEvent.click(gitMarker(view.container, 'modified', 0))
    expect(within(view.getByRole('dialog')).getByText('TWO')).toBeTruthy()

    fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Next' }))
    expect(within(view.getByRole('dialog')).getByText('FOUR')).toBeTruthy()
    fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('resizes the local Diff with keyboard or pointer handles and restores that size', () => {
    const onGitHunkResize = vi.fn()
    const view = render(
      <CodeEditor
        value={'one\nTWO\nthree\nFOUR\n'}
        gitOriginal={'one\ntwo\nthree\nfour\n'}
        onChange={() => {}}
        onGitHunkResize={onGitHunkResize}
        ariaLabel="resize.txt"
      />,
    )
    fireEvent.click(gitMarker(view.container, 'modified', 0))
    const firstDialog = view.getByRole('dialog')
    expect(firstDialog.style.inlineSize).toBe('480px')
    expect(firstDialog.style.blockSize).toBe('320px')

    fireEvent.keyDown(within(firstDialog).getByRole('separator', { name: 'Resize change width' }), {
      key: 'ArrowRight',
    })
    expect(firstDialog.style.inlineSize).toBe('488px')
    expect(firstDialog.style.blockSize).toBe('320px')
    expect(onGitHunkResize).toHaveBeenLastCalledWith({ width: 488, height: 320 })

    const corner = firstDialog.querySelector<HTMLElement>('[data-resize-axis="both"]')
    expect(corner).toBeInstanceOf(HTMLElement)
    fireEvent.pointerDown(corner as HTMLElement, { button: 0, pointerId: 7, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(corner as HTMLElement, { pointerId: 7, clientX: 124, clientY: 140 })
    fireEvent.pointerUp(corner as HTMLElement, { pointerId: 7, clientX: 124, clientY: 140 })
    expect(firstDialog.style.inlineSize).toBe('512px')
    expect(firstDialog.style.blockSize).toBe('360px')
    expect(onGitHunkResize).toHaveBeenLastCalledWith({ width: 512, height: 360 })
    expect(window.localStorage.getItem(GIT_HUNK_PEEK_STORAGE_KEY)).toBe('{"width":512,"height":360}')

    fireEvent.click(within(firstDialog).getByRole('button', { name: 'Next' }))
    const nextDialog = view.getByRole('dialog')
    expect(nextDialog.style.inlineSize).toBe('512px')
    expect(nextDialog.style.blockSize).toBe('360px')
  })

  it('reverts one change in the draft and keeps the edit undoable', () => {
    const onChange = vi.fn()
    const view = render(
      <CodeEditor value={'first\nchanged\n'} gitOriginal={'first\nsecond\n'} onChange={onChange} ariaLabel="revert.txt" />,
    )
    const editor = editorFrom(view.container)
    fireEvent.click(gitMarker(view.container, 'modified'))
    fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Revert' }))

    expect(editor.state.doc.toString()).toBe('first\nsecond\n')
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.container.querySelector('.cm-gitLineMarker[data-kind="modified"]')).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith('first\nsecond\n', 'git-revert')

    act(() => { expect(undo(editor)).toBe(true) })
    expect(editor.state.doc.toString()).toBe('first\nchanged\n')
    expect(gitMarker(view.container, 'modified')).toBeTruthy()
  })
})

function editorFrom(container: HTMLElement): EditorView {
  const editorElement = container.querySelector('.cm-editor')
  expect(editorElement).toBeInstanceOf(HTMLElement)
  const editor = EditorView.findFromDOM(editorElement as HTMLElement)
  expect(editor).not.toBeNull()
  return editor as EditorView
}

function gitMarker(container: HTMLElement, kind: 'added' | 'modified' | 'deleted', index = 0): HTMLButtonElement {
  const marker = container.querySelectorAll<HTMLButtonElement>(`.cm-gitLineMarker[data-kind="${kind}"]`)[index]
  expect(marker).toBeInstanceOf(HTMLButtonElement)
  return marker as HTMLButtonElement
}
