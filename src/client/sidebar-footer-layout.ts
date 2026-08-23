/** 将官方侧栏底部的扩展操作与设置入口组织为同一行。 */

export const SIDEBAR_FOOT_ATTRIBUTE = 'data-dsh-workbench-sidebar-foot'
export const SIDEBAR_FOOT_ACTIONS_ATTRIBUTE = 'data-dsh-workbench-sidebar-foot-actions'
export const SIDEBAR_SETTINGS_AREA_ATTRIBUTE = 'data-dsh-workbench-sidebar-settings-area'

export interface SidebarFooterLogger {
  info(message: string): void
}

export interface SidebarFooterLayout {
  setWide(wide: boolean): void
  dispose(): void
}

/**
 * 标记官方 footer.action 与 settings 的共同父级，不移动任何 React 节点。
 * 展开侧栏的同行布局完全由这些稳定属性驱动。
 */
export function createSidebarFooterLayout(
  initiallyWide: boolean,
  logger: SidebarFooterLogger,
): SidebarFooterLayout {
  let foot: HTMLElement | null = null
  let actions: HTMLElement | null = null
  let settings: HTMLElement | null = null
  let wide = initiallyWide

  const clear = (): void => {
    foot?.removeAttribute(SIDEBAR_FOOT_ATTRIBUTE)
    foot?.removeAttribute('data-wide')
    actions?.removeAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE)
    settings?.removeAttribute(SIDEBAR_SETTINGS_AREA_ATTRIBUTE)
    foot = null
    actions = null
    settings = null
  }

  const reconcile = (): void => {
    const actionSeat = document.querySelector<HTMLElement>('[data-slot="sidebar.footer.action"]')
    const settingsSeat = document.querySelector<HTMLElement>('[data-slot="sidebar.settings"]')
    const nextActions = actionSeat?.parentElement ?? null
    const nextSettings = settingsSeat?.parentElement ?? null
    const nextFoot = nextSettings?.parentElement ?? null
    if (nextFoot === null || nextActions === null || nextSettings === null || nextActions.parentElement !== nextFoot) {
      clear()
      return
    }
    if (foot === nextFoot && actions === nextActions && settings === nextSettings) {
      foot.toggleAttribute('data-wide', wide)
      return
    }

    clear()
    foot = nextFoot
    actions = nextActions
    settings = nextSettings
    nextFoot.setAttribute(SIDEBAR_FOOT_ATTRIBUTE, '')
    nextFoot.toggleAttribute('data-wide', wide)
    nextActions.setAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE, '')
    nextSettings.setAttribute(SIDEBAR_SETTINGS_AREA_ATTRIBUTE, '')
    logger.info('workbench-layout: aligned middle-editor control with the official Settings row')
  }

  reconcile()
  const observer = new MutationObserver(reconcile)
  observer.observe(document.body, { childList: true, subtree: true })
  return {
    setWide: (next) => {
      wide = next
      foot?.toggleAttribute('data-wide', wide)
    },
    dispose: () => {
      observer.disconnect()
      clear()
    },
  }
}
