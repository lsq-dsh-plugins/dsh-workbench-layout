// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveFallbackDetailsWidth } from '../src/client/fallback-details-layout.ts'
import { installWorkbenchLayout } from '../src/client/layout-styles.ts'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('workbench layout presentation', () => {
  it('matches AppFrame details bounds and center concession', () => {
    expect(resolveFallbackDetailsWidth(1400, 280, 360)).toBe(360)
    expect(resolveFallbackDetailsWidth(1250, 280, 520)).toBe(330)
    expect(resolveFallbackDetailsWidth(1200, 280, 360)).toBe(0)
  })

  it('keeps the native active-Session track untouched', () => {
    const { frame } = appFrameFixture('active')
    frame.removeAttribute('data-details-collapsed')
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })

    installWorkbenchLayout(ctx)
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(true)
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 0px')
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(false)
    const style = document.head.querySelector<HTMLStyleElement>('[data-dsh-workbench-layout]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(':not([data-details-collapsed])')
    expect(style?.textContent).toContain("[data-side='details']::after")

    dispose?.()
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(false)
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 0px')
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).toBeNull()
  })

  it('opens a draggable workbench track for the blank-Session Hero and releases it when active', async () => {
    const { frame, conversation } = appFrameFixture('hero')
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })

    installWorkbenchLayout(ctx)
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(true)
    expect(frame.style.getPropertyValue('--dsh-workbench-fallback-sidebar-width')).toBe('280px')
    expect(frame.style.getPropertyValue('--dsh-workbench-fallback-details-width')).toBe('360px')
    expect(frame.querySelector('[data-dsh-workbench-fallback-handle]')).not.toBeNull()
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('activated blank-Session'))

    conversation.dataset.phase = 'active'
    await vi.waitFor(() => {
      expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(false)
    })
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('released blank-Session'))

    dispose?.()
    expect(frame.querySelector('[data-dsh-workbench-fallback-handle]')).toBeNull()
  })
})

function appFrameFixture(phase: 'hero' | 'active') {
  const frame = document.createElement('div')
  frame.style.gridTemplateColumns = '312px minmax(0, 1fr) 0px'
  frame.toggleAttribute('data-details-collapsed', true)
  const sidebar = document.createElement('div')
  const conversationColumn = document.createElement('div')
  const conversation = document.createElement('div')
  conversation.dataset.phase = phase
  conversationColumn.appendChild(conversation)
  const details = document.createElement('div')
  details.appendChild(document.createElement('div'))
  const overlay = document.createElement('div')
  overlay.dataset.shellOverlay = ''
  frame.append(sidebar, conversationColumn, details, overlay)
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(1400))
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(rect(280))
  return { frame, conversation }
}

function contextWithDispose(onDispose: (dispose: () => void) => void): ClientContext {
  return {
    effect: vi.fn((setup: () => () => void) => { onDispose(setup()) }),
    logger: { info: vi.fn() },
  } as unknown as ClientContext
}

function rect(width: number): DOMRect {
  return { width, height: 800, x: 0, y: 0, top: 0, right: width, bottom: 800, left: 0, toJSON: () => ({}) }
}
