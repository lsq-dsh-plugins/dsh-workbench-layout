// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONVERSATION_NARROW_ATTRIBUTE,
  createConversationLayout,
  FLOATING_MENU_LEFT_PROPERTY,
  FLOATING_MENU_TOP_PROPERTY,
  FLOATING_MODEL_MENU_ATTRIBUTE,
} from '../src/client/conversation-layout.ts'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('右侧原生会话窄栏适配', () => {
  it('按会话栏实际宽度切换窄栏状态', () => {
    const { column } = conversationFixture()
    let width = 360
    vi.spyOn(column, 'getBoundingClientRect').mockImplementation(() => rect(0, 0, width, 800))
    const logger = { info: vi.fn() }
    const layout = createConversationLayout(column, logger)

    expect(column.hasAttribute(CONVERSATION_NARROW_ATTRIBUTE)).toBe(true)
    width = 480
    layout.reconcile()
    expect(column.hasAttribute(CONVERSATION_NARROW_ATTRIBUTE)).toBe(false)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('activated narrow conversation'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('released narrow conversation'))

    layout.dispose()
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
})

function conversationFixture() {
  const column = document.createElement('div')
  const slot = document.createElement('div')
  slot.dataset.slot = 'conversation.input.model'
  const modelRoot = document.createElement('div')
  const trigger = document.createElement('button')
  trigger.setAttribute('aria-haspopup', 'menu')
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  modelRoot.append(trigger, menu)
  slot.appendChild(modelRoot)
  column.appendChild(slot)
  document.body.appendChild(column)
  return { column, modelRoot, trigger, menu }
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
