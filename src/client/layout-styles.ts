/** 通过稳定属性调整 DSH 现有 AppFrame 内部组件的列顺序。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const FRAME_ATTRIBUTE = 'data-dsh-workbench-frame'

const CSS = `
[${FRAME_ATTRIBUTE}]:not([data-details-collapsed]) > :nth-child(2) {
  grid-column: 3;
  grid-row: 1;
  border-left: 1px solid var(--dsw-alias-border-l1);
}

[${FRAME_ATTRIBUTE}]:not([data-details-collapsed]) > :nth-child(3) {
  grid-column: 2;
  grid-row: 1;
  border-left: none !important;
}

[${FRAME_ATTRIBUTE}] > [data-side='details']::after {
  display: none !important;
}
`

/** 安装列顺序样式，不接管 AppFrame 原生列宽。 */
export function installWorkbenchLayout(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshWorkbenchLayout = ''
    style.textContent = CSS
    document.head.appendChild(style)

    let frame: HTMLElement | null = null
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (next === frame) return
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame = next
      if (frame === null) return
      frame.setAttribute(FRAME_ATTRIBUTE, '')
    }
    attach()
    const documentObserver = new MutationObserver(attach)
    documentObserver.observe(document.body, { childList: true, subtree: true })
    ctx.logger.info('workbench-layout: native AppFrame tracks and drag handles adopted for workbench columns')
    return () => {
      documentObserver.disconnect()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      style.remove()
    }
  }, 'workbench-layout: AppFrame column presentation')
}
