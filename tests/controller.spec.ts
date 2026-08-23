import { beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveWorkbenchWorkspaceId } from '../src/client/workspace-binding.ts'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: <T,>(initial: T) => {
    let state = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => state,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set: (next: T) => { state = next; listeners.forEach(listener => { listener() }) },
      update: (mutator: (draft: T) => void) => {
        const next = structuredClone(state)
        mutator(next)
        state = next
        listeners.forEach(listener => { listener() })
      },
    }
  },
}))

let WorkbenchController: typeof import('../src/client/controller.ts').WorkbenchController

beforeAll(async () => {
  WorkbenchController = (await import('../src/client/controller.ts')).WorkbenchController
})

describe('WorkbenchController', () => {
  it('opens Markdown in preview mode and saves the active tab with its observed version', async () => {
    const api = {
      readFile: vi.fn(() => Promise.resolve(file('README.md', '# Title', 'v1', true))),
      saveFile: vi.fn(() => Promise.resolve({ path: 'README.md', version: 'v2', size: 8 })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'README.md')

    expect(activeTab(controller)).toMatchObject({ path: 'README.md', preview: true, dirty: false, draft: '# Title' })
    controller.setDraft('# Title!')
    expect(activeTab(controller)?.dirty).toBe(true)
    await controller.save()
    expect(api.saveFile).toHaveBeenCalledWith('workspace-1', 'README.md', '# Title!', 'v1')
    expect(activeTab(controller)).toMatchObject({ dirty: false, saving: false, file: { version: 'v2' } })
  })

  it('opens multiple files and switches tabs without blocking an unsaved draft', async () => {
    const api = {
      readFile: vi.fn()
        .mockResolvedValueOnce(file('first.ts', 'one', '1'))
        .mockResolvedValueOnce(file('second.ts', 'two', '2')),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'first.ts')
    controller.setDraft('changed')
    await controller.openFile('workspace-1', 'second.ts')

    expect(controller.store.getSnapshot()).toMatchObject({
      tabs: [
        { path: 'first.ts', draft: 'changed', dirty: true },
        { path: 'second.ts', draft: 'two', dirty: false },
      ],
    })
    expect(activeTab(controller)?.path).toBe('second.ts')
    controller.selectTab(fileTab(controller, 'first.ts')!.id)
    expect(activeTab(controller)).toMatchObject({ path: 'first.ts', draft: 'changed', dirty: true })
  })

  it('loads concurrent file tabs independently without an older response stealing selection', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    const first = new Promise(resolve => { resolveFirst = resolve })
    const api = {
      readFile: vi.fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce(file('new.ts', 'new', '2')),
    }
    const controller = createController(api)
    const oldRequest = controller.openFile('workspace-1', 'old.ts')
    await controller.openFile('workspace-1', 'new.ts')
    resolveFirst?.(file('old.ts', 'old', '1'))
    await oldRequest

    expect(activeTab(controller)?.path).toBe('new.ts')
    expect(controller.store.getSnapshot().tabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'old.ts', draft: 'old', loading: false }),
      expect.objectContaining({ path: 'new.ts', draft: 'new', loading: false }),
    ]))
  })

  it('selects an already open tab without reading the file again', async () => {
    const api = { readFile: vi.fn(() => Promise.resolve(file('same.ts', 'same', '1'))) }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'same.ts')
    await controller.openFile('workspace-1', 'same.ts')
    expect(api.readFile).toHaveBeenCalledOnce()
    expect(controller.store.getSnapshot().tabs).toHaveLength(1)
  })

  it('protects a dirty tab from ordinary close and chooses an adjacent tab after confirmed close', async () => {
    const api = {
      readFile: vi.fn()
        .mockResolvedValueOnce(file('first.ts', 'one', '1'))
        .mockResolvedValueOnce(file('second.ts', 'two', '2')),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'first.ts')
    controller.setDraft('changed')
    await controller.openFile('workspace-1', 'second.ts')
    const firstTabId = fileTab(controller, 'first.ts')!.id
    expect(controller.closeTab(firstTabId)).toBe(false)
    expect(controller.closeTab(firstTabId, true)).toBe(true)
    expect(controller.store.getSnapshot().tabs.map(tab => tab.path)).toEqual(['second.ts'])
    expect(activeTab(controller)?.path).toBe('second.ts')
  })

  it('retains all tabs and unsaved drafts while switching Workspaces', async () => {
    const api = { readFile: vi.fn(() => Promise.resolve(file('draft.txt', 'base', '1'))) }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'draft.txt')
    controller.setDraft('unsaved')
    controller.setWorkspace('workspace-2')
    controller.setWorkspace('workspace-1')
    expect(controller.store.getSnapshot()).toMatchObject({
      workspaceId: 'workspace-1',
      tabs: [{ path: 'draft.txt', draft: 'unsaved', dirty: true }],
    })
    expect(activeTab(controller)?.path).toBe('draft.txt')
  })

  it('keeps file tabs when another Session resolves to the same Workspace', async () => {
    const api = { readFile: vi.fn(() => Promise.resolve(file('shared.txt', 'base', '1'))) }
    const controller = createController(api)
    await controller.openFile('workspace-shared', 'shared.txt')
    controller.setDraft('shared draft')
    const workspaces = [{ workspaceId: 'workspace-shared', sessionIds: ['one', 'two'] }]
    controller.setWorkspace(resolveWorkbenchWorkspaceId(workspaces, 'two', 'workspace-shared'))
    expect(activeTab(controller)).toMatchObject({ path: 'shared.txt', draft: 'shared draft', dirty: true })
  })

  it('applies a late save to its file and Workspace without mutating the active Workspace', async () => {
    let finishSave: ((value: { path: string; version: string; size: number }) => void) | undefined
    const api = {
      readFile: vi.fn((workspaceId: string, path: string) => Promise.resolve(file(path, workspaceId, '1'))),
      saveFile: vi.fn(() => new Promise(resolve => { finishSave = resolve })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-a', 'a.txt')
    controller.setDraft('saved content')
    const saving = controller.save()
    await controller.openFile('workspace-b', 'b.txt')
    finishSave?.({ path: 'a.txt', version: '2', size: 13 })
    await saving

    expect(activeTab(controller)).toMatchObject({ path: 'b.txt', file: { version: '1' }, dirty: false })
    controller.setWorkspace('workspace-a')
    expect(activeTab(controller)).toMatchObject({ path: 'a.txt', file: { version: '2' }, dirty: false, saving: false })
  })

  it('updates the saved base while keeping newer edits dirty on that tab', async () => {
    let finishSave: ((value: { path: string; version: string; size: number }) => void) | undefined
    const api = {
      readFile: vi.fn(() => Promise.resolve(file('draft.txt', 'base', '1'))),
      saveFile: vi.fn(() => new Promise(resolve => { finishSave = resolve })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'draft.txt')
    controller.setDraft('first draft')
    const saving = controller.save()
    controller.setDraft('newer draft')
    finishSave?.({ path: 'draft.txt', version: '2', size: 11 })
    await saving
    expect(activeTab(controller)).toMatchObject({
      file: { content: 'first draft', version: '2' }, draft: 'newer draft', dirty: true, saving: false,
    })
  })

  it('saves the requested inactive tab without switching the active tab', async () => {
    const api = {
      readFile: vi.fn()
        .mockResolvedValueOnce(file('first.ts', 'one', '1'))
        .mockResolvedValueOnce(file('second.ts', 'two', '2')),
      saveFile: vi.fn(() => Promise.resolve({ path: 'first.ts', version: '3', size: 7 })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'first.ts')
    controller.setDraft('changed')
    await controller.openFile('workspace-1', 'second.ts')
    await controller.save(fileTab(controller, 'first.ts')!.id)
    expect(activeTab(controller)?.path).toBe('second.ts')
    expect(controller.store.getSnapshot().tabs.find(tab => tab.path === 'first.ts')).toMatchObject({ dirty: false })
  })

  it('opens commit and workspace-comparison Diffs as distinct tabs without discarding files', async () => {
    const commit = {
      hash: 'a'.repeat(40), shortHash: 'aaaaaaa', parents: ['b'.repeat(40)], subject: '图中提交', author: 'Tester', authoredAt: '2026-08-23T10:00:00Z',
      references: [],
    }
    const api = {
      readFile: vi.fn(() => Promise.resolve(file('kept.ts', 'kept', '1'))),
      gitCommitFileDiff: vi.fn(() => Promise.resolve({
        kind: 'commit', path: 'src/a.ts', status: 'M', revision: commit.hash,
        original: 'before', modified: 'after', binary: false,
      })),
      gitComparisonFileDiff: vi.fn(() => Promise.resolve({
        kind: 'comparison', path: 'src/a.ts', status: 'M', revision: commit.hash,
        original: 'before', modified: 'workspace', binary: false,
      })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'kept.ts')
    await controller.openCommitDiff('workspace-1', commit, 'src/a.ts')
    await controller.openComparisonDiff('workspace-1', commit, 'src/a.ts')
    expect(controller.store.getSnapshot().tabs).toEqual([
      expect.objectContaining({ kind: 'file', path: 'kept.ts' }),
      expect.objectContaining({ kind: 'diff', diffKind: 'commit', path: 'src/a.ts' }),
      expect.objectContaining({ kind: 'diff', diffKind: 'comparison', path: 'src/a.ts', diff: expect.objectContaining({ modified: 'workspace' }) }),
    ])
    expect(activeTab(controller)).toMatchObject({ kind: 'diff', diffKind: 'comparison', path: 'src/a.ts' })
    controller.selectTab(fileTab(controller, 'kept.ts')!.id)
    expect(activeTab(controller)?.path).toBe('kept.ts')
  })

  it('loads multiple Diff tabs independently without an older response stealing selection', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    const first = new Promise(resolve => { resolveFirst = resolve })
    const api = {
      gitDiff: vi.fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce({ kind: 'worktree', path: 'new.ts', status: 'M', original: 'before', modified: 'after', binary: false }),
    }
    const controller = createController(api)
    const oldRequest = controller.openDiff('workspace-1', 'old.ts', false)
    await controller.openDiff('workspace-1', 'new.ts', false)
    expect(activeTab(controller)).toMatchObject({ kind: 'diff', path: 'new.ts', loading: false })
    resolveFirst?.({ kind: 'worktree', path: 'old.ts', status: 'M', original: 'old', modified: 'older', binary: false })
    await oldRequest
    expect(activeTab(controller)?.path).toBe('new.ts')
    expect(controller.store.getSnapshot().tabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'diff', path: 'old.ts', loading: false }),
      expect.objectContaining({ kind: 'diff', path: 'new.ts', loading: false }),
    ]))

    await controller.openDiff('workspace-1', 'new.ts', false)
    expect(api.gitDiff).toHaveBeenCalledTimes(2)
    expect(controller.store.getSnapshot().tabs).toHaveLength(2)
  })

  it('closes stale Diff tabs without discarding file drafts', async () => {
    const api = {
      readFile: vi.fn(() => Promise.resolve(file('kept.ts', 'base', '1'))),
      gitDiff: vi.fn(() => Promise.resolve({
        kind: 'worktree', path: 'changed.ts', status: 'M', original: 'old', modified: 'new', binary: false,
      })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'kept.ts')
    controller.setDraft('draft')
    await controller.openDiff('workspace-1', 'changed.ts', false)
    controller.closeDiffTabs()
    expect(controller.store.getSnapshot().tabs).toEqual([
      expect.objectContaining({ kind: 'file', path: 'kept.ts', draft: 'draft', dirty: true }),
    ])
    expect(activeTab(controller)?.path).toBe('kept.ts')
  })

  it('stores the preferred Diff layout in the current Workspace state', () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    const controller = new WorkbenchController({} as never, logger)
    controller.setWorkspace('workspace-1')
    controller.setDiffViewMode('inline')
    expect(controller.store.getSnapshot().diffViewMode).toBe('inline')
    expect(logger.info).toHaveBeenCalledWith('workbench-layout: Diff view mode changed to inline')
  })

  it('binds Git presentation to each Workspace and exposes one-shot rail actions', () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    const controller = new WorkbenchController({} as never, logger)
    controller.setWorkspace('workspace-1')
    controller.setGitView('graph')
    controller.setGitFileLayout('graph', 'tree')
    const requestId = controller.requestSidebarAction('files.newFile')

    expect(controller.store.getSnapshot()).toMatchObject({
      gitView: 'graph',
      gitGraphFileLayout: 'tree',
      sidebarAction: { id: requestId, action: 'files.newFile', workspaceId: 'workspace-1' },
    })
    controller.consumeSidebarAction(requestId!)
    expect(controller.store.getSnapshot().sidebarAction).toBeUndefined()

    controller.setWorkspace('workspace-2')
    expect(controller.store.getSnapshot()).toMatchObject({ gitView: 'changes', gitGraphFileLayout: 'list' })
    controller.setWorkspace('workspace-1')
    expect(controller.store.getSnapshot()).toMatchObject({ gitView: 'graph', gitGraphFileLayout: 'tree' })
    expect(controller.store.getSnapshot().sidebarAction).toBeUndefined()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('queued collapsed sidebar action files.newFile'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('consumed collapsed sidebar action files.newFile'))
  })

  it('clears every file tab and Diff after Git changes the Workspace', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    const api = { readFile: vi.fn(() => Promise.resolve(file('src/a.ts', 'before', '1'))) }
    const controller = new WorkbenchController(api as never, logger)
    await controller.openFile('workspace-1', 'src/a.ts')
    controller.resetWorkspaceView()
    expect(controller.store.getSnapshot()).toMatchObject({ tabs: [] })
    expect(controller.store.getSnapshot().activeTabId).toBeUndefined()
    expect(logger.info).toHaveBeenCalledWith('workbench-layout: cleared editor tabs after Git changed workspace "workspace-1"')
  })

  it('invalidates an inactive Workspace without clearing active Workspace tabs', async () => {
    const api = { readFile: vi.fn((_workspaceId: string, path: string) => Promise.resolve(file(path, path, '1'))) }
    const controller = createController(api)
    await controller.openFile('workspace-a', 'workspace-a.ts')
    await controller.openFile('workspace-b', 'workspace-b.ts')
    controller.resetWorkspaceView('workspace-a')
    expect(activeTab(controller)?.path).toBe('workspace-b.ts')
    controller.setWorkspace('workspace-a')
    expect(controller.store.getSnapshot()).toMatchObject({ workspaceId: 'workspace-a', tabs: [] })
  })

  it('releases and restores the sidebar shadow when switching Sessions and Files', () => {
    const setActive = vi.fn()
    const controller = createController({})
    controller.attachSidebarShadow(setActive)
    controller.setSidebarMode('sessions')
    controller.setSidebarMode('files')
    expect(setActive.mock.calls).toEqual([[true], [false], [true]])
  })

  it('collapses the middle editor explicitly and reveals it for files, Diffs, terminals, and tab selections', async () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const api = {
      readFile: vi.fn(() => Promise.resolve(file('src/a.ts', 'content', '1'))),
      gitDiff: vi.fn(() => Promise.resolve({
        kind: 'worktree', path: 'src/a.ts', status: 'M', original: 'before', modified: 'after', binary: false,
      })),
    }
    const logger = { info: vi.fn(), warn: vi.fn() }
    const controller = new WorkbenchController(api as never, logger, layout)
    controller.setWorkspace('workspace-1')
    controller.synchronizeEditorLayout()
    expect(layout.openDetails).toHaveBeenCalledOnce()

    controller.toggleEditor()
    expect(controller.store.getSnapshot().editorExpanded).toBe(false)
    expect(layout.closeDetails).toHaveBeenCalledOnce()
    await controller.openFile('workspace-1', 'src/a.ts')
    expect(controller.store.getSnapshot().editorExpanded).toBe(true)

    controller.toggleEditor()
    await controller.openDiff('workspace-1', 'src/a.ts', false)
    expect(controller.store.getSnapshot().editorExpanded).toBe(true)

    controller.toggleEditor()
    const terminalId = controller.openTerminal('workspace-1')
    expect(controller.store.getSnapshot().editorExpanded).toBe(true)

    controller.toggleEditor()
    controller.selectTab(terminalId!)
    expect(controller.store.getSnapshot().editorExpanded).toBe(true)
    expect(layout.openDetails).toHaveBeenCalledTimes(5)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('collapsed middle editor from sidebar control'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('expanded middle editor from content selection'))
  })

  it('opens a Workspace-bound terminal from the Terminal mode and tracks its lifecycle', () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    const controller = new WorkbenchController({} as never, logger)
    controller.setWorkspace('workspace-1')
    controller.setSidebarMode('terminal')
    const terminal = activeTab(controller)

    expect(terminal).toMatchObject({ kind: 'terminal', sequence: 1, generation: 0, status: 'connecting' })
    controller.terminalReady(terminal!.id, 'zsh')
    expect(activeTab(controller)).toMatchObject({ kind: 'terminal', status: 'running', shell: 'zsh' })
    controller.terminalExited(terminal!.id, 7, 15)
    expect(activeTab(controller)).toMatchObject({ kind: 'terminal', status: 'exited', exitCode: 7, signal: 15 })
    controller.restartTerminal(terminal!.id)
    expect(activeTab(controller)).toMatchObject({ kind: 'terminal', generation: 1, status: 'connecting' })
    expect(activeTab(controller)).not.toHaveProperty('exitCode')
  })

  it('keeps multiple terminals in one Workspace but terminates their state on Workspace switch', async () => {
    const api = { readFile: vi.fn(() => Promise.resolve(file('kept.ts', 'kept', '1'))) }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'kept.ts')
    const first = controller.openTerminal()
    const second = controller.openTerminal()
    expect(controller.store.getSnapshot().tabs.filter(tab => tab.kind === 'terminal')).toHaveLength(2)
    expect(first).not.toBe(second)

    controller.setWorkspace('workspace-2')
    controller.setWorkspace('workspace-1')
    expect(controller.store.getSnapshot().tabs).toEqual([
      expect.objectContaining({ kind: 'file', path: 'kept.ts' }),
    ])
  })

  it('preserves live terminal tabs when Git invalidates file and Diff tabs', async () => {
    const api = { readFile: vi.fn(() => Promise.resolve(file('src/a.ts', 'before', '1'))) }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'src/a.ts')
    const terminalId = controller.openTerminal()
    controller.resetWorkspaceView()
    expect(controller.store.getSnapshot().tabs).toEqual([
      expect.objectContaining({ id: terminalId, kind: 'terminal' }),
    ])
    expect(controller.store.getSnapshot().activeTabId).toBe(terminalId)
  })

  it('closes only file and Diff tabs backed by a renamed or deleted entry', async () => {
    const api = {
      readFile: vi.fn((_workspaceId: string, path: string) => Promise.resolve(file(path, path, '1'))),
      gitDiff: vi.fn((_workspaceId: string, path: string) => Promise.resolve({
        kind: 'worktree', path, status: 'M', original: 'old', modified: 'new', binary: false,
      })),
    }
    const controller = createController(api)
    await controller.openFile('workspace-1', 'src/a.ts')
    await controller.openFile('workspace-1', 'src/nested/b.ts')
    await controller.openFile('workspace-1', 'kept.ts')
    await controller.openDiff('workspace-1', 'src/a.ts', false)
    const terminalId = controller.openTerminal()

    controller.closeWorkspaceEntries('workspace-1', 'src')

    expect(controller.store.getSnapshot().tabs).toEqual([
      expect.objectContaining({ kind: 'file', path: 'kept.ts' }),
      expect.objectContaining({ kind: 'terminal', id: terminalId }),
    ])
    expect(controller.store.getSnapshot().activeTabId).toBe(terminalId)
  })
})

function createController(api: object) {
  return new WorkbenchController(api as never, { info: vi.fn(), warn: vi.fn() })
}

function activeTab(controller: ReturnType<typeof createController>) {
  const state = controller.store.getSnapshot()
  return state.tabs.find(tab => tab.id === state.activeTabId)
}

function fileTab(controller: ReturnType<typeof createController>, path: string) {
  return controller.store.getSnapshot().tabs.find(tab => tab.kind === 'file' && tab.path === path)
}

function file(path: string, content: string, version: string, markdown = false) {
  return { path, content, version, size: content.length, markdown }
}
