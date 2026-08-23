/** 将底部扩展 slot 的模式切换安全投放到官方侧栏顶部。 */

export const SIDEBAR_TOP_HOST_ATTRIBUTE = 'data-dsh-workbench-sidebar-top'
export const SIDEBAR_NEW_SESSION_ATTRIBUTE = 'data-dsh-workbench-new-session'

export interface SidebarTopLogger {
  info(message: string): void
}

export interface SidebarTopMount {
  dispose(): void
}

/**
 * 以官方 sidebar.workspaces slot 为稳定锚点创建 Portal 宿主，不移动任何
 * React 持有的官方节点。
 */
export function createSidebarTopMount(
  className: string,
  onTarget: (target: HTMLElement | null) => void,
  logger: SidebarTopLogger,
): SidebarTopMount {
  let host: HTMLElement | null = null
  let newSession: HTMLElement | null = null
  let root: HTMLElement | null = null

  const clear = (): void => {
    if (host === null && newSession === null) return
    onTarget(null)
    host?.remove()
    newSession?.removeAttribute(SIDEBAR_NEW_SESSION_ATTRIBUTE)
    host = null
    newSession = null
    root = null
  }

  const reconcile = (): void => {
    const workspaceSeat = document.querySelector<HTMLElement>('[data-slot="sidebar.workspaces"]')
    const region = workspaceSeat?.parentElement ?? null
    const nextRoot = region?.parentElement ?? null
    const nextNewSession = region === null ? null : previousButton(region)
    if (nextRoot === null || !(nextNewSession instanceof HTMLElement)) {
      clear()
      return
    }
    if (root === nextRoot && host?.isConnected === true && newSession === nextNewSession) return

    clear()
    const nextHost = document.createElement('div')
    nextHost.className = className
    nextHost.setAttribute(SIDEBAR_TOP_HOST_ATTRIBUTE, '')
    nextNewSession.setAttribute(SIDEBAR_NEW_SESSION_ATTRIBUTE, '')
    nextRoot.insertBefore(nextHost, nextNewSession)
    root = nextRoot
    host = nextHost
    newSession = nextNewSession
    onTarget(nextHost)
    logger.info('workbench-layout: mounted mode switch above the official sidebar browser')
  }

  reconcile()
  const observer = new MutationObserver(reconcile)
  observer.observe(document.body, { childList: true, subtree: true })
  return {
    dispose: () => {
      observer.disconnect()
      clear()
    },
  }
}

/**
 * 官方 Tooltip 会在按钮后临时插入一个相邻 span；从区域向前寻找真实按钮，
 * 避免把 Tooltip 当成锚点后反复交换整列控件的位置。
 */
function previousButton(region: HTMLElement): HTMLElement | null {
  let candidate = region.previousElementSibling
  while (candidate !== null) {
    if (candidate instanceof HTMLElement && candidate.tagName === 'BUTTON') return candidate
    candidate = candidate.previousElementSibling
  }
  return null
}
