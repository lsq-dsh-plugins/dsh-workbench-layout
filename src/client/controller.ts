/** Shared browser state joining the root-scoped sidebar and Session-scoped editor. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitCommit, GitFileDiff, WorkspaceFile } from '../contracts.ts'
import { WorkbenchApi } from './api.ts'

export type SidebarMode = 'sessions' | 'files' | 'git'
export type CenterMode = 'file' | 'diff'
export type DiffViewMode = 'split' | 'inline'

export interface WorkbenchState {
  sidebarMode: SidebarMode
  workspaceId?: string
  file: WorkspaceFile | null
  draft: string
  dirty: boolean
  preview: boolean
  centerMode: CenterMode
  diff: GitFileDiff | null
  diffViewMode: DiffViewMode
  loading: boolean
  saving: boolean
  error: string | null
}

const INITIAL_STATE: WorkbenchState = {
  sidebarMode: 'files',
  file: null,
  draft: '',
  dirty: false,
  preview: false,
  centerMode: 'file',
  diff: null,
  diffViewMode: 'split',
  loading: false,
  saving: false,
  error: null,
}

export const UNSAVED_SWITCH_ERROR = 'workbench:unsaved-switch'

export interface WorkbenchLogger {
  info(message: string): void
  warn(message: string): void
}

/** Own async races, dirty state, and the sidebar shadow's activation. */
export class WorkbenchController {
  readonly store: SnapshotStore<WorkbenchState> = createSnapshotStore(INITIAL_STATE)
  readonly api: WorkbenchApi

  private requestId = 0
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
    if (state.workspaceId !== undefined) {
      this.workspaceStates.set(state.workspaceId, {
        ...state,
        loading: false,
        saving: false,
        error: null,
      })
    }
    this.requestId += 1
    if (workspaceId === undefined) {
      this.store.set({ ...INITIAL_STATE, sidebarMode: state.sidebarMode })
      return
    }
    const restored = this.workspaceStates.get(workspaceId)
    this.store.set(restored === undefined
      ? { ...INITIAL_STATE, sidebarMode: state.sidebarMode, workspaceId }
      : { ...restored, sidebarMode: state.sidebarMode, workspaceId, loading: false, saving: false, error: null })
    this.logger.info(`workbench-layout: activated workspace ${JSON.stringify(workspaceId)}`)
  }

  async openFile(workspaceId: string, path: string): Promise<void> {
    this.setWorkspace(workspaceId)
    const current = this.store.getSnapshot()
    if (current.dirty && current.file?.path !== path) {
      this.store.update((state) => { state.error = UNSAVED_SWITCH_ERROR })
      return
    }
    const requestId = ++this.requestId
    this.store.update((state) => {
      state.loading = true
      state.error = null
      state.centerMode = 'file'
    })
    try {
      const file = await this.api.readFile(workspaceId, path)
      if (requestId !== this.requestId) return
      this.store.update((state) => {
        state.file = file
        state.draft = file.content
        state.dirty = false
        state.preview = file.markdown
        state.diff = null
        state.centerMode = 'file'
        state.loading = false
      })
      this.logger.info(`workbench-layout: opened workspace file ${JSON.stringify(path)}`)
    } catch (error: unknown) {
      if (requestId !== this.requestId) return
      this.store.update((state) => {
        state.loading = false
        state.error = messageOf(error)
      })
      this.logger.warn(`workbench-layout: failed to open workspace file ${JSON.stringify(path)}`)
    }
  }

  setDraft(value: string): void {
    this.store.update((state) => {
      state.draft = value
      state.dirty = state.file !== null && value !== state.file.content
      state.error = null
    })
  }

  revert(): void {
    this.store.update((state) => {
      if (state.file === null) return
      state.draft = state.file.content
      state.dirty = false
      state.error = null
    })
  }

  setPreview(preview: boolean): void {
    this.store.update((state) => { state.preview = preview })
  }

  async save(): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.file === null || current.workspaceId === undefined || current.saving || !current.dirty) return
    const workspaceId = current.workspaceId
    const filePath = current.file.path
    const savedContent = current.draft
    this.store.update((state) => { state.saving = true; state.error = null })
    try {
      const saved = await this.api.saveFile(workspaceId, filePath, savedContent, current.file.version)
      this.updateWorkspaceState(workspaceId, (state) => {
        if (state.file === null || state.file.path !== filePath) return
        state.file = { ...state.file, content: savedContent, version: saved.version, size: saved.size }
        state.dirty = state.draft !== savedContent
        state.saving = false
      })
    } catch (error: unknown) {
      this.updateWorkspaceState(workspaceId, (state) => {
        state.saving = false
        state.error = messageOf(error)
      })
      this.logger.warn('workbench-layout: workspace file save failed')
    }
  }

  async openDiff(workspaceId: string, path: string, staged: boolean): Promise<void> {
    this.setWorkspace(workspaceId)
    const requestId = ++this.requestId
    this.store.update((state) => {
      state.loading = true
      state.error = null
      state.diff = null
      state.centerMode = 'diff'
    })
    try {
      const diff = await this.api.gitDiff(workspaceId, path, staged)
      if (requestId !== this.requestId) return
      this.store.update((state) => {
        state.diff = diff
        state.centerMode = 'diff'
        state.loading = false
      })
      this.logger.info(`workbench-layout: rendered single-file Git diff ${JSON.stringify(path)}`)
    } catch (error: unknown) {
      if (requestId !== this.requestId) return
      this.store.update((state) => { state.loading = false; state.error = messageOf(error) })
      this.logger.warn(`workbench-layout: failed to load Git diff ${JSON.stringify(path)}`)
    }
  }

  async openCommitDiff(workspaceId: string, commit: GitCommit, path: string): Promise<void> {
    this.setWorkspace(workspaceId)
    const requestId = ++this.requestId
    this.store.update((state) => {
      state.loading = true
      state.error = null
      state.diff = null
      state.centerMode = 'diff'
    })
    try {
      const diff = await this.api.gitCommitFileDiff(workspaceId, commit.hash, path)
      if (requestId !== this.requestId) return
      this.store.update((state) => {
        state.diff = diff
        state.centerMode = 'diff'
        state.loading = false
      })
      this.logger.info(`workbench-layout: rendered Git commit file diff ${commit.shortHash} ${JSON.stringify(path)}`)
    } catch (error: unknown) {
      if (requestId !== this.requestId) return
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

  /** 分支切换或拉取后清空指定工作区中可能已失效的文件快照。 */
  resetWorkspaceView(workspaceId = this.store.getSnapshot().workspaceId): void {
    if (workspaceId === undefined) return
    if (this.store.getSnapshot().workspaceId === workspaceId) this.requestId += 1
    this.updateWorkspaceState(workspaceId, (state) => {
      state.file = null
      state.draft = ''
      state.dirty = false
      state.preview = false
      state.diff = null
      state.centerMode = 'file'
      state.loading = false
      state.saving = false
      state.error = null
    })
    this.logger.info(`workbench-layout: cleared editor after Git changed workspace ${JSON.stringify(workspaceId)}`)
  }

  /** Apply an async result only to the Workspace that started the operation. */
  private updateWorkspaceState(workspaceId: string, update: (state: WorkbenchState) => void): void {
    if (this.store.getSnapshot().workspaceId === workspaceId) {
      this.store.update(update)
      return
    }
    const cached = this.workspaceStates.get(workspaceId)
    if (cached === undefined) return
    const next = { ...cached }
    update(next)
    this.workspaceStates.set(workspaceId, next)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
