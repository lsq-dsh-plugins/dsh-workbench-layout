// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONVERSATION_NARROW_ATTRIBUTE,
  CONVERSATION_ROOT_ATTRIBUTE,
  createConversationLayout,
  FLOATING_MENU_LEFT_PROPERTY,
  FLOATING_MENU_TOP_PROPERTY,
  FLOATING_MODEL_MENU_ATTRIBUTE,
  SESSION_LOG_BUTTON_ATTRIBUTE,
} from '../src/client/conversation-layout.ts'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('右侧原生会话窄栏适配', () => {
  it('按会话栏实际宽度切换窄栏状态', () => {
    const { column, conversationRoot } = conversationFixture()
    let width = 360
    vi.spyOn(column, 'getBoundingClientRect').mockImplementation(() => rect(0, 0, width, 800))
    const logger = { info: vi.fn() }
    const layout = createConversationLayout(column, logger)

    expect(column.hasAttribute(CONVERSATION_NARROW_ATTRIBUTE)).toBe(true)
    expect(conversationRoot.hasAttribute(CONVERSATION_ROOT_ATTRIBUTE)).toBe(true)
    width = 480
    layout.reconcile()
    expect(column.hasAttribute(CONVERSATION_NARROW_ATTRIBUTE)).toBe(false)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('activated narrow conversation'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('released narrow conversation'))

    layout.dispose()
    expect(conversationRoot.hasAttribute(CONVERSATION_ROOT_ATTRIBUTE)).toBe(false)
  })

  it('以视口坐标抬升模型菜单且不移动 React 持有的节点', async () => {
    const { column, modelRoot, trigger, menu } = conversationFixture()
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(rect(900, 0, 300, 800))
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(900, 700, 80, 28))
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 240, 200))
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const logger = { info: vi.fn() }
    const layout = createConversationLayout(column, logger)

    expect(menu.parentElement).toBe(modelRoot)
    expect(menu.hasAttribute(FLOATING_MODEL_MENU_ATTRIBUTE)).toBe(true)
    expect(menu.style.getPropertyValue(FLOATING_MENU_LEFT_PROPERTY)).toBe('740px')
    expect(menu.style.getPropertyValue(FLOATING_MENU_TOP_PROPERTY)).toBe('492px')
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('lifted native model menu'))

    menu.remove()
    await vi.waitFor(() => {
      expect(menu.hasAttribute(FLOATING_MODEL_MENU_ATTRIBUTE)).toBe(false)
    })
    layout.dispose()
  })

  it('只标记官方 Session log 操作并为窄栏图标保留无障碍名称', () => {
    const { column, sessionLogButton, unrelatedButton } = conversationFixture()
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 360, 800))
    const logger = { info: vi.fn() }
    const layout = createConversationLayout(column, logger)

    expect(sessionLogButton.hasAttribute(SESSION_LOG_BUTTON_ATTRIBUTE)).toBe(true)
    expect(sessionLogButton.getAttribute('aria-label')).toBe('Session log')
    expect(sessionLogButton.title).toBe('Session log')
    expect(unrelatedButton.hasAttribute(SESSION_LOG_BUTTON_ATTRIBUTE)).toBe(false)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('adopted native Session log action'))

    layout.dispose()
    expect(sessionLogButton.hasAttribute(SESSION_LOG_BUTTON_ATTRIBUTE)).toBe(false)
    expect(sessionLogButton.hasAttribute('aria-label')).toBe(false)
    expect(sessionLogButton.hasAttribute('title')).toBe(false)
  })

  it('不覆盖 Session log 操作已有的无障碍名称和提示', () => {
    const { column, sessionLogButton } = conversationFixture()
    sessionLogButton.setAttribute('aria-label', '下载会话日志')
    sessionLogButton.title = '下载'
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 360, 800))
    const layout = createConversationLayout(column, { info: vi.fn() })

    layout.dispose()
    expect(sessionLogButton.getAttribute('aria-label')).toBe('下载会话日志')
    expect(sessionLogButton.title).toBe('下载')
  })
})

function conversationFixture() {
  const column = document.createElement('div')
  const conversationRoot = document.createElement('div')
  conversationRoot.dataset.phase = 'active'
  const conversationScroll = document.createElement('div')
  conversationScroll.dataset.conversationScroll = ''
  conversationRoot.appendChild(conversationScroll)
  const slot = document.createElement('div')
  slot.dataset.slot = 'conversation.input.model'
  const modelRoot = document.createElement('div')
  const trigger = document.createElement('button')
  trigger.setAttribute('aria-haspopup', 'menu')
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  modelRoot.append(trigger, menu)
  slot.appendChild(modelRoot)
  const utilities = document.createElement('div')
  utilities.dataset.slot = 'conversation.session.header.utilities'
  const unrelatedButton = document.createElement('button')
  unrelatedButton.append('Task', document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
  const sessionLogButton = document.createElement('button')
  const sessionLogLabel = document.createElement('span')
  sessionLogLabel.textContent = 'Session log'
  sessionLogButton.append(sessionLogLabel, document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
  utilities.append(unrelatedButton, sessionLogButton)
  column.append(conversationRoot, slot, utilities)
  document.body.appendChild(column)
  return { column, conversationRoot, modelRoot, trigger, menu, sessionLogButton, unrelatedButton }
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({}),
  }
}
