// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColumnResizeHandle } from '../src/client/ColumnResizeHandle.tsx'
import { CHAT_WIDTH_PROPERTY, CHAT_WIDTH_STORAGE_KEY } from '../src/client/column-width.ts'

const captured = new WeakSet<Element>()

beforeEach(() => {
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
})

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('conversation resize handle', () => {
  it('drags from the rendered width, persists the result, and supports reset', () => {
    let animation: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { animation = callback; return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const onCommit = vi.fn()
    const view = render(
      <div data-testid="frame" style={{ [CHAT_WIDTH_PROPERTY]: '440px', ['--dsh-workbench-sidebar-width']: '280px' }}>
        <div data-shell-overlay="">
          <ColumnResizeHandle onCommit={onCommit} t={(key: string) => key} />
        </div>
      </div>,
    )
    const frame = view.getByTestId('frame')
    frame.getBoundingClientRect = () => ({
      width: 1400, height: 900, top: 0, left: 0, right: 1400, bottom: 900, x: 0, y: 0, toJSON: () => ({}),
    })
    const handle = view.getByRole('separator')
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 900 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 840 })
    animation?.(0)
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 840 })
    expect(frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY)).toBe('500px')
    expect(window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY)).toBe('500')
    expect(onCommit).toHaveBeenLastCalledWith(500)

    fireEvent.doubleClick(handle)
    expect(frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY)).toBe('440px')
  })
})
