/** Stable-attribute bridge that reorders DSH's existing AppFrame columns. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_PREFERENCE_ATTRIBUTE,
  CHAT_WIDTH_PROPERTY,
  loadChatWidth,
  resolveChatWidth,
  storeChatWidth,
} from './column-width.ts'

const FRAME_ATTRIBUTE = 'data-dsh-workbench-frame'

const CSS = `
[${FRAME_ATTRIBUTE}] {
  --dsh-workbench-sidebar-width: 280px;
  ${CHAT_WIDTH_PROPERTY}: ${CHAT_WIDTH_DEFAULT}px;
  grid-template-columns:
    var(--dsh-workbench-sidebar-width)
    minmax(280px, 1fr)
    minmax(0, var(${CHAT_WIDTH_PROPERTY})) !important;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2) {
  grid-column: 3;
  grid-row: 1;
  border-left: 1px solid var(--dsw-alias-border-l2);
}

[${FRAME_ATTRIBUTE}] > :nth-child(3) {
  grid-column: 2;
  grid-row: 1;
  border-left: none !important;
  border-right: 1px solid var(--dsw-alias-border-l2);
}

[${FRAME_ATTRIBUTE}] > [data-side='details'] {
  display: none !important;
}

`

/** Apply one preferred width, constrained against the live frame geometry. */
export function setWorkbenchChatWidth(frame: HTMLElement, preferred: number, persist: boolean): number {
  const normalized = resolveChatWidth(preferred, 0, 0)
  const sidebarWidth = Number.parseFloat(frame.style.getPropertyValue('--dsh-workbench-sidebar-width')) || 280
  const width = resolveChatWidth(normalized, frame.getBoundingClientRect().width, sidebarWidth)
  frame.setAttribute(CHAT_WIDTH_PREFERENCE_ATTRIBUTE, String(normalized))
  if (frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY) !== `${width}px`) {
    frame.style.setProperty(CHAT_WIDTH_PROPERTY, `${width}px`)
  }
  if (persist) storeChatWidth(normalized)
  return width
}

export function readWorkbenchChatWidth(frame: HTMLElement): number {
  return Number.parseFloat(frame.style.getPropertyValue(CHAT_WIDTH_PROPERTY)) || CHAT_WIDTH_DEFAULT
}

/** Install layout CSS and mirror the official sidebar track into a CSS variable. */
export function installWorkbenchLayout(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshWorkbenchLayout = ''
    style.textContent = CSS
    document.head.appendChild(style)

    let frame: HTMLElement | null = null
    let frameObserver: MutationObserver | null = null
    const syncFrame = (): void => {
      if (frame === null) return
      const match = /^\s*([0-9.]+)px\b/u.exec(frame.style.gridTemplateColumns)
      if (match?.[1] !== undefined) {
        const width = `${match[1]}px`
        if (frame.style.getPropertyValue('--dsh-workbench-sidebar-width') !== width) {
          frame.style.setProperty('--dsh-workbench-sidebar-width', width)
        }
      }
      const preferred = Number(frame.getAttribute(CHAT_WIDTH_PREFERENCE_ATTRIBUTE))
      setWorkbenchChatWidth(frame, Number.isFinite(preferred) ? preferred : loadChatWidth(), false)
    }
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (next === frame) return
      frameObserver?.disconnect()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame?.removeAttribute(CHAT_WIDTH_PREFERENCE_ATTRIBUTE)
      frame?.style.removeProperty('--dsh-workbench-sidebar-width')
      frame?.style.removeProperty(CHAT_WIDTH_PROPERTY)
      frame = next
      if (frame === null) return
      frame.setAttribute(FRAME_ATTRIBUTE, '')
      frame.setAttribute(CHAT_WIDTH_PREFERENCE_ATTRIBUTE, String(loadChatWidth()))
      syncFrame()
      frameObserver = new MutationObserver(syncFrame)
      frameObserver.observe(frame, { attributes: true, attributeFilter: ['style'] })
    }
    attach()
    const documentObserver = new MutationObserver(attach)
    documentObserver.observe(document.body, { childList: true, subtree: true })
    ctx.logger.info('workbench-layout: official AppFrame columns reordered for files and conversation')
    return () => {
      documentObserver.disconnect()
      frameObserver?.disconnect()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame?.removeAttribute(CHAT_WIDTH_PREFERENCE_ATTRIBUTE)
      frame?.style.removeProperty('--dsh-workbench-sidebar-width')
      frame?.style.removeProperty(CHAT_WIDTH_PROPERTY)
      style.remove()
    }
  }, 'workbench-layout: AppFrame column presentation')
}
