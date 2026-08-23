// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitPanel } from '../src/client/GitPanel.tsx'
import { zh } from '../src/client/locales.ts'

const workbenchStore = vi.hoisted(() => {
  let snapshot = {
    activeTabId: undefined as string | undefined,
    tabs: [] as Array<{ id: string; kind: 'file'; dirty: boolean }>,
    gitView: 'changes' as 'changes' | 'graph',
    gitChangeLayout: 'list' as 'list' | 'tree',
    gitGraphFileLayout: 'list' as 'list' | 'tree',
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    update: (patch: Partial<typeof snapshot>) => {
      snapshot = { ...snapshot, ...patch }
      listeners.forEach(listener => { listener() })
    },
    reset: () => {
      snapshot = {
        activeTabId: undefined,
        tabs: [],
        gitView: 'changes',
        gitChangeLayout: 'list',
        gitGraphFileLayout: 'list',
      }
      listeners.forEach(listener => { listener() })
    },
  }
})

vi.mock('../src/client/use-workbench.ts', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useWorkbench: () => useSyncExternalStore(
      workbenchStore.subscribe,
      workbenchStore.getSnapshot,
      workbenchStore.getSnapshot,
    ),
  }
})

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Modal: ({ open, title, children, footer }: { open: boolean; title: string; children?: React.ReactNode; footer?: React.ReactNode }) => (
    open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null
  ),
  RiskConfirmation: ({ open, title, acknowledgeLabel, cancelLabel, confirmLabel, acknowledged, onAcknowledgedChange, onCancel, onConfirm }: {
    open: boolean
    title: string
    acknowledgeLabel: string
    cancelLabel: string
    confirmLabel: string
    acknowledged: boolean
    onAcknowledgedChange: (value: boolean) => void
    onCancel: () => void
    onConfirm: () => void
  }) => open ? (
    <div role="dialog" aria-label={title}>
      <label><input type="checkbox" checked={acknowledged} onChange={event => { onAcknowledgedChange(event.currentTarget.checked) }} />{acknowledgeLabel}</label>
      <button type="button" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" disabled={!acknowledged} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ) : null,
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
  IconCopyOutline16: () => <span />,
  IconDownloadOutline16: () => <span />,
  IconEditOutline16: () => <span />,
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
  IconTrashOutline16: () => <span />,
}))

beforeEach(() => { workbenchStore.reset() })
afterEach(() => { cleanup() })

describe('Git panel', () => {
  it('uses the native neutral notice surface for successful Git feedback', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/Workbench.module.css'), 'utf8')
    const successRule = stylesheet.match(/\.success\s*\{[^}]+\}/u)?.[0]

    expect(successRule).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    expect(successRule).toContain('color: var(--dsw-alias-label-primary)')
    expect(successRule).not.toContain('state-success-secondary')
  })

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
    expect(view.getByRole('button', { name: '切换到提交图' }).querySelector('[data-icon="commit-graph"]')).not.toBeNull()

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

  it('opens the commit context menu, compares with the workspace, and confirms commit actions', async () => {
    const { controller, commit } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '切换到提交图' })).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: '切换到提交图' }))
    const row = view.getByRole('button', { name: /完善工作台.*Tester.*main/u })

    fireEvent.contextMenu(row)
    fireEvent.click(view.getByRole('button', { name: '与当前工作区比较' }))
    await waitFor(() => { expect(controller.api.gitComparisonFiles).toHaveBeenCalledWith('workspace-1', commit.hash) })
    expect(view.getByText('与当前工作区比较')).toBeTruthy()
    fireEvent.click(view.getByTitle('src/graph.ts'))
    expect(controller.openComparisonDiff).toHaveBeenCalledWith('workspace-1', commit, 'src/graph.ts')

    fireEvent.click(view.getByRole('button', { name: '提交操作' }))
    fireEvent.click(view.getByRole('button', { name: '从此提交新建分支…' }))
    const branchDialog = view.getByRole('dialog', { name: '从指定来源新建分支' })
    expect(branchDialog.querySelector<HTMLSelectElement>('select')?.value).toBe(commit.hash)
    fireEvent.click(view.getByRole('button', { name: '取消' }))

    fireEvent.click(view.getByRole('button', { name: '提交操作' }))
    fireEvent.click(view.getByRole('button', { name: 'Cherry-pick 此提交…' }))
    const actionDialog = view.getByRole('dialog', { name: 'Cherry-pick 此提交？' })
    fireEvent.click(actionDialog.querySelector<HTMLButtonElement>('button:last-child')!)
    await waitFor(() => {
      expect(controller.api.gitCommitAction).toHaveBeenCalledWith('workspace-1', 'cherry-pick', commit.hash)
    })
    expect(controller.resetWorkspaceView).toHaveBeenCalledWith('workspace-1')
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

  it('creates from a selected source, renames the current branch, and safely deletes another branch', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '切换分支' })).toBeTruthy() })

    fireEvent.click(view.getByRole('button', { name: '切换分支' }))
    fireEvent.click(view.getByRole('button', { name: '从指定来源新建分支…' }))
    const createDialog = view.getByRole('dialog', { name: '从指定来源新建分支' })
    fireEvent.change(createDialog.querySelector('input')!, { target: { value: 'feature/graph' } })
    fireEvent.change(createDialog.querySelector('select')!, { target: { value: 'refs/heads/topic' } })
    fireEvent.click(view.getByRole('button', { name: '创建分支' }))
    await waitFor(() => {
      expect(controller.api.gitCreateBranch).toHaveBeenCalledWith('workspace-1', 'feature/graph', 'refs/heads/topic')
    })
    expect(controller.resetWorkspaceView).toHaveBeenCalledWith('workspace-1')

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '重命名当前分支…' }))
    const renameDialog = view.getByRole('dialog', { name: '重命名当前分支' })
    fireEvent.change(renameDialog.querySelector('input')!, { target: { value: 'main-renamed' } })
    fireEvent.click(view.getByRole('button', { name: '重命名' }))
    await waitFor(() => { expect(controller.api.gitRenameBranch).toHaveBeenCalledWith('workspace-1', 'main-renamed') })

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '删除本地分支…' }))
    expect(view.getByRole('dialog', { name: '删除本地分支' }).querySelector<HTMLSelectElement>('select')?.value).toBe('refs/heads/topic')
    fireEvent.click(view.getByRole('button', { name: '删除分支' }))
    await waitFor(() => { expect(controller.api.gitDeleteBranch).toHaveBeenCalledWith('workspace-1', 'refs/heads/topic') })
  })

  it('adds remote configuration and runs an operation against the chosen remote', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '更多 Git 操作' })).toBeTruthy() })

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '管理远端…' }))
    const manageDialog = await view.findByRole('dialog', { name: '管理 Git 远端' })
    fireEvent.change(view.getByLabelText('远端名称'), { target: { value: 'backup' } })
    fireEvent.change(view.getByLabelText('抓取地址'), { target: { value: 'https://example.invalid/repo.git' } })
    fireEvent.click(view.getByRole('button', { name: '保存远端' }))
    await waitFor(() => {
      expect(controller.api.gitAddRemote).toHaveBeenCalledWith('workspace-1', {
        name: 'backup', fetchUrl: 'https://example.invalid/repo.git', pushUrl: '',
      })
    })
    expect(manageDialog).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '更多 Git 操作' }))
    fireEvent.click(view.getByRole('button', { name: '指定远端操作…' }))
    await view.findByRole('dialog', { name: '指定远端操作' })
    fireEvent.click(view.getByRole('button', { name: '抓取' }))
    await waitFor(() => {
      expect(controller.api.gitTargetRemoteOperation).toHaveBeenCalledWith('workspace-1', 'fetch', 'origin', undefined)
    })
  })

  it('runs batch index actions and confirms destructive worktree discard', async () => {
    const { controller } = harness()
    const view = renderPanel(controller)
    await waitFor(() => { expect(view.getByRole('button', { name: '暂存全部更改' })).toBeTruthy() })

    fireEvent.click(view.getByRole('button', { name: '暂存全部更改' }))
    await waitFor(() => { expect(controller.api.gitStageAll).toHaveBeenCalledWith('workspace-1') })
    expect(controller.closeDiffTabs).toHaveBeenCalledWith('workspace-1')

    fireEvent.click(view.getByRole('button', { name: '放弃更改 src/nested/a.ts' }))
    const confirmation = view.getByRole('dialog', { name: '放弃此文件的更改？' })
    fireEvent.click(view.getByLabelText('我明白这些工作区内容无法通过此操作恢复。'))
    fireEvent.click(confirmation.querySelector<HTMLButtonElement>('button:last-child')!)
    await waitFor(() => { expect(controller.api.gitDiscard).toHaveBeenCalledWith('workspace-1', 'src/nested/a.ts') })
    expect(controller.resetWorkspaceView).toHaveBeenCalledWith('workspace-1')
  })

  it('blocks workspace-changing Git operations while the editor has an unsaved draft', async () => {
    workbenchStore.update({ tabs: [
      { id: 'file:a.ts', kind: 'file', dirty: false },
      { id: 'file:b.ts', kind: 'file', dirty: true },
    ] })
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
      gitComparisonFiles: vi.fn(() => Promise.resolve({
        commit,
        files: [
          { path: 'src/graph.ts', status: 'M' },
          { path: 'src/new.ts', status: 'A' },
        ],
      })),
      gitCommitAction: vi.fn((operation: string) => Promise.resolve({ operation, summary: `${operation} done` })),
      gitSwitchBranch: vi.fn(() => Promise.resolve({ ...status, branch: 'topic' })),
      gitCreateBranch: vi.fn(() => Promise.resolve({ ...status, branch: 'feature/graph' })),
      gitRenameBranch: vi.fn(() => Promise.resolve({ ...status, branch: 'main-renamed' })),
      gitDeleteBranch: vi.fn(() => Promise.resolve(status)),
      gitRemoteOperation: vi.fn((operation: string) => Promise.resolve({ operation })),
      gitRemotes: vi.fn(() => Promise.resolve({
        remotes: [{ name: 'origin', fetchUrl: 'https://example.invalid/origin.git', pushUrl: 'https://example.invalid/origin.git', separatePushUrl: false }],
      })),
      gitAddRemote: vi.fn(() => Promise.resolve({ remotes: [] })),
      gitUpdateRemote: vi.fn(() => Promise.resolve({ remotes: [] })),
      gitDeleteRemote: vi.fn(() => Promise.resolve({ remotes: [] })),
      gitTargetRemoteOperation: vi.fn((operation: string, remote: string, branch?: string) => Promise.resolve({ operation, remote, branch })),
      gitStage: vi.fn(() => Promise.resolve(status)),
      gitStageAll: vi.fn(() => Promise.resolve(status)),
      gitUnstage: vi.fn(() => Promise.resolve(status)),
      gitUnstageAll: vi.fn(() => Promise.resolve(status)),
      gitDiscard: vi.fn(() => Promise.resolve(status)),
      gitDiscardAll: vi.fn(() => Promise.resolve(status)),
    },
    openDiff: vi.fn(() => Promise.resolve()),
    openCommitDiff: vi.fn(() => Promise.resolve()),
    openComparisonDiff: vi.fn(() => Promise.resolve()),
    resetWorkspaceView: vi.fn(),
    closeDiffTabs: vi.fn(),
    setGitView: vi.fn((view: 'changes' | 'graph') => { workbenchStore.update({ gitView: view }) }),
    toggleGitView: vi.fn(() => {
      workbenchStore.update({ gitView: workbenchStore.getSnapshot().gitView === 'changes' ? 'graph' : 'changes' })
    }),
    setGitFileLayout: vi.fn((view: 'changes' | 'graph', layout: 'list' | 'tree') => {
      workbenchStore.update(view === 'changes' ? { gitChangeLayout: layout } : { gitGraphFileLayout: layout })
    }),
  }
  return { controller, commit }
}

function interpolate(template: string, params: Record<string, unknown> = {}): string {
  return template.replace(/\{([^}]+)\}/gu, (_, key: string) => String(params[key] ?? `{${key}}`))
}
