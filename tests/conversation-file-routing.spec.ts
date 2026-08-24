// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConversationFileRouting,
  nativeFileReferencePath,
} from '../src/client/conversation-file-routing.ts'

afterEach(() => { document.body.innerHTML = '' })

describe('原生会话文件索引路由', () => {
  it('只接管 Markdown 生成文件按钮并阻止系统打开器继续执行', () => {
    const { column, button } = fixture()
    const nativeOpen = vi.fn()
    button.addEventListener('click', nativeOpen)
    const controller = controllerFake('workspace-1')
    const routing = createConversationFileRouting(column, controller, { info: vi.fn() })

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(nativeOpen).not.toHaveBeenCalled()
    expect(controller.openConversationFile).toHaveBeenCalledWith('workspace-1', 'src/view.tsx')
    routing.dispose()
  })

  it('接管文件工具行中的官方路径按钮', () => {
    const { column } = fixture()
    const tool = document.createElement('div')
    tool.dataset.tool = 'read_file'
    tool.dataset.variant = 'read'
    const row = document.createElement('div')
    row.dataset.disclosureRow = ''
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'src/tool.ts'
    row.appendChild(button)
    tool.appendChild(row)
    column.appendChild(tool)
    const controller = controllerFake('workspace-1')
    const routing = createConversationFileRouting(column, controller, { info: vi.fn() })

    button.click()

    expect(controller.openConversationFile).toHaveBeenCalledWith('workspace-1', 'src/tool.ts')
    routing.dispose()
  })

  it('不接管网页链接、普通按钮、代码块按钮或没有工作区的文件索引', () => {
    const { column, button } = fixture()
    const link = document.createElement('a')
    link.href = 'https://example.com/docs'
    const ordinary = document.createElement('button')
    ordinary.type = 'button'
    ordinary.title = '普通操作'
    ordinary.setAttribute('aria-label', '普通操作')
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.title = '复制'
    copy.setAttribute('aria-label', '复制')
    code.appendChild(copy)
    pre.appendChild(code)
    column.append(link, ordinary, pre)

    expect(nativeFileReferencePath(column, link)).toBeUndefined()
    expect(nativeFileReferencePath(column, ordinary)).toBeUndefined()
    expect(nativeFileReferencePath(column, copy)).toBeUndefined()

    const nativeOpen = vi.fn()
    button.addEventListener('click', nativeOpen)
    const controller = controllerFake(undefined)
    const routing = createConversationFileRouting(column, controller, { info: vi.fn() })
    button.click()
    expect(nativeOpen).toHaveBeenCalledOnce()
    expect(controller.openConversationFile).not.toHaveBeenCalled()
    routing.dispose()
  })
})

function fixture(): { column: HTMLElement; button: HTMLButtonElement } {
  const column = document.createElement('section')
  const code = document.createElement('code')
  const button = document.createElement('button')
  button.type = 'button'
  button.title = 'src/view.tsx'
  button.setAttribute('aria-label', '打开 src/view.tsx')
  button.textContent = 'view.tsx'
  code.appendChild(button)
  column.appendChild(code)
  document.body.appendChild(column)
  return { column, button }
}

function controllerFake(workspaceId: string | undefined) {
  return {
    store: { getSnapshot: () => ({ workspaceId }) },
    openConversationFile: vi.fn(() => Promise.resolve()),
  }
}
