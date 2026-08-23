// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitPanel } from '../src/client/GitPanel.tsx'
import { zh } from '../src/client/locales.ts'

const workbenchState = vi.hoisted(() => ({
  activeTabId: undefined as string | undefined,
  tabs: [] as Array<{ id: string; kind: 'file'; dirty: boolean }>,
}))

vi.mock('../src/client/use-workbench.ts', () => ({ useWorkbench: () => workbenchState }))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
  Tooltip: ({ children, label }: { children: React.ReactNode; label: string | (() => string) }) => (
    <span data-tooltip={typeof label === 'function' ? label() : label}>{children}</span>
  ),
  Menu: ({ anchor, open, items, onSelect }: {
    anchor: React.ReactNode
    open: boolean
    items: Array<{ id: string; label?: React.ReactNode; icon?: React.ReactNode; type?: string; disabled?: boolean }>
    onSelect: (id: string) => void
  }) => (
    <span>
      {anchor}
      {open && <div role="menu">{items.filter(item => item.type === undefined).map(item => (
        <button type="button" key={item.id} disabled={item.disabled} onClick={() => { onSelect(item.id) }}>{item.icon}{item.label}</button>
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

beforeEach(() => { workbenchState.tabs = [] })
afterEach(() => { cleanup() })

describe('Git panel', () => {
  it('switches list/tree layouts and opens only the selected change', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)

    await waitFor(() => { expect(view.container.querySelector('[data-change-layout="list"]')).not.toBeNull() })
    fireEvent.click(view.getAllByTitle('src/nested/a.ts')[1]!)
    expect(controller.openDiff).toHaveBeenCalledWith('workspace-1', 'src/nested/a.ts', false)

    fireEvent.click(view.getByRole('button', { name: '文件排列方式' }))
    fireEvent.click(view.getByRole('button', { name: '目录树' }))
    expect(view.container.querySelector('[data-change-layout="tree"]')).not.toBeNull()
    expect(view.getAllByTitle('src')).toHaveLength(2)
    expect(view.getAllByTitle('src/nested')).toHaveLength(2)
  })

  it('renders a commit graph while keeping subject, author, refs, and in-place file expansion', async () => {
    const { controller, commit } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '切换到提交图' })).toBeTruthy() })

    fireEvent.click(view.getByRole('button', { name: '文件排列方式' }))
    fireEvent.click(view.getByRole('button', { name: '目录树' }))
    expect(view.container.querySelector('[data-change-layout="tree"]')).not.toBeNull()
    fireEvent.click(view.getByRole('button', { name: '切换到提交图' }))

    const row = view.getByRole('button', { name: /完善工作台.*Tester.*main/u })
    expect(row.textContent).not.toContain(commit.shortHash)
    expect(row.textContent).not.toContain('2026')
    expect(row.querySelector('[data-icon="chevron"]')).toBeNull()
    expect(row.parentElement?.getAttribute('data-tooltip')).toContain(commit.shortHash)
    expect(row.parentElement?.getAttribute('data-tooltip')).not.toContain(commit.hash)
    expect(row.parentElement?.getAttribute('data-tooltip')).toContain('已更改 13 个文件，775 行插入(+)，288 行删除(-)')
    expect(row.querySelector('[data-reference-kind="head"]')).not.toBeNull()
    expect(view.container.querySelector('[data-git-graph]')).not.toBeNull()
    expect(row.closest('[data-graph-lanes]')?.getAttribute('data-graph-lanes')).toBe('1')
    expect(row.closest<HTMLElement>('[data-graph-lanes]')?.style.getPropertyValue('--git-row-graph-width')).toBe('16px')
    expect(view.container.querySelectorAll('[data-graph-node]')).toHaveLength(1)
    expect(view.container.querySelector('[data-node-kind="reference"]')).not.toBeNull()
    expect(view.getByRole('button', { name: '切换到更改' })).toBeTruthy()
    expect(view.container.querySelectorAll('[data-graph-edge="outgoing"]')).toHaveLength(1)
    expect(view.container.querySelectorAll('[data-graph-continuation]')).toHaveLength(1)

    const subject = row.querySelector('[data-commit-subject]')
    const author = row.querySelector('[data-commit-author]')
    const reference = row.querySelector('[data-git-reference]')
    expect(subject?.compareDocumentPosition(author!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(author?.compareDocumentPosition(reference!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

    fireEvent.click(row)
    await waitFor(() => { expect(view.getByTitle('src/graph.ts')).toBeTruthy() })
    expect(view.container.querySelector('[data-commit-file-layout="list"]')).not.toBeNull()
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(controller.api.gitCommitFiles).toHaveBeenCalledWith('workspace-1', commit.hash)

    fireEvent.click(view.getByRole('button', { name: '文件排列方式' }))
    fireEvent.click(view.getByRole('button', { name: '目录树' }))
    expect(view.container.querySelector('[data-commit-file-layout="tree"]')).not.toBeNull()
    expect(view.getByTitle('src')).toBeTruthy()
    expect(view.getByTitle('src/nested')).toBeTruthy()

    fireEvent.click(view.getByTitle('src/graph.ts'))
    expect(controller.openCommitDiff).toHaveBeenCalledWith('workspace-1', commit, 'src/graph.ts')

    fireEvent.click(view.getByRole('button', { name: '切换到更改' }))
    expect(view.container.querySelector('[data-change-layout="tree"]')).not.toBeNull()
  })

  it('switches branches and runs explicit remote actions from DSH menus', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '切换分支' })).toBeTruthy() })

    const branchButton = view.getByRole('button', { name: '切换分支' })
    expect(branchButton.querySelectorAll('circle')).toHaveLength(3)
    fireEvent.click(branchButton)
    const topicButton = view.getByRole('button', { name: 'topic' })
    expect(topicButton.querySelectorAll('circle')).toHaveLength(3)
    fireEvent.click(topicButton)
    await waitFor(() => { expect(controller.api.gitSwitchBranch).toHaveBeenCalledWith('workspace-1', 'refs/heads/topic') })
    expect(controller.resetWorkspaceView).toHaveBeenCalled()

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '抓取远程更新' }))
    await waitFor(() => { expect(controller.api.gitRemoteOperation).toHaveBeenCalledWith('workspace-1', 'fetch') })

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '刷新 Git 状态' }))
    expect(controller.closeDiffTabs).toHaveBeenCalledWith('workspace-1')
  })

  it('blocks workspace-changing Git operations while the editor has an unsaved draft', async () => {
    workbenchState.tabs = [
      { id: 'file:a.ts', kind: 'file', dirty: false },
      { id: 'file:b.ts', kind: 'file', dirty: true },
    ]
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
      workspaceId="workspace-1"
      t={(key: keyof typeof zh, params?: Record<string, unknown>) => interpolate(zh[key], params)}
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
    parents: ['b'.repeat(40)],
    references: [{ name: 'main', kind: 'head' as const }],
    stats: { filesChanged: 13, additions: 775, deletions: 288 },
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
      gitGraph: vi.fn(() => Promise.resolve({ commits: [commit], truncated: false })),
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
        files: [
          { path: 'src/graph.ts', status: 'M' },
          { path: 'src/nested/deep.ts', status: 'A' },
          { path: 'README.md', status: 'M' },
        ],
      })),
      gitSwitchBranch: vi.fn(() => Promise.resolve({ ...status, branch: 'topic' })),
      gitRemoteOperation: vi.fn((operation: string) => Promise.resolve({ operation })),
    },
    openDiff: vi.fn(() => Promise.resolve()),
    openCommitDiff: vi.fn(() => Promise.resolve()),
    resetWorkspaceView: vi.fn(),
    closeDiffTabs: vi.fn(),
  }
  return { controller, commit }
}

function interpolate(template: string, params: Record<string, unknown> = {}): string {
  return template.replace(/\{([^}]+)\}/gu, (_, key: string) => String(params[key] ?? `{${key}}`))
}
