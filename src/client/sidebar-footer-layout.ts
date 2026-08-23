/** 将插件操作与官方设置入口组织为互不覆盖的底部工具行。 */

export const SIDEBAR_FOOT_ATTRIBUTE = 'data-dsh-workbench-sidebar-foot'
export const SIDEBAR_FOOT_ACTIONS_ATTRIBUTE = 'data-dsh-workbench-sidebar-foot-actions'
export const SIDEBAR_SETTINGS_AREA_ATTRIBUTE = 'data-dsh-workbench-sidebar-settings-area'
export const SIDEBAR_SETTINGS_TRIGGER_ATTRIBUTE = 'data-dsh-workbench-sidebar-settings-trigger'

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
  let settingsTrigger: HTMLButtonElement | null = null
  let wide = initiallyWide

  const clear = (): void => {
    foot?.removeAttribute(SIDEBAR_FOOT_ATTRIBUTE)
    foot?.removeAttribute('data-wide')
    actions?.removeAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE)
    settings?.removeAttribute(SIDEBAR_SETTINGS_AREA_ATTRIBUTE)
    settingsTrigger?.removeAttribute(SIDEBAR_SETTINGS_TRIGGER_ATTRIBUTE)
    foot = null
    actions = null
    settings = null
    settingsTrigger = null
  }

  const reconcile = (): void => {
    const actionSeat = document.querySelector<HTMLElement>('[data-slot="sidebar.footer.action"]')
    const settingsSeat = document.querySelector<HTMLElement>('[data-slot="sidebar.settings"]')
    const nextActions = actionSeat?.parentElement ?? null
    const nextSettings = settingsSeat?.parentElement ?? null
    const nextFoot = nextSettings?.parentElement ?? null
    const nextSettingsTrigger = settingsSeat?.querySelector<HTMLButtonElement>(':scope > button') ?? null
    if (nextFoot === null || nextActions === null || nextSettings === null || nextActions.parentElement !== nextFoot) {
      clear()
      return
    }
    if (foot === nextFoot && actions === nextActions && settings === nextSettings && settingsTrigger === nextSettingsTrigger) {
      foot.toggleAttribute('data-wide', wide)
      return
    }

    clear()
    foot = nextFoot
    actions = nextActions
    settings = nextSettings
    settingsTrigger = nextSettingsTrigger
    nextFoot.setAttribute(SIDEBAR_FOOT_ATTRIBUTE, '')
    nextFoot.toggleAttribute('data-wide', wide)
    nextActions.setAttribute(SIDEBAR_FOOT_ACTIONS_ATTRIBUTE, '')
    nextSettings.setAttribute(SIDEBAR_SETTINGS_AREA_ATTRIBUTE, '')
    nextSettingsTrigger?.setAttribute(SIDEBAR_SETTINGS_TRIGGER_ATTRIBUTE, '')
    logger.info('workbench-layout: separated middle-editor control beside the content-sized Settings action')
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
