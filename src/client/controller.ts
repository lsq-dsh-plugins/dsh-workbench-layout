/** Shared browser state joining the root-scoped sidebar and Session-scoped editor. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitCommit, GitFileDiff, WorkspaceFile } from '../contracts.ts'
import { WorkbenchApi } from './api.ts'

export type SidebarMode = 'sessions' | 'files' | 'git'
export type CenterMode = 'file' | 'diff'
export type DiffViewMode = 'split' | 'inline'

export interface WorkbenchFileTab {
  path: string
  file: WorkspaceFile | null
  draft: string
  dirty: boolean
  preview: boolean
  loading: boolean
  saving: boolean
  error: string | null
}

export interface WorkbenchState {
  sidebarMode: SidebarMode
  workspaceId?: string
  tabs: WorkbenchFileTab[]
  activeFilePath?: string
  centerMode: CenterMode
  diff: GitFileDiff | null
  diffViewMode: DiffViewMode
  loading: boolean
  error: string | null
}

const INITIAL_STATE: WorkbenchState = {
  sidebarMode: 'files',
  tabs: [],
  centerMode: 'file',
  diff: null,
  diffViewMode: 'split',
  loading: false,
  error: null,
}

export interface WorkbenchLogger {
  info(message: string): void
  warn(message: string): void
}

/** Own multi-file tabs, async races, dirty state, and the sidebar shadow. */
export class WorkbenchController {
  readonly store: SnapshotStore<WorkbenchState> = createSnapshotStore(INITIAL_STATE)
  readonly api: WorkbenchApi

  private diffRequestId = 0
  private fileRequestId = 0
  private readonly fileRequests = new Map<string, number>()
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
    this.diffRequestId += 1
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
    const current = this.store.getSnapshot()
    const existing = current.tabs.find(tab => tab.path === path)
    this.store.update((state) => {
      state.activeFilePath = path
      state.centerMode = 'file'
      state.diff = null
      state.loading = false
      state.error = null
      if (existing === undefined) state.tabs.push(emptyTab(path))
    })
    if (existing !== undefined && existing.file !== null) {
      this.logger.info(`workbench-layout: selected open file tab ${JSON.stringify(path)}`)
      return
    }
    if (existing?.loading === true) return

    const requestKey = fileRequestKey(workspaceId, path)
    const requestId = ++this.fileRequestId
    this.fileRequests.set(requestKey, requestId)
    this.updateTabState(workspaceId, path, (tab) => {
      tab.loading = true
      tab.error = null
    })
    try {
      const file = await this.api.readFile(workspaceId, path)
      if (this.fileRequests.get(requestKey) !== requestId) return
      this.updateTabState(workspaceId, path, (tab) => {
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
      this.updateTabState(workspaceId, path, (tab) => {
        tab.loading = false
        tab.error = messageOf(error)
      })
      this.logger.warn(`workbench-layout: failed to open workspace file tab ${JSON.stringify(path)}`)
    }
  }

  selectFile(path: string): void {
    const state = this.store.getSnapshot()
    if (!state.tabs.some(tab => tab.path === path)) return
    this.store.update((draft) => {
      draft.activeFilePath = path
      draft.centerMode = 'file'
      draft.diff = null
      draft.loading = false
      draft.error = null
    })
    this.logger.info(`workbench-layout: selected file tab ${JSON.stringify(path)}`)
  }

  closeFile(path: string, discardDirty = false): boolean {
    const state = this.store.getSnapshot()
    const index = state.tabs.findIndex(tab => tab.path === path)
    if (index < 0 || (state.tabs[index]!.dirty && !discardDirty)) return false
    const nextPath = state.activeFilePath === path
      ? state.tabs[index + 1]?.path ?? state.tabs[index - 1]?.path
      : state.activeFilePath
    this.fileRequests.delete(fileRequestKey(state.workspaceId, path))
    this.store.update((draft) => {
      draft.tabs.splice(index, 1)
      if (nextPath === undefined) delete draft.activeFilePath
      else draft.activeFilePath = nextPath
      if (draft.tabs.length === 0) draft.centerMode = 'file'
    })
    this.logger.info(`workbench-layout: closed file tab ${JSON.stringify(path)}`)
    return true
  }

  setDraft(value: string): void {
    const path = this.store.getSnapshot().activeFilePath
    if (path === undefined) return
    this.store.update((state) => {
      const tab = state.tabs.find(candidate => candidate.path === path)
      if (tab === undefined || tab.file === null) return
      tab.draft = value
      tab.dirty = value !== tab.file.content
      tab.error = null
    })
  }

  revert(path = this.store.getSnapshot().activeFilePath): void {
    if (path === undefined) return
    this.store.update((state) => {
      const tab = state.tabs.find(candidate => candidate.path === path)
      if (tab === undefined || tab.file === null) return
      tab.draft = tab.file.content
      tab.dirty = false
      tab.error = null
    })
    this.logger.info(`workbench-layout: reverted file tab ${JSON.stringify(path)}`)
  }

  setPreview(preview: boolean): void {
    const path = this.store.getSnapshot().activeFilePath
    if (path === undefined) return
    this.store.update((state) => {
      const tab = state.tabs.find(candidate => candidate.path === path)
      if (tab !== undefined) tab.preview = preview
    })
  }

  async save(path = this.store.getSnapshot().activeFilePath): Promise<boolean> {
    const current = this.store.getSnapshot()
    const tab = current.tabs.find(candidate => candidate.path === path)
    if (tab === undefined || tab.file === null || current.workspaceId === undefined || tab.saving || !tab.dirty) {
      return tab !== undefined && !tab.dirty
    }
    const workspaceId = current.workspaceId
    const savedContent = tab.draft
    const version = tab.file.version
    this.updateTabState(workspaceId, tab.path, (draft) => {
      draft.saving = true
      draft.error = null
    })
    try {
      const saved = await this.api.saveFile(workspaceId, tab.path, savedContent, version)
      this.updateTabState(workspaceId, tab.path, (draft) => {
        if (draft.file === null) return
        draft.file = { ...draft.file, content: savedContent, version: saved.version, size: saved.size }
        draft.dirty = draft.draft !== savedContent
        draft.saving = false
        draft.error = null
      })
      this.logger.info(`workbench-layout: saved file tab ${JSON.stringify(tab.path)}`)
      return true
    } catch (error: unknown) {
      this.updateTabState(workspaceId, tab.path, (draft) => {
        draft.saving = false
        draft.error = messageOf(error)
      })
      this.logger.warn(`workbench-layout: failed to save file tab ${JSON.stringify(tab.path)}`)
      return false
    }
  }

  async openDiff(workspaceId: string, path: string, staged: boolean): Promise<void> {
    this.setWorkspace(workspaceId)
    const requestId = ++this.diffRequestId
    this.store.update((state) => {
      state.loading = true
      state.error = null
      state.diff = null
      state.centerMode = 'diff'
    })
    try {
      const diff = await this.api.gitDiff(workspaceId, path, staged)
      if (requestId !== this.diffRequestId) return
      this.store.update((state) => {
        state.diff = diff
        state.centerMode = 'diff'
        state.loading = false
      })
      this.logger.info(`workbench-layout: rendered single-file Git diff ${JSON.stringify(path)}`)
    } catch (error: unknown) {
      if (requestId !== this.diffRequestId) return
      this.store.update((state) => { state.loading = false; state.error = messageOf(error) })
      this.logger.warn(`workbench-layout: failed to load Git diff ${JSON.stringify(path)}`)
    }
  }

  async openCommitDiff(workspaceId: string, commit: GitCommit, path: string): Promise<void> {
    this.setWorkspace(workspaceId)
    const requestId = ++this.diffRequestId
    this.store.update((state) => {
      state.loading = true
      state.error = null
      state.diff = null
      state.centerMode = 'diff'
    })
    try {
      const diff = await this.api.gitCommitFileDiff(workspaceId, commit.hash, path)
      if (requestId !== this.diffRequestId) return
      this.store.update((state) => {
        state.diff = diff
        state.centerMode = 'diff'
        state.loading = false
      })
      this.logger.info(`workbench-layout: rendered Git commit file diff ${commit.shortHash} ${JSON.stringify(path)}`)
    } catch (error: unknown) {
      if (requestId !== this.diffRequestId) return
      this.store.update((state) => { state.loading = false; state.error = messageOf(error) })
      this.logger.warn(`workbench-layout: failed to load Git commit file diff ${commit.shortHash} ${JSON.stringify(path)}`)
    }
  }

  setDiffViewMode(mode: DiffViewMode): void {
    this.store.update((state) => { state.diffViewMode = mode })
    this.logger.info(`workbench-layout: Diff view mode changed to ${mode}`)
  }

  showFile(): void {
    this.store.update((state) => { state.centerMode = 'file' })
  }

  /** Clear file tabs and Diff snapshots after Git changes one Workspace. */
  resetWorkspaceView(workspaceId = this.store.getSnapshot().workspaceId): void {
    if (workspaceId === undefined) return
    if (this.store.getSnapshot().workspaceId === workspaceId) this.diffRequestId += 1
    this.updateWorkspaceState(workspaceId, (state) => {
      state.tabs = []
      delete state.activeFilePath
      state.diff = null
      state.centerMode = 'file'
      state.loading = false
      state.error = null
    })
    this.logger.info(`workbench-layout: cleared file tabs after Git changed workspace ${JSON.stringify(workspaceId)}`)
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

  private updateTabState(workspaceId: string, path: string, update: (tab: WorkbenchFileTab) => void): void {
    this.updateWorkspaceState(workspaceId, (state) => {
      const tab = state.tabs.find(candidate => candidate.path === path)
      if (tab !== undefined) update(tab)
    })
  }
}

function emptyTab(path: string): WorkbenchFileTab {
  return {
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

function cloneState(state: WorkbenchState): WorkbenchState {
  return {
    ...state,
    tabs: state.tabs.map(tab => ({
      ...tab,
      file: tab.file === null ? null : { ...tab.file },
    })),
    diff: state.diff === null ? null : { ...state.diff },
  }
}

function fileRequestKey(workspaceId: string | undefined, path: string): string {
  return `${workspaceId ?? ''}\0${path}`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
