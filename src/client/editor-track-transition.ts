/** 中栏显隐期间同步 AppFrame 两个内容轨道，结束后交还官方布局。 */

import { FALLBACK_DETAILS_WIDTH } from './fallback-details-layout.ts'

export const EDITOR_TRANSITION_ATTRIBUTE = 'data-dsh-workbench-editor-transition'
export const TRANSITION_SIDEBAR_WIDTH = '--dsh-workbench-transition-sidebar-width'
export const TRANSITION_EDITOR_WIDTH = '--dsh-workbench-transition-editor-width'
export const TRANSITION_CONVERSATION_WIDTH = '--dsh-workbench-transition-conversation-width'
export const EDITOR_TRANSITION_START_EVENT = 'dsh-workbench:editor-transition-start'
export const EDITOR_TRANSITION_END_EVENT = 'dsh-workbench:editor-transition-end'

const DETAILS_DEFAULT = 360
const TRANSITION_FALLBACK_MS = 360
const LAST_PIXEL_TRACK = /(\d+(?:\.\d+)?)px\s*$/u

export interface EditorTrackTransitionLogger {
  info(message: string): void
}

export interface EditorTrackTransition {
  setExpanded(expanded: boolean): void
  dispose(): void
}

/**
 * Animate the reordered editor/conversation tracks with the same duration and
 * easing as AppFrame. Both endpoints match AppFrame exactly, so removing the
 * temporary pixel tracks after transitionend does not create a second jump.
 */
export function createEditorTrackTransition(
  frame: HTMLElement,
  logger: EditorTrackTransitionLogger,
  initiallyExpanded: boolean,
): EditorTrackTransition {
  let targetExpanded = initiallyExpanded
  let animationFrame: number | null = null
  let fallbackTimer: number | null = null
  let targetApplied = false
  let transitionAnnounced = false

  const cancelPending = (): void => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
    animationFrame = null
    fallbackTimer = null
    targetApplied = false
  }

  const clearPresentation = (): void => {
    cancelPending()
    frame.removeAttribute(EDITOR_TRANSITION_ATTRIBUTE)
    frame.style.removeProperty(TRANSITION_SIDEBAR_WIDTH)
    frame.style.removeProperty(TRANSITION_EDITOR_WIDTH)
    frame.style.removeProperty(TRANSITION_CONVERSATION_WIDTH)
  }

  const finish = (): void => {
    clearPresentation()
    if (transitionAnnounced) {
      transitionAnnounced = false
      frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_END_EVENT, { bubbles: true }))
    }
  }

  const onTransitionEnd = (event: TransitionEvent): void => {
    if (!targetApplied || event.target !== frame || event.propertyName !== 'grid-template-columns') return
    finish()
  }
  frame.addEventListener('transitionend', onTransitionEnd)

  const setExpanded = (next: boolean): void => {
    if (next === targetExpanded) return
    targetExpanded = next
    const sidebar = frame.children.item(0)
    const conversation = frame.children.item(1)
    const editor = frame.children.item(2)
    if (!(sidebar instanceof HTMLElement)
      || !(conversation instanceof HTMLElement)
      || !(editor instanceof HTMLElement)
      || prefersReducedMotion()) {
      finish()
      return
    }

    const frameWidth = Math.round(frame.getBoundingClientRect().width)
    const sidebarWidth = Math.round(sidebar.getBoundingClientRect().width)
    const conversationWidth = Math.round(conversation.getBoundingClientRect().width)
    const editorWidth = Math.round(editor.getBoundingClientRect().width)
    const availableWidth = Math.max(0, frameWidth - sidebarWidth)
    if (frameWidth <= 0 || sidebarWidth <= 0 || availableWidth <= 0) {
      finish()
      return
    }

    cancelPending()
    setPixels(frame, TRANSITION_SIDEBAR_WIDTH, sidebarWidth)
    setPixels(frame, TRANSITION_EDITOR_WIDTH, Math.min(editorWidth, availableWidth))
    setPixels(frame, TRANSITION_CONVERSATION_WIDTH, Math.min(conversationWidth, availableWidth))
    frame.setAttribute(EDITOR_TRANSITION_ATTRIBUTE, '')
    if (!transitionAnnounced) {
      transitionAnnounced = true
      frame.dispatchEvent(new CustomEvent(EDITOR_TRANSITION_START_EVENT, { bubbles: true }))
    }

    /* Two frames are intentional: the first lets the browser paint the
       geometry-equivalent reordered start; the second writes the target.
       A single rAF is still before that first paint and gets coalesced. */
    animationFrame = requestAnimationFrame(() => {
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null
        const currentFrameWidth = Math.round(frame.getBoundingClientRect().width)
        const currentSidebarWidth = Math.round(sidebar.getBoundingClientRect().width)
        const currentAvailableWidth = Math.max(0, currentFrameWidth - currentSidebarWidth)
        const targetConversationWidth = next
          ? resolveExpandedConversationWidth(frame, currentAvailableWidth)
          : currentAvailableWidth
        setPixels(frame, TRANSITION_SIDEBAR_WIDTH, currentSidebarWidth)
        setPixels(frame, TRANSITION_EDITOR_WIDTH, Math.max(0, currentAvailableWidth - targetConversationWidth))
        setPixels(frame, TRANSITION_CONVERSATION_WIDTH, targetConversationWidth)
        targetApplied = true
        fallbackTimer = window.setTimeout(finish, TRANSITION_FALLBACK_MS)
      })
    })
    logger.info(`workbench-layout: synchronized two-frame ${next ? 'expand' : 'collapse'} transition for middle editor tracks`)
  }

  return {
    setExpanded,
    dispose: () => {
      frame.removeEventListener('transitionend', onTransitionEnd)
      finish()
    },
  }
}

function resolveExpandedConversationWidth(frame: HTMLElement, availableWidth: number): number {
  const fallbackWidth = parsePixels(frame.style.getPropertyValue(FALLBACK_DETAILS_WIDTH))
  const nativeWidth = parseLastTrack(frame.style.gridTemplateColumns)
  const preferredWidth = fallbackWidth > 0 ? fallbackWidth : nativeWidth > 0 ? nativeWidth : DETAILS_DEFAULT
  return Math.min(availableWidth, preferredWidth)
}

function parseLastTrack(value: string): number {
  const match = LAST_PIXEL_TRACK.exec(value)
  return match === null ? 0 : Number(match[1])
}

function parsePixels(value: string): number {
  const width = Number.parseFloat(value)
  return Number.isFinite(width) ? Math.max(0, width) : 0
}

function setPixels(element: HTMLElement, property: string, width: number): void {
  element.style.setProperty(property, `${Math.max(0, Math.round(width))}px`)
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
