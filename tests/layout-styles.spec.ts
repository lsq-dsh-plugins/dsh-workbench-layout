// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { installWorkbenchLayout } from '../src/client/layout-styles.ts'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('workbench layout presentation', () => {
  it('marks AppFrame without replacing its native tracks or drag handle', () => {
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
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 0px')
    const style = document.head.querySelector<HTMLStyleElement>('[data-dsh-workbench-layout]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(':not([data-details-collapsed])')
    expect(style?.textContent).toContain("[data-side='details']::after")
    expect(style?.textContent).not.toContain('grid-template-columns')
    expect(style?.textContent).not.toContain("[data-side='details'] {")

    dispose?.()
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(false)
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 0px')
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).toBeNull()
  })
})
