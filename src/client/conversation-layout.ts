/** 右侧原生会话栏的窄栏状态、头部操作标记与模型菜单浮层几何。 */

export const CONVERSATION_NARROW_ATTRIBUTE = 'data-dsh-workbench-conversation-narrow'
export const CONVERSATION_ROOT_ATTRIBUTE = 'data-dsh-workbench-conversation-root'
export const FLOATING_MODEL_MENU_ATTRIBUTE = 'data-dsh-workbench-floating-model-menu'
export const SESSION_LOG_BUTTON_ATTRIBUTE = 'data-dsh-workbench-session-log-button'
export const FLOATING_MENU_LEFT_PROPERTY = '--dsh-workbench-floating-menu-left'
export const FLOATING_MENU_TOP_PROPERTY = '--dsh-workbench-floating-menu-top'

const NARROW_MAX_WIDTH = 420
const VIEWPORT_PADDING = 12
const MENU_GAP = 8
const MODEL_MENU_SELECTOR = "[data-slot='conversation.input.model'] [role='menu']"
const MODEL_TRIGGER_SELECTOR = "button[aria-haspopup='menu']"
const SESSION_HEADER_UTILITIES_SELECTOR = "[data-slot='conversation.session.header.utilities']"
const SESSION_LOG_LABEL = 'Session log'

export interface ConversationLayoutLogger {
  info(message: string): void
}

export interface ConversationLayout {
  reconcile(): void
  dispose(): void
}

/**
 * Mark one native conversation column as narrow and lift its model menu into
 * viewport-fixed coordinates without moving the React-owned DOM node.
 */
export function createConversationLayout(
  column: HTMLElement,
  logger: ConversationLayoutLogger,
): ConversationLayout {
  let narrow: boolean | undefined
  let menu: HTMLElement | null = null
  let trigger: HTMLElement | null = null
  let menuResizeObserver: ResizeObserver | undefined
  let positionFrame: number | null = null
  let sessionLogButton: HTMLButtonElement | null = null
  let ownsSessionLogAriaLabel = false
  let ownsSessionLogTitle = false
  let conversationRoot: HTMLElement | null = null

  const reconcileConversationRoot = (): void => {
    const nextRoot = findConversationRoot(column)
    if (nextRoot === conversationRoot) return
    conversationRoot?.removeAttribute(CONVERSATION_ROOT_ATTRIBUTE)
    conversationRoot = nextRoot
    conversationRoot?.setAttribute(CONVERSATION_ROOT_ATTRIBUTE, '')
    if (conversationRoot !== null) {
      logger.info('workbench-layout: adopted native ConversationRoot for workbench surface presentation')
    }
  }

  const applyWidth = (): void => {
    const width = Math.round(column.getBoundingClientRect().width)
    if (width <= 0) return
    const next = width <= NARROW_MAX_WIDTH
    if (next === narrow) return
    narrow = next
    column.toggleAttribute(CONVERSATION_NARROW_ATTRIBUTE, next)
    logger.info(`workbench-layout: ${next ? 'activated' : 'released'} narrow conversation presentation at ${width}px`)
  }

  const positionMenu = (): void => {
    positionFrame = null
    if (menu === null || trigger === null || !menu.isConnected || !trigger.isConnected) return
    const anchor = trigger.getBoundingClientRect()
    const bounds = menu.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight
    const width = bounds.width > 0 ? bounds.width : Math.min(240, viewportWidth - 2 * VIEWPORT_PADDING)
    const height = bounds.height
    const left = clamp(anchor.right - width, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - width)
    const above = anchor.top - MENU_GAP - height
    const below = anchor.bottom + MENU_GAP
    const top = above >= VIEWPORT_PADDING
      ? above
      : below + height <= viewportHeight - VIEWPORT_PADDING
        ? below
        : clamp(above, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - height)
    setStyleProperty(menu, FLOATING_MENU_LEFT_PROPERTY, `${Math.round(left)}px`)
    setStyleProperty(menu, FLOATING_MENU_TOP_PROPERTY, `${Math.round(top)}px`)
  }

  const schedulePosition = (): void => {
    if (positionFrame !== null || menu === null) return
    positionFrame = window.requestAnimationFrame(positionMenu)
  }

  const releaseMenu = (): void => {
    if (positionFrame !== null) window.cancelAnimationFrame(positionFrame)
    positionFrame = null
    menuResizeObserver?.disconnect()
    menuResizeObserver = undefined
    menu?.removeAttribute(FLOATING_MODEL_MENU_ATTRIBUTE)
    if (menu !== null) {
      menu.style.removeProperty(FLOATING_MENU_LEFT_PROPERTY)
      menu.style.removeProperty(FLOATING_MENU_TOP_PROPERTY)
    }
    menu = null
    trigger = null
  }

  const reconcileMenu = (): void => {
    const nextMenu = column.querySelector<HTMLElement>(MODEL_MENU_SELECTOR)
    if (nextMenu === menu) {
      if (nextMenu !== null) schedulePosition()
      return
    }
    releaseMenu()
    if (nextMenu === null) return
    const nextTrigger = nextMenu.parentElement?.querySelector<HTMLElement>(MODEL_TRIGGER_SELECTOR) ?? null
    if (nextTrigger === null) return
    menu = nextMenu
    trigger = nextTrigger
    menu.setAttribute(FLOATING_MODEL_MENU_ATTRIBUTE, '')
    if (typeof ResizeObserver !== 'undefined') {
      menuResizeObserver = new ResizeObserver(schedulePosition)
      menuResizeObserver.observe(menu)
    }
    positionMenu()
    logger.info('workbench-layout: lifted native model menu above workbench columns')
  }

  const releaseSessionLogButton = (): void => {
    if (sessionLogButton === null) return
    sessionLogButton.removeAttribute(SESSION_LOG_BUTTON_ATTRIBUTE)
    if (ownsSessionLogAriaLabel && sessionLogButton.getAttribute('aria-label') === SESSION_LOG_LABEL) {
      sessionLogButton.removeAttribute('aria-label')
    }
    if (ownsSessionLogTitle && sessionLogButton.title === SESSION_LOG_LABEL) {
      sessionLogButton.removeAttribute('title')
    }
    sessionLogButton = null
    ownsSessionLogAriaLabel = false
    ownsSessionLogTitle = false
  }

  const reconcileSessionLogButton = (): void => {
    const utilities = column.querySelector<HTMLElement>(SESSION_HEADER_UTILITIES_SELECTOR)
    const nextButton = utilities === null ? null : findSessionLogButton(utilities)
    if (nextButton === sessionLogButton) return
    releaseSessionLogButton()
    if (nextButton === null) return
    sessionLogButton = nextButton
    sessionLogButton.setAttribute(SESSION_LOG_BUTTON_ATTRIBUTE, '')
    if (!sessionLogButton.hasAttribute('aria-label')) {
      sessionLogButton.setAttribute('aria-label', SESSION_LOG_LABEL)
      ownsSessionLogAriaLabel = true
    }
    if (!sessionLogButton.hasAttribute('title')) {
      sessionLogButton.title = SESSION_LOG_LABEL
      ownsSessionLogTitle = true
    }
    logger.info('workbench-layout: adopted native Session log action for responsive presentation')
  }

  const reconcileDynamicControls = (): void => {
    reconcileConversationRoot()
    reconcileMenu()
    reconcileSessionLogButton()
  }

  const reconcile = (): void => {
    applyWidth()
    reconcileDynamicControls()
  }
  const mutationObserver = new MutationObserver(reconcileDynamicControls)
  mutationObserver.observe(column, { childList: true, subtree: true })
  const columnResizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(() => {
        applyWidth()
        schedulePosition()
      })
  columnResizeObserver?.observe(column)
  window.addEventListener('resize', schedulePosition)
  window.addEventListener('scroll', schedulePosition, true)
  reconcile()

  return {
    reconcile,
    dispose: () => {
      mutationObserver.disconnect()
      columnResizeObserver?.disconnect()
      window.removeEventListener('resize', schedulePosition)
      window.removeEventListener('scroll', schedulePosition, true)
      releaseMenu()
      releaseSessionLogButton()
      conversationRoot?.removeAttribute(CONVERSATION_ROOT_ATTRIBUTE)
      conversationRoot = null
      column.removeAttribute(CONVERSATION_NARROW_ATTRIBUTE)
    },
  }
}

function findConversationRoot(column: HTMLElement): HTMLElement | null {
  for (const child of column.children) {
    if (!(child instanceof HTMLElement) || !child.hasAttribute('data-phase')) continue
    const ownsScrollBody = Array.from(child.children).some(grandchild =>
      grandchild instanceof HTMLElement && grandchild.hasAttribute('data-conversation-scroll'))
    if (ownsScrollBody) return child
  }
  return null
}

function findSessionLogButton(utilities: HTMLElement): HTMLButtonElement | null {
  for (const button of utilities.querySelectorAll<HTMLButtonElement>('button')) {
    const children = Array.from(button.children)
    const label = children.find((child): child is HTMLSpanElement => child instanceof HTMLSpanElement)
    const hasDownloadGlyph = children.some(child => child instanceof SVGElement)
    if (label?.textContent?.trim() === SESSION_LOG_LABEL && hasDownloadGlyph) return button
  }
  return null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function setStyleProperty(element: HTMLElement, property: string, value: string): void {
  if (element.style.getPropertyValue(property) === value) return
  element.style.setProperty(property, value)
}
