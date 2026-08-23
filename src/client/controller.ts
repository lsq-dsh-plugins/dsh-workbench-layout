/** Shared browser state joining the root-scoped sidebar and Session-scoped editor. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitCommit, GitFileDiff, WorkspaceFile } from '../contracts.ts'
import { WorkbenchApi } from './api.ts'

export type SidebarMode = 'sessions' | 'files' | 'git'
export type DiffViewMode = 'split' | 'inline'

export interface WorkbenchFileTab {
  id: string
  kind: 'file'
  path: string
  file: WorkspaceFile | null
  draft: string
  dirty: boolean
  preview: boolean
  loading: boolean
  saving: boolean
  error: string | null
}

export interface WorkbenchDiffTab {
  id: string
  kind: 'diff'
  path: string
  diffKind: GitFileDiff['kind']
  revision?: string
  diff: GitFileDiff | null
  loading: boolean
  error: string | null
}

export type WorkbenchTab = WorkbenchFileTab | WorkbenchDiffTab

export interface WorkbenchState {
  sidebarMode: SidebarMode
  workspaceId?: string
  tabs: WorkbenchTab[]
  activeTabId?: string
  diffViewMode: DiffViewMode
}

const INITIAL_STATE: WorkbenchState = {
  sidebarMode: 'files',
  tabs: [],
  diffViewMode: 'split',
}

export interface WorkbenchLogger {
  info(message: string): void
  warn(message: string): void
}

/** Own unified file/Diff tabs, async races, dirty state, and the sidebar shadow. */
export class WorkbenchController {
  readonly store: SnapshotStore<WorkbenchState> = createSnapshotStore(INITIAL_STATE)
  readonly api: WorkbenchApi

  private requestId = 0
  private readonly fileRequests = new Map<string, number>()
  private readonly diffRequests = new Map<string, number>()
  private setSidebarShadow: ((active: boolean) => void) | undefined
  private readonly workspaceStates = new Map<string, WorkbenchState>()

  constructor(
    api: WorkbenchApi = new WorkbenchApi(),
    private readonly logger: WorkbenchLogger = console,
  ) {
    this.api = api
  }

  attachSidebarShadow(setActive: (active: boolean) => void): () => void {
    this.setSidebarShadow = setActive
    setActive(this.store.getSnapshot().sidebarMode !== 'sessions')
    return () => {
      if (this.setSidebarShadow === setActive) this.setSidebarShadow = undefined
    }
  }

  setSidebarMode(mode: SidebarMode): void {
    this.store.update((state) => { state.sidebarMode = mode })
    this.setSidebarShadow?.(mode !== 'sessions')
    this.logger.info(`workbench-layout: sidebar mode changed to ${mode}`)
  }

  setWorkspace(workspaceId: string | undefined): void {
    const state = this.store.getSnapshot()
    if (state.workspaceId === workspaceId) return
    if (state.workspaceId !== undefined) this.workspaceStates.set(state.workspaceId, cloneState(state))
    if (workspaceId === undefined) {
      this.store.set({ ...INITIAL_STATE, sidebarMode: state.sidebarMode })
      return
    }
    const restored = this.workspaceStates.get(workspaceId)
    this.store.set(restored === undefined
      ? { ...INITIAL_STATE, sidebarMode: state.sidebarMode, workspaceId }
      : { ...cloneState(restored), sidebarMode: state.sidebarMode, workspaceId })
    this.logger.info(`workbench-layout: activated workspace ${JSON.stringify(workspaceId)}`)
  }

  async openFile(workspaceId: string, path: string): Promise<void> {
    this.setWorkspace(workspaceId)
    const tabId = fileTabId(path)
    const current = this.store.getSnapshot()
    const existing = current.tabs.find(tab => tab.id === tabId)
    this.store.update((state) => {
      state.activeTabId = tabId
      if (existing === undefined) state.tabs.push(emptyFileTab(path))
    })
    if (existing?.kind === 'file' && existing.file !== null) {
      this.logger.info(`workbench-layout: selected open file tab ${JSON.stringify(path)}`)
      return
    }
    if (existing?.loading === true) return

    const requestKey = tabRequestKey(workspaceId, tabId)
    const requestId = ++this.requestId
    this.fileRequests.set(requestKey, requestId)
    this.updateFileTabState(workspaceId, tabId, (tab) => {
      tab.loading = true
      tab.error = null
    })
    try {
      const file = await this.api.readFile(workspaceId, path)
      if (this.fileRequests.get(requestKey) !== requestId) return
      this.updateFileTabState(workspaceId, tabId, (tab) => {
        tab.file = file
        tab.draft = file.content
        tab.dirty = false
        tab.preview = file.markdown
        tab.loading = false
        tab.error = null
      })
      this.logger.info(`workbench-layout: opened workspace file tab ${JSON.stringify(path)}`)
    } catch (error: unknown) {
      if (this.fileRequests.get(requestKey) !== requestId) return
      this.updateFileTabState(workspaceId, tabId, (tab) => {
        tab.loading = false
        tab.error = messageOf(error)
      })
      this.logger.warn(`workbench-layout: failed to open workspace file tab ${JSON.stringify(path)}`)
    }
  }

  selectTab(tabId: string): void {
    const state = this.store.getSnapshot()
    const tab = state.tabs.find(candidate => candidate.id === tabId)
    if (tab === undefined) return
    this.store.update((draft) => { draft.activeTabId = tabId })
    this.logger.info(`workbench-layout: selected ${tab.kind} tab ${JSON.stringify(tab.path)}`)
  }

  closeTab(tabId: string, discardDirty = false): boolean {
    const state = this.store.getSnapshot()
    const index = state.tabs.findIndex(tab => tab.id === tabId)
    const tab = state.tabs[index]
    if (tab === undefined || (tab.kind === 'file' && tab.dirty && !discardDirty)) return false
    const nextTabId = state.activeTabId === tabId
      ? state.tabs[index + 1]?.id ?? state.tabs[index - 1]?.id
      : state.activeTabId
    const requestKey = tabRequestKey(state.workspaceId, tabId)
    this.fileRequests.delete(requestKey)
    this.diffRequests.delete(requestKey)
    this.store.update((draft) => {
      draft.tabs.splice(index, 1)
      if (nextTabId === undefined) delete draft.activeTabId
      else draft.activeTabId = nextTabId
    })
    this.logger.info(`workbench-layout: closed ${tab.kind} tab ${JSON.stringify(tab.path)}`)
    return true
  }

  setDraft(value: string): void {
    const tabId = this.store.getSnapshot().activeTabId
    if (tabId === undefined) return
    this.store.update((state) => {
      const tab = state.tabs.find(candidate => candidate.id === tabId)
      if (tab?.kind !== 'file' || tab.file === null) return
      tab.draft = value
      tab.dirty = value !== tab.file.content
      tab.error = null
    })
  }

  revert(tabId = this.store.getSnapshot().activeTabId): void {
    if (tabId === undefined) return
    const selected = this.store.getSnapshot().tabs.find(tab => tab.id === tabId)
    if (selected?.kind !== 'file') return
    this.store.update((state) => {
      const tab = state.tabs.find(candidate => candidate.id === tabId)
      if (tab?.kind !== 'file' || tab.file === null) return
      tab.draft = tab.file.content
      tab.dirty = false
      tab.error = null
    })
    this.logger.info(`workbench-layout: reverted file tab ${JSON.stringify(selected.path)}`)
  }

  setPreview(preview: boolean): void {
    const tabId = this.store.getSnapshot().activeTabId
    if (tabId === undefined) return
    this.store.update((state) => {
      const tab = state.tabs.find(candidate => candidate.id === tabId)
      if (tab?.kind === 'file') tab.preview = preview
    })
  }

  async save(tabId = this.store.getSnapshot().activeTabId): Promise<boolean> {
    const current = this.store.getSnapshot()
    const tab = current.tabs.find(candidate => candidate.id === tabId)
    if (tab?.kind !== 'file') return false
    if (tab.file === null || current.workspaceId === undefined || tab.saving || !tab.dirty) {
      return !tab.dirty
    }
    const workspaceId = current.workspaceId
    const savedContent = tab.draft
    const version = tab.file.version
    this.updateFileTabState(workspaceId, tab.id, (draft) => {
      draft.saving = true
      draft.error = null
    })
    try {
      const saved = await this.api.saveFile(workspaceId, tab.path, savedContent, version)
      this.updateFileTabState(workspaceId, tab.id, (draft) => {
        if (draft.file === null) return
        draft.file = { ...draft.file, content: savedContent, version: saved.version, size: saved.size }
        draft.dirty = draft.draft !== savedContent
        draft.saving = false
        draft.error = null
      })
      this.logger.info(`workbench-layout: saved file tab ${JSON.stringify(tab.path)}`)
      return true
    } catch (error: unknown) {
      this.updateFileTabState(workspaceId, tab.id, (draft) => {
        draft.saving = false
        draft.error = messageOf(error)
      })
      this.logger.warn(`workbench-layout: failed to save file tab ${JSON.stringify(tab.path)}`)
      return false
    }
  }

  async openDiff(workspaceId: string, path: string, staged: boolean): Promise<void> {
    const diffKind = staged ? 'staged' : 'worktree'
    await this.openDiffTab(
      workspaceId,
      { id: diffTabId(diffKind, path), path, diffKind },
      () => this.api.gitDiff(workspaceId, path, staged),
      `Git ${diffKind} diff ${JSON.stringify(path)}`,
    )
  }

  async openCommitDiff(workspaceId: string, commit: GitCommit, path: string): Promise<void> {
    await this.openDiffTab(
      workspaceId,
      { id: diffTabId('commit', path, commit.hash), path, diffKind: 'commit', revision: commit.hash },
      () => this.api.gitCommitFileDiff(workspaceId, commit.hash, path),
      `Git commit diff ${commit.shortHash} ${JSON.stringify(path)}`,
    )
  }

  setDiffViewMode(mode: DiffViewMode): void {
    this.store.update((state) => { state.diffViewMode = mode })
    this.logger.info(`workbench-layout: Diff view mode changed to ${mode}`)
  }

  /** 关闭已失效的 Diff 标签，同时保留普通文件及其草稿。 */
  closeDiffTabs(workspaceId = this.store.getSnapshot().workspaceId): void {
    if (workspaceId === undefined) return
    this.updateWorkspaceState(workspaceId, (state) => {
      const activeIndex = state.tabs.findIndex(tab => tab.id === state.activeTabId)
      const retained = state.tabs.filter(tab => tab.kind === 'file')
      const activeStillExists = retained.some(tab => tab.id === state.activeTabId)
      state.tabs = retained
      if (!activeStillExists) {
        const next = retained[Math.min(Math.max(0, activeIndex), retained.length - 1)]
        if (next === undefined) delete state.activeTabId
        else state.activeTabId = next.id
      }
    })
    this.logger.info(`workbench-layout: closed stale Diff tabs for workspace ${JSON.stringify(workspaceId)}`)
  }

  /** Clear every editor tab after Git changes one Workspace. */
  resetWorkspaceView(workspaceId = this.store.getSnapshot().workspaceId): void {
    if (workspaceId === undefined) return
    this.updateWorkspaceState(workspaceId, (state) => {
      state.tabs = []
      delete state.activeTabId
    })
    this.logger.info(`workbench-layout: cleared editor tabs after Git changed workspace ${JSON.stringify(workspaceId)}`)
  }

  private async openDiffTab(
    workspaceId: string,
    descriptor: Pick<WorkbenchDiffTab, 'id' | 'path' | 'diffKind' | 'revision'>,
    load: () => Promise<GitFileDiff>,
    logLabel: string,
  ): Promise<void> {
    this.setWorkspace(workspaceId)
    const current = this.store.getSnapshot()
    const existing = current.tabs.find(tab => tab.id === descriptor.id)
    this.store.update((state) => {
      state.activeTabId = descriptor.id
      if (existing === undefined) state.tabs.push(emptyDiffTab(descriptor))
    })
    if (existing?.kind === 'diff' && existing.diff !== null) {
      this.logger.info(`workbench-layout: selected open ${logLabel} tab`)
      return
    }
    if (existing?.loading === true) return

    const requestKey = tabRequestKey(workspaceId, descriptor.id)
    const requestId = ++this.requestId
    this.diffRequests.set(requestKey, requestId)
    this.updateDiffTabState(workspaceId, descriptor.id, (tab) => {
      tab.loading = true
      tab.error = null
    })
    try {
      const diff = await load()
      if (this.diffRequests.get(requestKey) !== requestId) return
      this.updateDiffTabState(workspaceId, descriptor.id, (tab) => {
        tab.diff = diff
        tab.loading = false
        tab.error = null
      })
      this.logger.info(`workbench-layout: opened ${logLabel} tab`)
    } catch (error: unknown) {
      if (this.diffRequests.get(requestKey) !== requestId) return
      this.updateDiffTabState(workspaceId, descriptor.id, (tab) => {
        tab.loading = false
        tab.error = messageOf(error)
      })
      this.logger.warn(`workbench-layout: failed to open ${logLabel} tab`)
    }
  }

  /** Apply an async result only to the Workspace that started the operation. */
  private updateWorkspaceState(workspaceId: string, update: (state: WorkbenchState) => void): void {
    if (this.store.getSnapshot().workspaceId === workspaceId) {
      this.store.update(update)
      return
    }
    const cached = this.workspaceStates.get(workspaceId)
    if (cached === undefined) return
    const next = cloneState(cached)
    update(next)
    this.workspaceStates.set(workspaceId, next)
  }

  private updateFileTabState(workspaceId: string, tabId: string, update: (tab: WorkbenchFileTab) => void): void {
    this.updateWorkspaceState(workspaceId, (state) => {
      const tab = state.tabs.find(candidate => candidate.id === tabId)
      if (tab?.kind === 'file') update(tab)
    })
  }

  private updateDiffTabState(workspaceId: string, tabId: string, update: (tab: WorkbenchDiffTab) => void): void {
    this.updateWorkspaceState(workspaceId, (state) => {
      const tab = state.tabs.find(candidate => candidate.id === tabId)
      if (tab?.kind === 'diff') update(tab)
    })
  }
}

function emptyFileTab(path: string): WorkbenchFileTab {
  return {
    id: fileTabId(path),
    kind: 'file',
    path,
    file: null,
    draft: '',
    dirty: false,
    preview: false,
    loading: true,
    saving: false,
    error: null,
  }
}

function emptyDiffTab(
  descriptor: Pick<WorkbenchDiffTab, 'id' | 'path' | 'diffKind' | 'revision'>,
): WorkbenchDiffTab {
  return {
    ...descriptor,
    kind: 'diff',
    diff: null,
    loading: true,
    error: null,
  }
}

function cloneState(state: WorkbenchState): WorkbenchState {
  return {
    ...state,
    tabs: state.tabs.map(tab => tab.kind === 'file'
      ? { ...tab, file: tab.file === null ? null : { ...tab.file } }
      : { ...tab, diff: tab.diff === null ? null : { ...tab.diff } }),
  }
}

function fileTabId(path: string): string {
  return `file:${path}`
}

function diffTabId(kind: GitFileDiff['kind'], path: string, revision = ''): string {
  return `diff:${kind}:${revision}:${path}`
}

function tabRequestKey(workspaceId: string | undefined, tabId: string): string {
  return `${workspaceId ?? ''}\0${tabId}`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
