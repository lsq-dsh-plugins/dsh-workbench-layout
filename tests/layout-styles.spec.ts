// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { installWorkbenchLayout } from '../src/client/layout-styles.ts'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
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
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).not.toBeNull()

    dispose?.()
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(false)
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).toBeNull()
  })
})
