// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorTabs } from '../src/client/EditorTabs.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCloseOutline16: () => <span />,
}))

afterEach(() => { cleanup() })

describe('文件标签栏', () => {
  it('在存在横向溢出时将纵向滚轮转换成左右滚动', () => {
    const view = renderTabs()
    const tabList = view.getByRole('tablist')
    setGeometry(tabList, 600, 240)

    const forward = wheel(72)
    expect(tabList.dispatchEvent(forward)).toBe(false)
    expect(forward.defaultPrevented).toBe(true)
    expect(tabList.scrollLeft).toBe(72)

    const backward = wheel(-40)
    tabList.dispatchEvent(backward)
    expect(tabList.scrollLeft).toBe(32)
  })

  it('到达横向边界后不拦截页面的正常滚动', () => {
    const view = renderTabs()
    const tabList = view.getByRole('tablist')
    setGeometry(tabList, 600, 240)
    tabList.scrollLeft = 360

    const atRightEdge = wheel(60)
    expect(tabList.dispatchEvent(atRightEdge)).toBe(true)
    expect(atRightEdge.defaultPrevented).toBe(false)
    expect(tabList.scrollLeft).toBe(360)

    tabList.scrollLeft = 0
    const atLeftEdge = wheel(-60)
    expect(tabList.dispatchEvent(atLeftEdge)).toBe(true)
    expect(atLeftEdge.defaultPrevented).toBe(false)
  })

  it('使用紧凑的 38px 中栏顶栏', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/Workbench.module.css'), 'utf8')
    const headerRule = stylesheet.match(/\.editorHeader\s*\{(?<body>[\s\S]*?)\}/u)?.groups?.body
    expect(headerRule).toContain('height: 38px;')
  })

  it('把终端与文件放在同一套标签中', () => {
    const view = render(
      <EditorTabs
        tabs={[tab('src/a.ts'), {
          id: 'terminal:1', kind: 'terminal', sequence: 1, generation: 0, status: 'running', error: null,
        }]}
        activeTabId="terminal:1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        t={(key: string, values?: Record<string, string>) => key === 'terminal.name'
          ? `终端 ${values?.index ?? ''}`
          : key === 'terminal.running' ? '正在运行' : key}
      />,
    )
    expect(view.getByRole('tab', { name: '终端 1' }).getAttribute('aria-selected')).toBe('true')
  })
})

function renderTabs() {
  return render(
    <EditorTabs
      tabs={[
        tab('src/alpha.ts'), tab('src/beta.ts'), tab('src/gamma.ts'), tab('src/delta.ts'),
      ]}
      activeTabId="file:src/alpha.ts"
      onSelect={vi.fn()}
      onClose={vi.fn()}
      t={(key: string) => key}
    />,
  )
}

function tab(path: string) {
  return {
    id: `file:${path}`,
    kind: 'file' as const,
    path,
    file: { path, content: '', version: '1', size: 0, markdown: false },
    draft: '',
    dirty: false,
    preview: false,
    loading: false,
    saving: false,
    error: null,
  }
}

function setGeometry(element: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
  })
  element.scrollLeft = 0
}

function wheel(deltaY: number): WheelEvent {
  return new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })
}
