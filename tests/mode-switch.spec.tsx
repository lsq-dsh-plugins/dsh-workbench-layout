// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModeSwitch } from '../src/client/ModeSwitch.tsx'
import type { WorkbenchController } from '../src/client/controller.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderOpenOutline16: ({ size }: { size: number }) => <svg data-icon="files" width={size} />,
  IconNewChatOutline16: ({ size }: { size: number }) => <svg data-icon="sessions" width={size} />,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../src/client/use-workbench.ts', () => ({
  useWorkbench: () => ({ sidebarMode: 'git' }),
}))

describe('工作台模式切换', () => {
  const setSidebarMode = vi.fn()
  const logger = { info: vi.fn() }

  beforeEach(() => {
    setSidebarMode.mockClear()
    logger.info.mockClear()
    sidebarFixture()
  })

  it('为 Git 入口显示三节点源码管理图标并遵循官方折叠栏尺寸', () => {
    const view = render(
      <ModeSwitch
        wide={false}
        controller={{ setSidebarMode } as unknown as WorkbenchController}
        logger={logger}
        t={key => ({
          'mode.sessions': '会话',
          'mode.files': '文件',
          'mode.git': 'Git',
          'mode.terminal': '终端',
        })[key] ?? key}
      />,
    )

    const gitButton = view.getByRole('button', { name: 'Git' })
    const icon = gitButton.querySelector('svg')
    expect(icon?.getAttribute('width')).toBe('18')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.querySelectorAll('circle')).toHaveLength(3)
    expect(icon?.querySelector('path')?.getAttribute('stroke')).toBe('currentColor')

    fireEvent.click(gitButton)
    expect(setSidebarMode).toHaveBeenCalledWith('git')
    expect(view.getByRole('button', { name: '终端' }).querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it('在展开侧栏中使用 DSH 的 16px 图标规格', () => {
    const view = render(
      <ModeSwitch
        wide
        controller={{ setSidebarMode } as unknown as WorkbenchController}
        logger={logger}
        t={key => key === 'mode.git' ? 'Git' : key}
      />,
    )

    expect(view.getByRole('button', { name: 'Git' }).querySelector('svg')?.getAttribute('width')).toBe('16')
  })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function sidebarFixture(): void {
  const root = document.createElement('div')
  const brand = document.createElement('div')
  const newSession = document.createElement('button')
  const region = document.createElement('div')
  const seat = document.createElement('div')
  seat.dataset.slot = 'sidebar.workspaces'
  region.appendChild(seat)
  root.append(brand, newSession, region, document.createElement('div'))
  document.body.appendChild(root)
}
