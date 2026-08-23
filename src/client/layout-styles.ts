/** 通过稳定属性调整 DSH 现有 AppFrame 内部组件的列顺序。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CONVERSATION_NARROW_ATTRIBUTE,
  CONVERSATION_ROOT_ATTRIBUTE,
  createConversationLayout,
  FLOATING_MENU_LEFT_PROPERTY,
  FLOATING_MENU_TOP_PROPERTY,
  FLOATING_MODEL_MENU_ATTRIBUTE,
  SESSION_LOG_BUTTON_ATTRIBUTE,
  type ConversationLayout,
} from './conversation-layout.ts'
import {
  createEditorTrackTransition,
  type EditorTrackTransition,
} from './editor-track-transition.ts'
import {
  EDITOR_COLLAPSED_ATTRIBUTE,
  EDITOR_RELEASE_ATTRIBUTE,
  EDITOR_TRANSITION_ATTRIBUTE,
  FRAME_ATTRIBUTE,
  TRANSITION_CONVERSATION_WIDTH,
  TRANSITION_EDITOR_WIDTH,
  TRANSITION_SIDEBAR_WIDTH,
} from './editor-layout-contract.ts'
import {
  createFallbackDetailsTrack,
  FALLBACK_DETAILS_ATTRIBUTE,
  FALLBACK_DETAILS_WIDTH,
  FALLBACK_DRAGGING_ATTRIBUTE,
  FALLBACK_HANDLE_ATTRIBUTE,
  FALLBACK_SIDEBAR_WIDTH,
  type FallbackDetailsTrack,
} from './fallback-details-layout.ts'

export { EDITOR_COLLAPSED_ATTRIBUTE } from './editor-layout-contract.ts'

export interface WorkbenchEditorVisibilityStore {
  getSnapshot(): { editorExpanded: boolean }
  subscribe(listener: () => void): () => void
}

const CSS = `
@property ${TRANSITION_SIDEBAR_WIDTH} {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

@property ${TRANSITION_EDITOR_WIDTH} {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

@property ${TRANSITION_CONVERSATION_WIDTH} {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}]):not([data-details-collapsed]) > :nth-child(2),
[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}])[${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(2),
[${FRAME_ATTRIBUTE}][${EDITOR_TRANSITION_ATTRIBUTE}] > :nth-child(2) {
  grid-column: 3;
  grid-row: 1;
  border-left: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-specific-sidebar-fill);
}

/* Only the native ConversationRoot inside CenterColumn's official slot wrapper
   receives the workbench surface. InputBar and its phase-bearing textarea stay
   wholly owned by DSH's official component styles. */
[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}]):not([data-details-collapsed]) > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}],
[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}])[${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}],
[${FRAME_ATTRIBUTE}][${EDITOR_TRANSITION_ATTRIBUTE}] > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}] {
  background: var(--dsw-specific-sidebar-fill);
}

/* The official active composer mask references the original center surface;
   only its backdrop stop follows the relocated conversation surface. */
[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}]):not([data-details-collapsed]) > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}][data-phase='active'] [data-composer-seat],
[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}])[${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}][data-phase='active'] [data-composer-seat],
[${FRAME_ATTRIBUTE}][${EDITOR_TRANSITION_ATTRIBUTE}] > :nth-child(2) [${CONVERSATION_ROOT_ATTRIBUTE}][data-phase='active'] [data-composer-seat] {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--dsw-specific-sidebar-fill) 0%, transparent) 0px,
    var(--dsw-specific-sidebar-fill) 36px
  );
}

[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}]):not([data-details-collapsed]) > :nth-child(3),
[${FRAME_ATTRIBUTE}]:not([${EDITOR_COLLAPSED_ATTRIBUTE}])[${FALLBACK_DETAILS_ATTRIBUTE}] > :nth-child(3),
[${FRAME_ATTRIBUTE}][${EDITOR_TRANSITION_ATTRIBUTE}] > :nth-child(3) {
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

/* During a visibility toggle, keep the reordered occupants fixed and animate
   two registered length tracks. Registering the variables is required for
   Firefox and Chromium to interpolate their dependent grid geometry. */
[${FRAME_ATTRIBUTE}][${EDITOR_TRANSITION_ATTRIBUTE}] {
  grid-template-columns:
    var(${TRANSITION_SIDEBAR_WIDTH})
    minmax(0, var(${TRANSITION_EDITOR_WIDTH}))
    minmax(0, var(${TRANSITION_CONVERSATION_WIDTH})) !important;
  transition:
    ${TRANSITION_EDITOR_WIDTH} var(--ds-transition-duration-slow) var(--ds-ease-in-out),
    ${TRANSITION_CONVERSATION_WIDTH} var(--ds-transition-duration-slow) var(--ds-ease-in-out) !important;
}

/* Swapping reordered and native track definitions must be one atomic layout
   update. Otherwise AppFrame animates the reversed native tracks a second time
   and briefly gives the collapsed editor the full conversation width. */
[${FRAME_ATTRIBUTE}][${EDITOR_RELEASE_ATTRIBUTE}] {
  transition: none !important;
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
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-slot='conversation.input.model'] button[aria-haspopup='menu'] {
  width: auto;
  max-width: 100%;
  padding-inline: 8px;
}

[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-slot='conversation.input.model'] button[aria-haspopup='menu'] > span:nth-of-type(2) {
  display: none;
}

/* Only the PermissionSelect chevron is omitted from the left tool group.
   The Plan chip and conversation-header disclosure controls remain intact. */
[${FRAME_ATTRIBUTE}] > :nth-child(2)[${CONVERSATION_NARROW_ATTRIBUTE}] [data-input-scroll] + div > div:first-child > div:first-of-type > span:first-child > button {
  padding-inline: 8px;
}

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

/** 安装可收起的列顺序样式，并仅为空会话补足 AppFrame 主动隐藏的详情轨道。 */
export function installWorkbenchLayout(ctx: ClientContext, visibility: WorkbenchEditorVisibilityStore): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshWorkbenchLayout = ''
    style.textContent = CSS
    document.head.appendChild(style)

    let frame: HTMLElement | null = null
    let fallbackTrack: FallbackDetailsTrack | undefined
    let conversationLayout: ConversationLayout | undefined
    let editorTransition: EditorTrackTransition | undefined
    let editorExpanded = visibility.getSnapshot().editorExpanded
    const synchronizeVisibility = (): void => {
      const nextExpanded = visibility.getSnapshot().editorExpanded
      editorTransition?.setExpanded(nextExpanded)
      editorExpanded = nextExpanded
      frame?.toggleAttribute(EDITOR_COLLAPSED_ATTRIBUTE, !nextExpanded)
      fallbackTrack?.setEnabled(nextExpanded)
    }
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (next === frame) return
      conversationLayout?.dispose()
      conversationLayout = undefined
      editorTransition?.dispose()
      editorTransition = undefined
      fallbackTrack?.dispose()
      fallbackTrack = undefined
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame?.removeAttribute(EDITOR_COLLAPSED_ATTRIBUTE)
      frame = next
      if (frame === null) return
      frame.setAttribute(FRAME_ATTRIBUTE, '')
      frame.toggleAttribute(EDITOR_COLLAPSED_ATTRIBUTE, !editorExpanded)
      fallbackTrack = createFallbackDetailsTrack(frame, ctx.logger, editorExpanded)
      editorTransition = createEditorTrackTransition(frame, ctx.logger, editorExpanded)
      const conversationColumn = frame.children.item(1)
      if (conversationColumn instanceof HTMLElement) {
        conversationLayout = createConversationLayout(conversationColumn, ctx.logger)
      }
    }
    attach()
    const documentObserver = new MutationObserver(attach)
    documentObserver.observe(document.body, { childList: true, subtree: true })
    const unsubscribeVisibility = visibility.subscribe(synchronizeVisibility)
    ctx.logger.info('workbench-layout: native AppFrame tracks, root-scoped conversation surface, and content-sized narrow model selector adopted')
    return () => {
      documentObserver.disconnect()
      unsubscribeVisibility()
      conversationLayout?.dispose()
      editorTransition?.dispose()
      fallbackTrack?.dispose()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame?.removeAttribute(EDITOR_COLLAPSED_ATTRIBUTE)
      style.remove()
    }
  }, 'workbench-layout: AppFrame column presentation')
}
