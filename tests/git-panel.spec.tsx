// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitPanel } from '../src/client/GitPanel.tsx'
import { zh } from '../src/client/locales.ts'

const workbenchState = vi.hoisted(() => ({ diff: null, dirty: false }))

vi.mock('../src/client/use-workbench.ts', () => ({ useWorkbench: () => workbenchState }))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
  Tooltip: ({ children, label }: { children: React.ReactNode; label: string | (() => string) }) => (
    <span data-tooltip={typeof label === 'function' ? label() : label}>{children}</span>
  ),
  Menu: ({ anchor, open, items, onSelect }: {
    anchor: React.ReactNode
    open: boolean
    items: Array<{ id: string; label?: React.ReactNode; type?: string; disabled?: boolean }>
    onSelect: (id: string) => void
  }) => (
    <span>
      {anchor}
      {open && <div role="menu">{items.filter(item => item.type === undefined).map(item => (
        <button type="button" key={item.id} disabled={item.disabled} onClick={() => { onSelect(item.id) }}>{item.label}</button>
      ))}</div>}
    </span>
  ),
  IconBranchOutline16: () => <span data-icon="branch" />,
  IconChevronDownOutline14: () => <span data-icon="chevron" />,
  IconChevronRightOutline14: () => <span data-icon="chevron" />,
  IconCloseOutline16: () => <span />,
  IconCodeOutline16: () => <span />,
  IconDownloadOutline16: () => <span />,
  IconEllipsisOutline16: () => <span />,
  IconFolderClose16: () => <span />,
  IconFolderOpen16: () => <span />,
  IconFolderOpenOutline16: () => <span />,
  IconListPenOutline16: () => <span />,
  IconLoadingOutline16: () => <span />,
  IconPersonalizationOutline16: () => <span />,
  IconPlusOutline16: () => <span />,
  IconRefreshOutline16: () => <span />,
  IconSendOutline16: () => <span />,
}))

beforeEach(() => { workbenchState.dirty = false })
afterEach(() => { cleanup() })

describe('Git panel', () => {
  it('switches list/tree layouts and opens only the selected change', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)

    await waitFor(() => { expect(view.getByRole('tab', { name: /更改/u })).toBeTruthy() })
    fireEvent.click(view.getAllByTitle('src/nested/a.ts')[1]!)
    expect(controller.openDiff).toHaveBeenCalledWith('session-1', 'src/nested/a.ts', false)

    fireEvent.click(view.getByRole('button', { name: '更改视图' }))
    fireEvent.click(view.getByRole('button', { name: '以目录树显示' }))
    expect(view.container.querySelector('[data-change-layout="tree"]')).not.toBeNull()
    expect(view.getAllByTitle('src')).toHaveLength(2)
    expect(view.getAllByTitle('src/nested')).toHaveLength(2)
  })

  it('keeps history rows to subject, author, and refs, then expands files in place', async () => {
    const { controller, commit } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('tab', { name: /历史/u })).toBeTruthy() })
    fireEvent.click(view.getByRole('tab', { name: /历史/u }))

    const row = view.getByRole('button', { name: /main.*完善工作台.*Tester/u })
    expect(row.textContent).not.toContain(commit.shortHash)
    expect(row.textContent).not.toContain('2026')
    expect(row.querySelector('[data-icon="chevron"]')).toBeNull()
    expect(row.parentElement?.getAttribute('data-tooltip')).toContain(commit.hash)

    fireEvent.click(row)
    await waitFor(() => { expect(view.getByTitle('src/history.ts')).toBeTruthy() })
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(controller.api.gitCommitFiles).toHaveBeenCalledWith('session-1', commit.hash)
    fireEvent.click(view.getByTitle('src/history.ts'))
    expect(controller.openCommitDiff).toHaveBeenCalledWith('session-1', commit, 'src/history.ts')
  })

  it('switches branches and runs explicit remote actions from DSH menus', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '切换分支' })).toBeTruthy() })

    fireEvent.click(view.getByRole('button', { name: '切换分支' }))
    fireEvent.click(view.getByRole('button', { name: 'topic' }))
    await waitFor(() => { expect(controller.api.gitSwitchBranch).toHaveBeenCalledWith('session-1', 'refs/heads/topic') })
    expect(controller.resetWorkspaceView).toHaveBeenCalled()

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '抓取远程更新' }))
    await waitFor(() => { expect(controller.api.gitRemoteOperation).toHaveBeenCalledWith('session-1', 'fetch') })
  })

  it('blocks workspace-changing Git operations while the editor has an unsaved draft', async () => {
    workbenchState.dirty = true
    const { controller } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '切换分支' })).toBeTruthy() })

    fireEvent.click(view.getByRole('button', { name: '切换分支' }))
    fireEvent.click(view.getByRole('button', { name: 'topic' }))
    expect(controller.api.gitSwitchBranch).not.toHaveBeenCalled()
    expect(view.getByRole('alert').textContent).toContain('请先保存或还原')
  })
})

function renderPanel(controller: ReturnType<typeof harness>['controller']) {
  return render(
    <GitPanel
      controller={controller as never}
      sessionId="session-1"
      t={(key: keyof typeof zh) => zh[key]}
    />,
  )
}

function harness() {
  const commit = {
    hash: 'a'.repeat(40),
    shortHash: 'aaaaaaa',
    subject: '完善工作台',
    author: 'Tester',
    authoredAt: '2026-08-23T10:00:00Z',
    references: [{ name: 'main', kind: 'head' as const }],
  }
  const status = {
    available: true,
    branch: 'main',
    upstream: 'origin/main',
    ahead: 1,
    behind: 2,
    hasRemote: true,
    remotes: ['origin'],
    files: [{ path: 'src/nested/a.ts', index: 'M', worktree: 'M' }],
  }
  const controller = {
    api: {
      gitStatus: vi.fn(() => Promise.resolve(status)),
      gitHistory: vi.fn(() => Promise.resolve({ commits: [commit], truncated: false })),
      gitBranches: vi.fn(() => Promise.resolve({
        current: 'main',
        detached: false,
        branches: [
          { ref: 'refs/heads/main', name: 'main', kind: 'local', current: true, upstream: 'origin/main' },
          { ref: 'refs/heads/topic', name: 'topic', kind: 'local', current: false },
          { ref: 'refs/remotes/origin/main', name: 'origin/main', kind: 'remote', current: false },
        ],
      })),
      gitCommitFiles: vi.fn(() => Promise.resolve({
        commit,
        parentRevision: 'b'.repeat(40),
        files: [{ path: 'src/history.ts', status: 'M' }],
      })),
      gitSwitchBranch: vi.fn(() => Promise.resolve({ ...status, branch: 'topic' })),
      gitRemoteOperation: vi.fn((operation: string) => Promise.resolve({ operation })),
    },
    openDiff: vi.fn(() => Promise.resolve()),
    openCommitDiff: vi.fn(() => Promise.resolve()),
    resetWorkspaceView: vi.fn(),
    showFile: vi.fn(),
  }
  return { controller, commit }
}
