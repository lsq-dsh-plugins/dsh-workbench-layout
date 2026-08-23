// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchState } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'
import { TerminalPanel } from '../src/client/TerminalPanel.tsx'

const current = vi.hoisted(() => ({ state: {} as WorkbenchState }))
vi.mock('../src/client/use-workbench.ts', () => ({ useWorkbench: () => current.state }))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCloseOutline16: () => <span />,
  IconPlusOutline16: () => <span />,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}))

afterEach(() => { cleanup() })

describe('终端左栏', () => {
  it('管理当前工作区的多个终端并显示运行状态', () => {
    current.state = {
      sidebarMode: 'terminal', editorExpanded: true, workspaceId: 'workspace-1', activeTabId: 'terminal:1', diffViewMode: 'split',
      gitView: 'changes', gitChangeLayout: 'list', gitGraphFileLayout: 'list',
      tabs: [
        { id: 'terminal:1', kind: 'terminal', sequence: 1, generation: 0, status: 'running', shell: 'zsh', error: null },
        { id: 'terminal:2', kind: 'terminal', sequence: 2, generation: 0, status: 'exited', exitCode: 0, error: null },
      ],
    }
    const controller = {
      openTerminal: vi.fn(), selectTab: vi.fn(), closeTab: vi.fn(),
    }
    const view = render(
      <TerminalPanel
        controller={controller as never}
        workspaceId="workspace-1"
        t={(key, values) => interpolate(zh[key], values as Record<string, string> | undefined)}
      />,
    )

    expect(view.getByText('zsh')).toBeTruthy()
    expect(view.getByText('已退出')).toBeTruthy()
    fireEvent.click(view.getByText('终端 2'))
    expect(controller.selectTab).toHaveBeenCalledWith('terminal:2')
    fireEvent.click(view.getByRole('button', { name: '关闭 终端 1' }))
    expect(controller.closeTab).toHaveBeenCalledWith('terminal:1')
    fireEvent.click(view.getByRole('button', { name: '新建终端' }))
    expect(controller.openTerminal).toHaveBeenCalledWith('workspace-1')
  })

  it('首次进入空终端视图时创建一个终端，但关闭最后一个后不循环重建', () => {
    current.state = {
      sidebarMode: 'terminal', editorExpanded: true, workspaceId: 'workspace-1', diffViewMode: 'split', tabs: [],
      gitView: 'changes', gitChangeLayout: 'list', gitGraphFileLayout: 'list',
    }
    const controller = { openTerminal: vi.fn(), selectTab: vi.fn(), closeTab: vi.fn() }
    const view = render(
      <TerminalPanel
        controller={controller as never}
        workspaceId="workspace-1"
        t={(key, values) => interpolate(zh[key], values as Record<string, string> | undefined)}
      />,
    )
    expect(controller.openTerminal).toHaveBeenCalledTimes(1)
    view.rerender(
      <TerminalPanel
        controller={controller as never}
        workspaceId="workspace-1"
        t={(key, values) => interpolate(zh[key], values as Record<string, string> | undefined)}
      />,
    )
    expect(controller.openTerminal).toHaveBeenCalledTimes(1)
  })
})

function interpolate(template: string, values: Record<string, string> | undefined): string {
  if (values === undefined) return template
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template)
}
