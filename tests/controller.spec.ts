import { beforeAll, describe, expect, it, vi } from 'vitest'

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
  it('opens Markdown in preview mode and saves with the observed version', async () => {
    const api = {
      readFile: vi.fn(() => Promise.resolve({
        path: 'README.md', content: '# Title', version: 'v1', size: 7, markdown: true,
      })),
      saveFile: vi.fn(() => Promise.resolve({ path: 'README.md', version: 'v2', size: 8 })),
    }
    const controller = new WorkbenchController(api as never, { info: vi.fn(), warn: vi.fn() })
    await controller.openFile('session-1', 'README.md')

    expect(controller.store.getSnapshot()).toMatchObject({ preview: true, dirty: false, draft: '# Title' })
    controller.setDraft('# Title!')
    expect(controller.store.getSnapshot().dirty).toBe(true)
    await controller.save()
    expect(api.saveFile).toHaveBeenCalledWith('session-1', 'README.md', '# Title!', 'v1')
    expect(controller.store.getSnapshot()).toMatchObject({ dirty: false, saving: false })
  })

  it('ignores an older file request that resolves after a newer selection', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    const first = new Promise(resolve => { resolveFirst = resolve })
    const api = {
      readFile: vi.fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce({ path: 'new.ts', content: 'new', version: '2', size: 3, markdown: false }),
    }
    const controller = new WorkbenchController(api as never, { info: vi.fn(), warn: vi.fn() })
    const oldRequest = controller.openFile('session-1', 'old.ts')
    await controller.openFile('session-1', 'new.ts')
    resolveFirst?.({ path: 'old.ts', content: 'old', version: '1', size: 3, markdown: false })
    await oldRequest
    expect(controller.store.getSnapshot().file?.path).toBe('new.ts')
  })

  it('releases and restores the sidebar shadow when switching Sessions and Files', () => {
    const setActive = vi.fn()
    const controller = new WorkbenchController({} as never, { info: vi.fn(), warn: vi.fn() })
    controller.attachSidebarShadow(setActive)
    controller.setSidebarMode('sessions')
    controller.setSidebarMode('files')
    expect(setActive.mock.calls).toEqual([[true], [false], [true]])
  })

  it('blocks a different file until dirty content is saved or reverted', async () => {
    const api = {
      readFile: vi.fn()
        .mockResolvedValueOnce({ path: 'first.ts', content: 'one', version: '1', size: 3, markdown: false })
        .mockResolvedValueOnce({ path: 'second.ts', content: 'two', version: '2', size: 3, markdown: false }),
    }
    const controller = new WorkbenchController(api as never, { info: vi.fn(), warn: vi.fn() })
    await controller.openFile('session-1', 'first.ts')
    controller.setDraft('changed')
    await controller.openFile('session-1', 'second.ts')
    expect(api.readFile).toHaveBeenCalledTimes(1)
    expect(controller.store.getSnapshot()).toMatchObject({ file: { path: 'first.ts' }, dirty: true })

    controller.revert()
    await controller.openFile('session-1', 'second.ts')
    expect(controller.store.getSnapshot()).toMatchObject({ file: { path: 'second.ts' }, dirty: false })
  })

  it('retains an unsaved draft while switching away from and back to a Session', async () => {
    const api = {
      readFile: vi.fn(() => Promise.resolve({
        path: 'draft.txt', content: 'base', version: '1', size: 4, markdown: false,
      })),
    }
    const controller = new WorkbenchController(api as never, { info: vi.fn(), warn: vi.fn() })
    await controller.openFile('session-1', 'draft.txt')
    controller.setDraft('unsaved')
    controller.setSession('session-2')
    controller.setSession('session-1')
    expect(controller.store.getSnapshot()).toMatchObject({
      sessionId: 'session-1', file: { path: 'draft.txt' }, draft: 'unsaved', dirty: true,
    })
  })

  it('opens a historical commit diff in the middle column', async () => {
    const commit = {
      hash: 'a'.repeat(40), shortHash: 'aaaaaaa', subject: '历史提交', author: 'Tester', authoredAt: '2026-08-23T10:00:00Z',
    }
    const api = {
      gitCommitDiff: vi.fn(() => Promise.resolve({
        kind: 'commit', title: commit.subject, revision: commit.hash, text: 'diff --git',
      })),
    }
    const controller = new WorkbenchController(api as never, { info: vi.fn(), warn: vi.fn() })
    await controller.openCommitDiff('session-1', commit)
    expect(api.gitCommitDiff).toHaveBeenCalledWith('session-1', commit.hash)
    expect(controller.store.getSnapshot()).toMatchObject({
      centerMode: 'diff', loading: false, diff: { kind: 'commit', revision: commit.hash },
    })
  })
})
