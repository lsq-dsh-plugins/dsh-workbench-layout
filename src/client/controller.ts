/** Shared browser state joining the root-scoped sidebar and Session-scoped editor. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitDiff, WorkspaceFile } from '../contracts.ts'
import { WorkbenchApi } from './api.ts'

export type SidebarMode = 'sessions' | 'files' | 'git'
export type CenterMode = 'file' | 'diff'

export interface WorkbenchState {
  sidebarMode: SidebarMode
  sessionId?: string
  file: WorkspaceFile | null
  draft: string
  dirty: boolean
  preview: boolean
  centerMode: CenterMode
  diff: GitDiff | null
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
  private readonly sessionStates = new Map<string, WorkbenchState>()

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

  setSession(sessionId: string): void {
    const state = this.store.getSnapshot()
    if (state.sessionId === sessionId) return
    if (state.sessionId !== undefined) {
      this.sessionStates.set(state.sessionId, {
        ...state,
        loading: false,
        saving: false,
        error: null,
      })
    }
    this.requestId += 1
    const restored = this.sessionStates.get(sessionId)
    this.store.set(restored === undefined
      ? { ...INITIAL_STATE, sidebarMode: state.sidebarMode, sessionId }
      : { ...restored, sidebarMode: state.sidebarMode, sessionId, loading: false, saving: false, error: null })
  }

  async openFile(sessionId: string, path: string): Promise<void> {
    this.setSession(sessionId)
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
      const file = await this.api.readFile(sessionId, path)
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
    if (current.file === null || current.sessionId === undefined || current.saving || !current.dirty) return
    const filePath = current.file.path
    this.store.update((state) => { state.saving = true; state.error = null })
    try {
      const saved = await this.api.saveFile(current.sessionId, filePath, current.draft, current.file.version)
      this.store.update((state) => {
        if (state.file === null || state.file.path !== filePath || state.sessionId !== current.sessionId) return
        state.file = { ...state.file, content: state.draft, version: saved.version, size: saved.size }
        state.dirty = false
        state.saving = false
      })
    } catch (error: unknown) {
      this.store.update((state) => {
        state.saving = false
        state.error = messageOf(error)
      })
      this.logger.warn('workbench-layout: workspace file save failed')
    }
  }

  async openDiff(sessionId: string, path: string, staged: boolean): Promise<void> {
    this.setSession(sessionId)
    const requestId = ++this.requestId
    this.store.update((state) => { state.loading = true; state.error = null })
    try {
      const diff = await this.api.gitDiff(sessionId, path, staged)
      if (requestId !== this.requestId) return
      this.store.update((state) => {
        state.diff = diff
        state.centerMode = 'diff'
        state.loading = false
      })
    } catch (error: unknown) {
      if (requestId !== this.requestId) return
      this.store.update((state) => { state.loading = false; state.error = messageOf(error) })
      this.logger.warn(`workbench-layout: failed to load Git diff ${JSON.stringify(path)}`)
    }
  }

  showFile(): void {
    this.store.update((state) => { state.centerMode = 'file' })
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
