// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModeSwitch } from '../src/client/ModeSwitch.tsx'
import type { WorkbenchController } from '../src/client/controller.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderOpenOutline16: ({ size }: { size: number }) => <svg data-icon="files" width={size} />,
  IconPanelLeftOutline16: ({ size, className }: { size: number; className?: string }) => <svg data-icon="editor" className={className} width={size} />,
  IconQueueOutline14: ({ size }: { size: number }) => <svg data-icon="sessions" width={size} />,
  Tooltip: ({ children, label }: { children: React.ReactNode; label: string }) => <span data-tooltip-label={label}>{children}</span>,
}))

const workbench = vi.hoisted(() => ({ sidebarMode: 'git', editorExpanded: true }))
vi.mock('../src/client/use-workbench.ts', () => ({
  useWorkbench: () => workbench,
}))

describe('工作台模式切换', () => {
  const setSidebarMode = vi.fn()
  const toggleEditor = vi.fn()
  const logger = { info: vi.fn() }

  beforeEach(() => {
    setSidebarMode.mockClear()
    toggleEditor.mockClear()
    workbench.editorExpanded = true
    logger.info.mockClear()
    sidebarFixture()
  })

  it('为 Git 入口显示三节点源码管理图标并遵循官方折叠栏尺寸', () => {
    const view = render(
      <ModeSwitch
        wide={false}
        controller={{ setSidebarMode, toggleEditor } as unknown as WorkbenchController}
        logger={logger}
        t={key => ({
          'mode.sessions': '会话',
          'mode.files': '文件',
          'mode.git': 'Git',
          'mode.terminal': '终端',
          'editor.collapse': '收起中栏',
          'editor.expand': '展开中栏',
        })[key] ?? key}
      />,
    )

    const gitButton = view.getByRole('button', { name: 'Git' })
    expect(document.querySelector('[data-dsh-workbench-sidebar-top]')?.getAttribute('data-mode')).toBe('git')
    const icon = gitButton.querySelector('svg')
    expect(icon?.getAttribute('width')).toBe('18')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.querySelectorAll('circle')).toHaveLength(3)
    expect(icon?.querySelector('path')?.getAttribute('stroke')).toBe('currentColor')
    expect(view.getByRole('button', { name: '会话' }).querySelector('svg')?.getAttribute('data-icon')).toBe('sessions')

    fireEvent.click(gitButton)
    expect(setSidebarMode).toHaveBeenCalledWith('git')
    expect(view.getByRole('button', { name: '终端' }).querySelector('svg')?.getAttribute('width')).toBe('18')
    const editorButton = view.getByRole('button', { name: '收起中栏' })
    const previousTooltip = editorButton.parentElement
    expect(editorButton.querySelector('svg')?.getAttribute('width')).toBe('18')
    fireEvent.click(editorButton)
    expect(toggleEditor).toHaveBeenCalledOnce()

    workbench.editorExpanded = false
    view.rerender(
      <ModeSwitch
        wide={false}
        controller={{ setSidebarMode, toggleEditor } as unknown as WorkbenchController}
        logger={logger}
        t={key => ({
          'mode.sessions': '会话',
          'mode.files': '文件',
          'mode.git': 'Git',
          'mode.terminal': '终端',
          'editor.collapse': '收起中栏',
          'editor.expand': '展开中栏',
        })[key] ?? key}
      />,
    )
    const expandedButton = view.getByRole('button', { name: '展开中栏' })
    expect(expandedButton.getAttribute('aria-pressed')).toBe('false')
    expect(expandedButton.parentElement).not.toBe(previousTooltip)
  })

  it('在展开侧栏中使用 DSH 的 16px 图标规格', () => {
    const view = render(
      <ModeSwitch
        wide
        controller={{ setSidebarMode, toggleEditor } as unknown as WorkbenchController}
        logger={logger}
        t={key => key === 'mode.git' ? 'Git' : key}
      />,
    )

    expect(view.getByRole('button', { name: 'Git' }).querySelector('svg')?.getAttribute('width')).toBe('16')
    expect(view.getByRole('button', { name: 'editor.collapse' }).querySelector('svg')?.getAttribute('width')).toBe('16')
  })

  it('让收起态按钮遵循官方 36px 圆形与 12px 纵向节奏', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/Workbench.module.css'), 'utf8')
    const modeSwitchRule = stylesheet.match(/\.modeSwitch\s*\{[^}]+\}/u)?.[0]
    const modeButtonRule = stylesheet.match(/\.modeButton\s*\{[^}]+\}/u)?.[0]

    expect(modeSwitchRule).toContain('gap: 12px')
    expect(modeSwitchRule).toContain('width: 36px')
    expect(modeButtonRule).toContain('width: 36px')
    expect(modeButtonRule).toContain('height: 36px')
    expect(modeButtonRule).toContain('border-radius: 50%')
    expect(stylesheet).toMatch(/\.modeButton\[data-active\]\s*\{[^}]*interactive-bg-active[^}]*button-info-fill/u)
    expect(stylesheet).toMatch(/\.modeSwitch\[data-wide\] \.modeButton\[data-active\]\s*\{[^}]*button-elevated-fill[^}]*brand-text/u)
    expect(stylesheet).toContain(".sidebarTopHost:not([data-mode='sessions']) + [data-dsh-workbench-new-session]")
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
  const foot = document.createElement('div')
  const footerActions = document.createElement('div')
  const footerActionSeat = document.createElement('div')
  footerActionSeat.dataset.slot = 'sidebar.footer.action'
  footerActions.appendChild(footerActionSeat)
  const settingsArea = document.createElement('div')
  const settingsSeat = document.createElement('div')
  settingsSeat.dataset.slot = 'sidebar.settings'
  settingsSeat.appendChild(document.createElement('button'))
  settingsArea.appendChild(settingsSeat)
  foot.append(footerActions, settingsArea)
  root.append(brand, newSession, region, foot)
  document.body.appendChild(root)
}
