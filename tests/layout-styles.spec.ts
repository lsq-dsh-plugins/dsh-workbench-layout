// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  ASSISTANT_ACTIONS_ATTRIBUTE,
  ASSISTANT_METRICS_ATTRIBUTE,
  ASSISTANT_METRICS_WRAP_ATTRIBUTE,
  CONVERSATION_NARROW_ATTRIBUTE,
  CONVERSATION_ROOT_ATTRIBUTE,
} from '../src/client/conversation-layout.ts'
import {
  EDITOR_RELEASE_ATTRIBUTE,
  EDITOR_TRANSITION_ATTRIBUTE,
  TRANSITION_EDITOR_WIDTH,
} from '../src/client/editor-track-transition.ts'
import {
  DETAILS_TRACK_ATTRIBUTE,
  DETAILS_TRACK_NATIVE_HANDLE_ATTRIBUTE,
  DETAILS_TRACK_SIDEBAR_WIDTH,
  DETAILS_TRACK_WIDTH,
  readNativeSidebarWidth,
  resolveDetailsTrackMaximum,
  resolveDetailsTrackWidth,
  resolveResponsiveDetailsDefault,
} from '../src/client/details-track-layout.ts'
import { EDITOR_COLLAPSED_ATTRIBUTE, installWorkbenchLayout } from '../src/client/layout-styles.ts'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('workbench layout presentation', () => {
  it('uses a responsive default and preserves the AppFrame center concession', () => {
    expect(resolveResponsiveDetailsDefault(1280)).toBe(420)
    expect(resolveResponsiveDetailsDefault(1920)).toBe(614)
    expect(resolveResponsiveDetailsDefault(2560)).toBe(720)
    expect(resolveDetailsTrackMaximum(1920, 280)).toBe(1000)
    expect(resolveDetailsTrackWidth(1920, 280, 900)).toBe(900)
    expect(resolveDetailsTrackWidth(1400, 280, 900)).toBe(480)
    expect(resolveDetailsTrackWidth(1200, 280, 420)).toBe(0)
  })

  it('reads AppFrame sidebar geometry from its inline grid before fallback CSS', () => {
    const frame = document.createElement('div')
    const sidebar = document.createElement('div')
    frame.style.gridTemplateColumns = '56px minmax(0, 1fr) 0px'
    vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(rect(280))

    expect(readNativeSidebarWidth(frame, sidebar)).toBe(56)
  })

  it('keeps the native active-Session divider while widening its workbench track', () => {
    const { frame, detailsHandle } = appFrameFixture('active', 312)
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })
    const visibility = editorVisibility()

    installWorkbenchLayout(ctx, visibility, fileController())
    expect(frame.hasAttribute('data-dsh-workbench-frame')).toBe(true)
    expect(frame.querySelector(`[${CONVERSATION_ROOT_ATTRIBUTE}]`)).not.toBeNull()
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 360px')
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(false)
    expect(frame.hasAttribute(DETAILS_TRACK_ATTRIBUTE)).toBe(true)
    expect(frame.style.getPropertyValue(DETAILS_TRACK_SIDEBAR_WIDTH)).toBe('312px')
    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('448px')
    expect(detailsHandle?.hasAttribute(DETAILS_TRACK_NATIVE_HANDLE_ATTRIBUTE)).toBe(true)
    const style = document.head.querySelector<HTMLStyleElement>('[data-dsh-workbench-layout]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain(':not([data-details-collapsed])')
    expect(style?.textContent).toContain("[data-side='details']::after")
    expect(style?.textContent).toContain('data-dsh-workbench-conversation-narrow')
    expect(style?.textContent).toContain("[role='status']:has(> code) > code")
    expect(style?.textContent).toContain(`[${ASSISTANT_ACTIONS_ATTRIBUTE}]`)
    expect(style?.textContent).toContain('flex-wrap: wrap')
    expect(style?.textContent).toContain(`[${ASSISTANT_METRICS_ATTRIBUTE}]`)
    expect(style?.textContent).toContain('overflow-wrap: anywhere')
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
    expect(frame.style.gridTemplateColumns).toBe('312px minmax(0, 1fr) 360px')
    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('')
    expect(detailsHandle?.hasAttribute(DETAILS_TRACK_NATIVE_HANDLE_ATTRIBUTE)).toBe(false)
    expect(document.head.querySelector('[data-dsh-workbench-layout]')).toBeNull()
  })

  it('gives overflowing assistant metrics a wrapping line below the native action icons', () => {
    const { frame, conversation } = appFrameFixture('active', 312)
    const tail = document.createElement('div')
    tail.dataset.turnTail = 'turn-1'
    tail.dataset.timeHoverRoot = ''
    const actions = document.createElement('div')
    actions.appendChild(document.createElement('button'))
    const metrics = document.createElement('span')
    metrics.textContent = '8月22日 23:39 · 用时 2秒 · 首 token 2.1秒 · 250 tok/s'
    actions.appendChild(metrics)
    tail.appendChild(actions)
    conversation.appendChild(tail)
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined

    try {
      installWorkbenchLayout(contextWithDispose(value => { dispose = value }), editorVisibility(), fileController())
      actions.setAttribute(ASSISTANT_METRICS_WRAP_ATTRIBUTE, '')

      expect(actions.hasAttribute(ASSISTANT_ACTIONS_ATTRIBUTE)).toBe(true)
      expect(metrics.hasAttribute(ASSISTANT_METRICS_ATTRIBUTE)).toBe(true)
      expect(getComputedStyle(actions).flexWrap).toBe('wrap')
      expect(getComputedStyle(actions).height).toBe('auto')
      expect(getComputedStyle(metrics).whiteSpace).toBe('normal')
      expect(getComputedStyle(metrics).flexBasis).toBe('100%')
    } finally {
      dispose?.()
    }
  })

  it('opens a draggable workbench track for the blank-Session Hero and releases it when active', async () => {
    const { frame, conversation } = appFrameFixture('hero')
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })
    const visibility = editorVisibility()

    installWorkbenchLayout(ctx, visibility, fileController())
    expect(frame.hasAttribute('data-dsh-workbench-fallback-details')).toBe(true)
    expect(frame.style.getPropertyValue(DETAILS_TRACK_SIDEBAR_WIDTH)).toBe('280px')
    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('448px')
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
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('released responsive conversation track'))

    dispose?.()
    expect(frame.querySelector('[data-dsh-workbench-fallback-handle]')).toBeNull()
  })

  it('mirrors sidebar collapse, expansion and drag widths during a blank Session', async () => {
    const { frame } = appFrameFixture('hero')
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })

    installWorkbenchLayout(ctx, editorVisibility(), fileController())
    expect(frame.style.getPropertyValue(DETAILS_TRACK_SIDEBAR_WIDTH)).toBe('280px')

    frame.style.gridTemplateColumns = '56px minmax(0, 1fr) 0px'
    frame.toggleAttribute('data-sidebar-collapsed', true)
    await vi.waitFor(() => {
      expect(frame.style.getPropertyValue(DETAILS_TRACK_SIDEBAR_WIDTH)).toBe('56px')
    })
    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('448px')

    frame.style.gridTemplateColumns = '344px minmax(0, 1fr) 0px'
    frame.removeAttribute('data-sidebar-collapsed')
    await vi.waitFor(() => {
      expect(frame.style.getPropertyValue(DETAILS_TRACK_SIDEBAR_WIDTH)).toBe('344px')
    })
    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('416px')
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('collapsed sidebar at 56px'))
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('expanded sidebar at 344px'))

    dispose?.()
  })

  it('drags the native divider past the former 520px ceiling on a large screen', () => {
    const { frame, detailsHandle } = appFrameFixture('active', 280, 1920)
    document.body.appendChild(frame)
    let dispose: (() => void) | undefined
    const ctx = contextWithDispose(value => { dispose = value })

    installWorkbenchLayout(ctx, editorVisibility(), fileController())
    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('614px')
    expect(detailsHandle).not.toBeNull()

    dispatchPointer(detailsHandle!, 'pointerdown', 1200)
    dispatchPointer(detailsHandle!, 'pointerup', 900)

    expect(frame.style.getPropertyValue(DETAILS_TRACK_WIDTH)).toBe('914px')
    expect(detailsHandle?.getAttribute('aria-valuemax')).toBe('1000')
    expect(detailsHandle?.getAttribute('aria-valuenow')).toBe('914')
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('resized conversation track to 914px'))

    dispose?.()
  })
})

function appFrameFixture(phase: 'hero' | 'active', sidebarWidth = 280, frameWidth = 1400) {
  const frame = document.createElement('div')
  frame.style.gridTemplateColumns = `${sidebarWidth}px minmax(0, 1fr) ${phase === 'active' ? 360 : 0}px`
  frame.toggleAttribute('data-details-collapsed', phase !== 'active')
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
  const detailsHandle = phase === 'active' ? document.createElement('div') : null
  if (detailsHandle !== null) detailsHandle.dataset.side = 'details'
  frame.append(sidebar, conversationColumn, details, overlay)
  if (detailsHandle !== null) frame.appendChild(detailsHandle)
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(frameWidth))
  vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue(rect(sidebarWidth))
  expect(conversationColumn.querySelector(":scope > [data-slot='conversation'] > [data-phase]")).toBe(conversation)
  expect(conversationColumn.querySelector(':scope > textarea[data-phase]')).toBeNull()
  return { frame, conversation, detailsHandle }
}

function dispatchPointer(target: HTMLElement, type: string, clientX: number): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  target.dispatchEvent(event)
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

function fileController() {
  return {
    store: { getSnapshot: () => ({ workspaceId: 'workspace-1' }) },
    openConversationFile: vi.fn(() => Promise.resolve()),
  }
}

function rect(width: number): DOMRect {
  return { width, height: 800, x: 0, y: 0, top: 0, right: width, bottom: 800, left: 0, toJSON: () => ({}) }
}
