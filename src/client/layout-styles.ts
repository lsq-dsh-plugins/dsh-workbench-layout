/** Stable-attribute bridge that reorders DSH's existing AppFrame columns. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const FRAME_ATTRIBUTE = 'data-dsh-workbench-frame'

const CSS = `
[${FRAME_ATTRIBUTE}] {
  --dsh-workbench-sidebar-width: 280px;
  grid-template-columns:
    var(--dsh-workbench-sidebar-width)
    minmax(340px, 1fr)
    minmax(480px, 44vw) !important;
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

@media (max-width: 1050px) {
  [${FRAME_ATTRIBUTE}] {
    grid-template-columns:
      var(--dsh-workbench-sidebar-width)
      minmax(300px, 0.9fr)
      minmax(410px, 1.1fr) !important;
  }
}

@media (max-width: 800px) {
  [${FRAME_ATTRIBUTE}] {
    grid-template-columns:
      var(--dsh-workbench-sidebar-width)
      minmax(270px, 0.85fr)
      minmax(370px, 1.15fr) !important;
  }
}
`

/** Install layout CSS and mirror the official sidebar track into a CSS variable. */
export function installWorkbenchLayout(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshWorkbenchLayout = ''
    style.textContent = CSS
    document.head.appendChild(style)

    let frame: HTMLElement | null = null
    let frameObserver: MutationObserver | null = null
    const syncSidebarWidth = (): void => {
      if (frame === null) return
      const match = /^\s*([0-9.]+)px\b/u.exec(frame.style.gridTemplateColumns)
      if (match?.[1] === undefined) return
      const width = `${match[1]}px`
      if (frame.style.getPropertyValue('--dsh-workbench-sidebar-width') !== width) {
        frame.style.setProperty('--dsh-workbench-sidebar-width', width)
      }
    }
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (next === frame) return
      frameObserver?.disconnect()
      frame?.removeAttribute(FRAME_ATTRIBUTE)
      frame?.style.removeProperty('--dsh-workbench-sidebar-width')
      frame = next
      if (frame === null) return
      frame.setAttribute(FRAME_ATTRIBUTE, '')
      syncSidebarWidth()
      frameObserver = new MutationObserver(syncSidebarWidth)
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
      frame?.style.removeProperty('--dsh-workbench-sidebar-width')
      style.remove()
    }
  }, 'workbench-layout: AppFrame column presentation')
}
