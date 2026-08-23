/** 通过稳定属性调整 DSH 现有 AppFrame 内部组件的列顺序。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CONVERSATION_NARROW_ATTRIBUTE,
  createConversationLayout,
  FLOATING_MENU_LEFT_PROPERTY,
  FLOATING_MENU_TOP_PROPERTY,
  FLOATING_MODEL_MENU_ATTRIBUTE,
  SESSION_LOG_BUTTON_ATTRIBUTE,
  type ConversationLayout,
} from './conversation-layout.ts'
import {
  createFallbackDetailsTrack,
  FALLBACK_DETAILS_ATTRIBUTE,
  FALLBACK_DETAILS_WIDTH,
  FALLBACK_DRAGGING_ATTRIBUTE,
  FALLBACK_HANDLE_ATTRIBUTE,
  FALLBACK_SIDEBAR_WIDTH,
  type FallbackDetailsTrack,
} from './fallback-details-layout.ts'

const FRAME_ATTRIBUTE = 'data-dsh-workbench-frame'

const CSS = `
[${FRAME_ATTRIBUTE}]:not([data-details-collapsed]) > :nth-child(2),
[${FRAME_ATTRIBUTE}][${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(2) {
  grid-column: 3;
  grid-row: 1;
  border-left: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-specific-sidebar-fill);
}

/* The right conversation uses the same official theme surface as the left
   sidebar. Rebinding the base token at the native root also keeps its sticky
   composer fade and queue surfaces continuous in light and dark themes. */
[${FRAME_ATTRIBUTE}]:not([data-details-collapsed]) > :nth-child(2) [data-phase],
[${FRAME_ATTRIBUTE}][${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(2) [data-phase] {
  --dsw-alias-bg-base: var(--dsw-specific-sidebar-fill);
  background: var(--dsw-specific-sidebar-fill);
}

[${FRAME_ATTRIBUTE}]:not([data-details-collapsed]) > :nth-child(3),
[${FRAME_ATTRIBUTE}][${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(3) {
  grid-column: 2;
  grid-row: 1;
  border-left: none !important;
}

[${FRAME_ATTRIBUTE}][${FALLBACK_DETAILS_ATTRIBUTE}] {
  grid-template-columns:
    var(${FALLBACK_SIDEBAR_WIDTH})
    minmax(0, 1fr)
    var(${FALLBACK_DETAILS_WIDTH}) !important;
}

[${FRAME_ATTRIBUTE}][${FALLBACK_DRAGGING_ATTRIBUTE}] {
  transition: none !important;
}

[${FRAME_ATTRIBUTE}] > [${FALLBACK_HANDLE_ATTRIBUTE}] {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(100% - var(${FALLBACK_DETAILS_WIDTH}));
  width: 8px;
  margin-left: -4px;
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
  transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}

[${FRAME_ATTRIBUTE}][${FALLBACK_DRAGGING_ATTRIBUTE}] > [${FALLBACK_HANDLE_ATTRIBUTE}] {
  transition: none;
}

[${FRAME_ATTRIBUTE}] > [data-side='details']::after {
  display: none !important;
}

/* The native failure row reserves its code as a full auto-sized third column.
   Once conversation moves into the narrow right track that leaves only a few
   words per line for the actual message, so the code moves below the copy. */
[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [role='status']:has(> code) {
  grid-template-columns: 10px minmax(0, 1fr);
  column-gap: 8px;
  row-gap: 2px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [role='status']:has(> code) > code {
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

/* Keep the official composer toolbar on one row. Fixed actions retain their
   hit targets; gaps, effort text, and the flexible model label concede. */
[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-input-scroll] + div {
  gap: 4px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-input-scroll] + div > div:first-child {
  flex: 0 1 auto;
  gap: 8px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-input-scroll] + div > div:first-child > div {
  gap: 6px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-input-scroll] + div > div:last-child {
  flex: 1 1 0;
  justify-content: flex-end;
  gap: 6px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-slot='conversation.input.model'] > div {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-slot='conversation.input.model'] button[aria-haspopup='menu'] {
  width: 100%;
  max-width: 100%;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-slot='conversation.input.model'] button[aria-haspopup='menu'] > span:nth-of-type(2) {
  display: none;
}

/* Only the PermissionSelect chevron is omitted from the left tool group.
   The Plan chip and conversation-header disclosure controls remain intact. */
[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-input-scroll] + div > div:first-child > div:first-of-type > span:first-child > button > span[aria-hidden]:last-child,
[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-slot='conversation.input.model'] button[aria-haspopup='menu'] > svg:last-child {
  display: none;
}

/* Match the composer's compact icon buttons only after the right column is
   narrow. At normal widths the official Session-log capsule is untouched. */
[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [${SESSION_LOG_BUTTON_ATTRIBUTE}] {
  width: 32px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  gap: 0;
  border: 0;
  border-radius: 999px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [${SESSION_LOG_BUTTON_ATTRIBUTE}] > span {
  display: none;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [${SESSION_LOG_BUTTON_ATTRIBUTE}] > svg {
  width: 16px;
  height: 16px;
}

/* Fixed positioning escapes the native conversation scroll/root clipping
   chain while the node remains in its official React tree for focus, outside
   click, keyboard navigation, and unmount ownership. */
[${FRAME_ATTRIBUTE}] [${FLOATING_MODEL_MENU_ATTRIBUTE}] {
  position: fixed !important;
  top: var(${FLOATING_MENU_TOP_PROPERTY}, 12px) !important;
  right: auto !important;
  bottom: auto !important;
  left: var(${FLOATING_MENU_LEFT_PROPERTY}, 12px) !important;
  z-index: 1000 !important;
}
`

/** 安装列顺序样式，并仅为空会话补足 AppFrame 主动隐藏的详情轨道。 */
export function installWorkbenchLayout(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshWorkbenchLayout = ''
    style.textContent = CSS
    document.head.appendChild(style)

    let frame: HTMLElement | null = null
    let fallbackTrack: FallbackDetailsTrack | undefined
    let conversationLayout: ConversationLayout | undefined
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (next === frame) return
      conversationLayout?.dispose()
      conversationLayout = undefined
      fallbackTrack?.dispose()
      fallbackTrack = undefined
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame = next
      if (frame === null) return
      frame.setAttribute(FRAME_ATTRIBUTE, '')
      fallbackTrack = createFallbackDetailsTrack(frame, ctx.logger)
      const conversationColumn = frame.children.item(1)
      if (conversationColumn instanceof HTMLElement) {
        conversationLayout = createConversationLayout(conversationColumn, ctx.logger)
      }
    }
    attach()
    const documentObserver = new MutationObserver(attach)
    documentObserver.observe(document.body, { childList: true, subtree: true })
    ctx.logger.info('workbench-layout: native AppFrame tracks, drag handles, and themed narrow conversation presentation adopted')
    return () => {
      documentObserver.disconnect()
      conversationLayout?.dispose()
      fallbackTrack?.dispose()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      style.remove()
    }
  }, 'workbench-layout: AppFrame column presentation')
}
