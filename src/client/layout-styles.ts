/** 通过稳定属性调整 DSH 现有 AppFrame 内部组件的列顺序。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
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
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (next === frame) return
      fallbackTrack?.dispose()
      fallbackTrack = undefined
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame = next
      if (frame === null) return
      frame.setAttribute(FRAME_ATTRIBUTE, '')
      fallbackTrack = createFallbackDetailsTrack(frame, ctx.logger)
    }
    attach()
    const documentObserver = new MutationObserver(attach)
    documentObserver.observe(document.body, { childList: true, subtree: true })
    ctx.logger.info('workbench-layout: native AppFrame tracks and drag handles adopted for workbench columns')
    return () => {
      documentObserver.disconnect()
      fallbackTrack?.dispose()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      style.remove()
    }
  }, 'workbench-layout: AppFrame column presentation')
}
