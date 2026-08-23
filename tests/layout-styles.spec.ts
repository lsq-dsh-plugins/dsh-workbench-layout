// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { CONVERSATION_ROOT_ATTRIBUTE } from '../src/client/conversation-layout.ts'
import {
  EDITOR_RELEASE_ATTRIBUTE,
  EDITOR_TRANSITION_ATTRIBUTE,
  TRANSITION_EDITOR_WIDTH,
} from '../src/client/editor-track-transition.ts'
import { readNativeSidebarWidth, resolveFallbackDetailsWidth } from '../src/client/fallback-details-layout.ts'
import { EDITOR_COLLAPSED_ATTRIBUTE, installWorkbenchLayout } from '../src/client/layout-styles.ts'

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

  it('reads AppFrame sidebar geometry from its inline grid before fallback CSS', () => {
    const frame = document.createElement('div')
    const sidebar = document.createElement('div')
    frame.style.gridTemplateColumns = '56px minmax(0, 1fr) 0px'
    vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(rect(280))

    expect(readNativeSidebarWidth(frame, sidebar)).toBe(56)
  })

  it('keeps the native active-Session track untouched', () => {
    const { frame } = appFrameFixture('active', 312)
    frame.removeAttribute('data-details-collapsed')
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })
    const visibility = editorVisibility()

    installWorkbenchLayout(ctx, visibility)
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(true)
    expect(frame.querySelector(`[${CONVERSATION_ROOT_ATTRIBUTE}]`)).not.toBeNull()
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 0px')
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(false)
    const style = document.head.querySelector<HTMLStyleElement>('[data-dsh-workbench-layout]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(':not([data-details-collapsed])')
    expect(style?.textContent).toContain("[data-side='details']::after")
    expect(style?.textContent).toContain('data-dsh-workbench-conversation-narrow')
    expect(style?.textContent).toContain("[role='status']:has(> code) > code")
    expect(style?.textContent).toContain('[data-input-scroll] + div')
    expect(style?.textContent).toContain("[data-slot='conversation.input.model']")
    expect(style?.textContent).toContain('[data-composer-seat]')
    expect(style?.textContent).toContain("[data-slot='conversation.input.model'] > div {\n  flex: 0 1 auto;")
    expect(style?.textContent).toContain("button[aria-haspopup='menu'] {\n  width: auto;")
    expect(style?.textContent).toContain('padding-inline: 8px')
    expect(style?.textContent).toContain(`:not([${EDITOR_COLLAPSED_ATTRIBUTE}]):not([data-details-collapsed]) > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}]`)
    expect(style?.textContent).toContain(`:not([${EDITOR_COLLAPSED_ATTRIBUTE}])[data-dsh-workbench-fallback-details] > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}]`)
    expect(style?.textContent).toContain(`[${EDITOR_TRANSITION_ATTRIBUTE}] > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}]`)
    expect(style?.textContent).toContain(`@property ${TRANSITION_EDITOR_WIDTH}`)
    expect(style?.textContent).toContain(`${TRANSITION_EDITOR_WIDTH} var(--ds-transition-duration-slow) var(--ds-ease-in-out)`)
    expect(style?.textContent).toContain(`[${EDITOR_RELEASE_ATTRIBUTE}] {
  transition: none !important;`)
    expect(style?.textContent).not.toContain('> :nth-child(2) [data-phase]')
    expect(style?.textContent).not.toContain('[data-composer-card]')
    expect(style?.textContent).not.toContain('--dsw-alias-bg-base: var(--dsw-specific-sidebar-fill)')
    expect(style?.textContent).toContain(EDITOR_COLLAPSED_ATTRIBUTE)
    expect(style?.textContent).toContain('data-dsh-workbench-session-log-button')
    expect(style?.textContent).toContain('> span[aria-hidden]:last-child')
    expect(style?.textContent).toContain("button[aria-haspopup='menu'] > svg:last-child")
    expect(style?.textContent).toContain('data-dsh-workbench-floating-model-menu')
    expect(style?.textContent).toContain('position: fixed !important')
    expect(style?.textContent).not.toContain('flex-direction: column')

    visibility.setExpanded(false)
    expect(frame.hasAttribute(EDITOR_COLLAPSED_ATTRIBUTE)).toBe(true)
    visibility.setExpanded(true)
    expect(frame.hasAttribute(EDITOR_COLLAPSED_ATTRIBUTE)).toBe(false)

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
    const visibility = editorVisibility()

    installWorkbenchLayout(ctx, visibility)
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(true)
    expect(frame.style.getPropertyValue('--dsh-workbench-fallback-sidebar-width')).toBe('280px')
    expect(frame.style.getPropertyValue('--dsh-workbench-fallback-details-width')).toBe('360px')
    expect(frame.querySelector('[data-dsh-workbench-fallback-handle]')).not.toBeNull()
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('activated blank-Session'))

    visibility.setExpanded(false)
    expect(frame.hasAttribute(EDITOR_COLLAPSED_ATTRIBUTE)).toBe(true)
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(false)
    expect(frame.querySelector<HTMLElement>('[data-dsh-workbench-fallback-handle]')?.hidden).toBe(true)

    visibility.setExpanded(true)
    expect(frame.hasAttribute(EDITOR_COLLAPSED_ATTRIBUTE)).toBe(false)
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(true)

    conversation.dataset.phase = 'active'
    await vi.waitFor(() => {
      expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(false)
    })
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('released blank-Session'))

    dispose?.()
    expect(frame.querySelector('[data-dsh-workbench-fallback-handle]')).toBeNull()
  })

  it('mirrors sidebar collapse, expansion and drag widths during a blank Session', async () => {
    const { frame } = appFrameFixture('hero')
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })

    installWorkbenchLayout(ctx, editorVisibility())
    expect(frame.style.getPropertyValue('--dsh-workbench-fallback-sidebar-width')).toBe('280px')

    frame.style.gridTemplateColumns = '56px minmax(0, 1fr) 0px'
    frame.toggleAttribute('data-sidebar-collapsed', true)
    await vi.waitFor(() => {
      expect(frame.style.getPropertyValue('--dsh-workbench-fallback-sidebar-width')).toBe('56px')
    })
    expect(frame.style.getPropertyValue('--dsh-workbench-fallback-details-width')).toBe('360px')

    frame.style.gridTemplateColumns = '344px minmax(0, 1fr) 0px'
    frame.removeAttribute('data-sidebar-collapsed')
    await vi.waitFor(() => {
      expect(frame.style.getPropertyValue('--dsh-workbench-fallback-sidebar-width')).toBe('344px')
    })
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('collapsed sidebar track at 56px'))
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('expanded sidebar track at 344px'))

    dispose?.()
  })
})

function appFrameFixture(phase: 'hero' | 'active', sidebarWidth = 280) {
  const frame = document.createElement('div')
  frame.style.gridTemplateColumns = `${sidebarWidth}px minmax(0, 1fr) 0px`
  frame.toggleAttribute('data-details-collapsed', true)
  const sidebar = document.createElement('div')
  const conversationColumn = document.createElement('div')
  const conversationSlot = document.createElement('div')
  conversationSlot.dataset.slot = 'conversation'
  const conversation = document.createElement('div')
  conversation.dataset.phase = phase
  const conversationScroll = document.createElement('div')
  conversationScroll.dataset.conversationScroll = ''
  const textarea = document.createElement('textarea')
  textarea.dataset.phase = 'inert'
  conversationScroll.appendChild(textarea)
  conversation.appendChild(conversationScroll)
  conversationSlot.appendChild(conversation)
  conversationColumn.appendChild(conversationSlot)
  const details = document.createElement('div')
  details.appendChild(document.createElement('div'))
  const overlay = document.createElement('div')
  overlay.dataset.shellOverlay = ''
  frame.append(sidebar, conversationColumn, details, overlay)
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(1400))
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(rect(sidebarWidth))
  expect(conversationColumn.querySelector(":scope > [data-slot='conversation'] > [data-phase]")).toBe(conversation)
  expect(conversationColumn.querySelector(':scope > textarea[data-phase]')).toBeNull()
  return { frame, conversation }
}

function contextWithDispose(onDispose: (dispose: () => void) => void): ClientContext {
  return {
    effect: vi.fn((setup: () => () => void) => { onDispose(setup()) }),
    logger: { info: vi.fn() },
  } as unknown as ClientContext
}

function editorVisibility(initial = true) {
  let editorExpanded = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => ({ editorExpanded }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setExpanded: (next: boolean) => {
      editorExpanded = next
      listeners.forEach(listener => { listener() })
    },
  }
}

function rect(width: number): DOMRect {
  return { width, height: 800, x: 0, y: 0, top: 0, right: width, bottom: 800, left: 0, toJSON: () => ({}) }
}
