// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { CHAT_WIDTH_PROPERTY, CHAT_WIDTH_STORAGE_KEY } from '../src/client/column-width.ts'
import { installWorkbenchLayout } from '../src/client/layout-styles.ts'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  window.localStorage.clear()
})

describe('workbench layout presentation', () => {
  it('marks the official AppFrame, mirrors its sidebar width, and cleans up', () => {
    const frame = document.createElement('div')
    frame.style.gridTemplateColumns = '312px minmax(0, 1fr) 0px'
    const overlay = document.createElement('div')
    overlay.dataset.shellOverlay = ''
    frame.appendChild(overlay)
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = {
      effect: vi.fn((setup: () => () => void) => { dispose = setup() }),
      logger: { info: vi.fn() },
    } as unknown as ClientContext

    installWorkbenchLayout(ctx)
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(true)
    expect(frame.style.getPropertyValue('--dsh-workbench-sidebar-width')).toBe('312px')
    expect(frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY)).toBe('440px')
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).not.toBeNull()

    dispose?.()
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(false)
    expect(frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY)).toBe('')
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).toBeNull()
  })

  it('restores a saved conversation width when attaching the frame', () => {
    window.localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, '388')
    const frame = document.createElement('div')
    frame.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
    const overlay = document.createElement('div')
    overlay.dataset.shellOverlay = ''
    frame.appendChild(overlay)
    document.body.appendChild(frame)
    const ctx = { effect: (setup: () => () => void) => { setup() }, logger: { info: vi.fn() } } as unknown as ClientContext
    installWorkbenchLayout(ctx)
    expect(frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY)).toBe('388px')
  })
})
