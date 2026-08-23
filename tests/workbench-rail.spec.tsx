// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { WorkbenchRail } from '../src/client/WorkbenchRail.tsx'

const workbench = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock('../src/client/use-workbench.ts', () => ({ useWorkbench: () => workbench.current }))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconListPenOutline16: () => <span data-icon="changes" />,
  IconPlusOutline16: ({ className }: { className?: string }) => <span data-icon="plus" className={className} />,
  IconRefreshOutline14: () => <span data-icon="refresh" />,
  IconRefreshOutline16: () => <span data-icon="sync" />,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}))

afterEach(() => {
  cleanup()
  workbench.current = {}
})

describe('模式化收起栏快捷操作', () => {
  it('为文件模式提供新建与刷新并在发出一次性命令后展开侧栏', () => {
    workbench.current = state('files')
    const controller = controllerFixture()
    const expandSidebar = vi.fn()
    const view = renderRail(controller, expandSidebar)

    expect(view.getAllByRole('button')).toHaveLength(3)
    fireEvent.click(view.getByRole('button', { name: '新建文件' }))
    expect(controller.requestSidebarAction).toHaveBeenCalledWith('files.newFile', 'workspace-1')
    expect(expandSidebar).toHaveBeenCalledOnce()
  })

  it('让 Git 收起栏与共享提交图状态及同步命令保持一致', () => {
    workbench.current = { ...state('git'), gitView: 'graph' }
    const controller = controllerFixture()
    const expandSidebar = vi.fn()
    const view = renderRail(controller, expandSidebar)

    expect(view.getByRole('button', { name: '切换到更改' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(view.getByRole('button', { name: '切换到更改' }))
    expect(controller.toggleGitView).toHaveBeenCalledOnce()
    fireEvent.click(view.getByRole('button', { name: '同步更改' }))
    expect(controller.requestSidebarAction).toHaveBeenCalledWith('git.sync', 'workspace-1')
    expect(expandSidebar).toHaveBeenCalledTimes(2)
  })

  it('为终端模式提供新建入口和已有终端选择', () => {
    workbench.current = {
      ...state('terminal'),
      activeTabId: 'terminal:1',
      tabs: [
        { id: 'terminal:1', kind: 'terminal', sequence: 1, generation: 0, status: 'running', error: null },
        { id: 'terminal:2', kind: 'terminal', sequence: 2, generation: 0, status: 'exited', error: null },
      ],
    }
    const controller = controllerFixture()
    const view = renderRail(controller, vi.fn())

    expect(view.getByRole('button', { name: '终端 1' }).getAttribute('data-status')).toBe('running')
    fireEvent.click(view.getByRole('button', { name: '新建终端' }))
    expect(controller.openTerminal).toHaveBeenCalledWith('workspace-1')
    fireEvent.click(view.getByRole('button', { name: '终端 2' }))
    expect(controller.selectTab).toHaveBeenCalledWith('terminal:2')
  })
})

function renderRail(controller: ReturnType<typeof controllerFixture>, expandSidebar: () => void) {
  return render(
    <WorkbenchRail
      controller={controller as never}
      workspaceId="workspace-1"
      expandSidebar={expandSidebar}
      t={(key, values) => interpolate(zh[key], values as Record<string, string> | undefined)}
    />,
  )
}

function state(sidebarMode: 'files' | 'git' | 'terminal') {
  return {
    sidebarMode,
    editorExpanded: true,
    workspaceId: 'workspace-1',
    tabs: [],
    diffViewMode: 'split',
    gitView: 'changes',
    gitChangeLayout: 'list',
    gitGraphFileLayout: 'list',
  }
}

function controllerFixture() {
  return {
    requestSidebarAction: vi.fn(),
    toggleGitView: vi.fn(),
    openTerminal: vi.fn(),
    selectTab: vi.fn(),
  }
}

function interpolate(template: string, values: Record<string, string> | undefined): string {
  if (values === undefined) return template
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template)
}
