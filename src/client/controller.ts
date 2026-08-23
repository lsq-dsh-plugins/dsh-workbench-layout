/** Shared browser state joining the root-scoped sidebar and Session-scoped editor. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { GitCommit, GitFileDiff, WorkspaceFile } from '../contracts.ts'
import { WorkbenchApi } from './api.ts'
import type { GitFileLayout } from './git-tree.ts'

export type SidebarMode = 'sessions' | 'files' | 'git' | 'terminal'
export type DiffViewMode = 'split' | 'inline'
export type GitView = 'changes' | 'graph'
export type TerminalStatus = 'connecting' | 'running' | 'exited' | 'error'
export type WorkbenchSidebarAction =
  | 'files.newFile'
  | 'files.newDirectory'

export interface WorkbenchSidebarActionRequest {
  id: number
  action: WorkbenchSidebarAction
  workspaceId: string
}

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

export interface WorkbenchTerminalTab {
  id: string
  kind: 'terminal'
  sequence: number
  generation: number
  status: TerminalStatus
  shell?: string
  exitCode?: number
  signal?: number
  error: string | null
}

export type WorkbenchTab = WorkbenchFileTab | WorkbenchDiffTab | WorkbenchTerminalTab

export interface WorkbenchState {
  sidebarMode: SidebarMode
  editorExpanded: boolean
  workspaceId?: string
  tabs: WorkbenchTab[]
  activeTabId?: string
  diffViewMode: DiffViewMode
  gitView: GitView
  gitChangeLayout: GitFileLayout
  gitGraphFileLayout: GitFileLayout
  sidebarAction?: WorkbenchSidebarActionRequest
}

const INITIAL_STATE: WorkbenchState = {
  sidebarMode: 'files',
  editorExpanded: true,
  tabs: [],
  diffViewMode: 'split',
  gitView: 'changes',
  gitChangeLayout: 'list',
  gitGraphFileLayout: 'list',
}

export interface WorkbenchLogger {
  info(message: string): void
  warn(message: string): void
}

export interface WorkbenchEditorLayout {
  openDetails(): void
  closeDetails(): void
}

/** Own unified tabs, editor visibility, async races, dirty state, and the sidebar shadow. */
export class WorkbenchController {
  readonly store: SnapshotStore<WorkbenchState> = createSnapshotStore(INITIAL_STATE)
  readonly api: WorkbenchApi

  private requestId = 0
  private sidebarActionId = 0
  private readonly fileRequests = new Map<string, number>()
  private readonly diffRequests = new Map<string, number>()
  private terminalId = 0
  private setSidebarShadow: ((active: boolean) => void) | undefined
  private readonly workspaceStates = new Map<string, WorkbenchState>()

  constructor(
    api: WorkbenchApi = new WorkbenchApi(),
    private readonly logger: WorkbenchLogger = console,
    private readonly editorLayout?: WorkbenchEditorLayout,
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
    const state = this.store.getSnapshot()
    if (mode === 'terminal' && state.workspaceId !== undefined
      && !state.tabs.some(tab => tab.kind === 'terminal')) {
      this.openTerminal(state.workspaceId)
    }
  }

  setGitView(view: GitView): void {
    if (this.store.getSnapshot().gitView === view) return
    this.store.update((state) => { state.gitView = view })
    this.logger.info(`workbench-layout: Git main view changed to ${view}`)
  }

  toggleGitView(): void {
    this.setGitView(this.store.getSnapshot().gitView === 'changes' ? 'graph' : 'changes')
  }

  setGitFileLayout(view: GitView, layout: GitFileLayout): void {
    const key = view === 'changes' ? 'gitChangeLayout' : 'gitGraphFileLayout'
    if (this.store.getSnapshot()[key] === layout) return
    this.store.update((state) => { state[key] = layout })
    this.logger.info(`workbench-layout: Git ${view} file layout changed to ${layout}`)
  }

  requestSidebarAction(
    action: WorkbenchSidebarAction,
    workspaceId = this.store.getSnapshot().workspaceId,
  ): number | undefined {
    if (workspaceId === undefined) return undefined
    const id = ++this.sidebarActionId
    this.store.update((state) => { state.sidebarAction = { id, action, workspaceId } })
    this.logger.info(`workbench-layout: queued collapsed sidebar action ${action} for ${JSON.stringify(workspaceId)}`)
    return id
  }

  consumeSidebarAction(id: number): void {
    const request = this.store.getSnapshot().sidebarAction
    if (request?.id !== id) return
    this.store.update((state) => { delete state.sidebarAction })
    this.logger.info(`workbench-layout: consumed collapsed sidebar action ${request.action}`)
  }

  setWorkspace(workspaceId: string | undefined): void {
    const state = this.store.getSnapshot()
    if (state.workspaceId === workspaceId) return
    if (state.workspaceId !== undefined) this.workspaceStates.set(state.workspaceId, stripWorkspaceEphemera(state))
    if (workspaceId === undefined) {
      this.store.set({
        ...INITIAL_STATE,
        sidebarMode: state.sidebarMode,
        editorExpanded: state.editorExpanded,
      })
      return
    }
    const restored = this.workspaceStates.get(workspaceId)
    this.store.set(restored === undefined
      ? { ...INITIAL_STATE, sidebarMode: state.sidebarMode, editorExpanded: state.editorExpanded, workspaceId }
      : { ...cloneState(restored), sidebarMode: state.sidebarMode, editorExpanded: state.editorExpanded, workspaceId })
    this.logger.info(`workbench-layout: activated workspace ${JSON.stringify(workspaceId)}`)
  }

  /** Reapply the remembered middle-column state after AppFrame or Session remounts. */
  synchronizeEditorLayout(): void {
    if (this.store.getSnapshot().editorExpanded) this.editorLayout?.openDetails()
    else this.editorLayout?.closeDetails()
  }

  toggleEditor(): void {
    this.setEditorExpanded(!this.store.getSnapshot().editorExpanded, 'sidebar control')
  }

  /** Reveal content selected from the sidebar without coupling panels to individual views. */
  revealEditor(): void {
    this.setEditorExpanded(true, 'content selection')
  }

  async openFile(workspaceId: string, path: string): Promise<void> {
    this.setWorkspace(workspaceId)
    this.revealEditor()
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
    if (existing?.kind === 'file' && existing.loading) return

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

  openTerminal(workspaceId = this.store.getSnapshot().workspaceId): string | undefined {
    if (workspaceId === undefined) return undefined
    this.setWorkspace(workspaceId)
    this.revealEditor()
    const state = this.store.getSnapshot()
    const sequence = state.tabs.reduce((highest, tab) => tab.kind === 'terminal'
      ? Math.max(highest, tab.sequence)
      : highest, 0) + 1
    const id = `terminal:${++this.terminalId}`
    this.store.update((draft) => {
      draft.tabs.push({ id, kind: 'terminal', sequence, generation: 0, status: 'connecting', error: null })
      draft.activeTabId = id
    })
    this.logger.info(`workbench-layout: opened workspace terminal ${sequence} in ${JSON.stringify(workspaceId)}`)
    return id
  }

  restartTerminal(tabId: string): void {
    const workspaceId = this.store.getSnapshot().workspaceId
    if (workspaceId === undefined) return
    this.updateTerminalTabState(workspaceId, tabId, (tab) => {
      tab.generation += 1
      tab.status = 'connecting'
      tab.error = null
      delete tab.shell
      delete tab.exitCode
      delete tab.signal
    })
    this.logger.info(`workbench-layout: restarted workspace terminal ${JSON.stringify(tabId)}`)
  }

  terminalReady(tabId: string, shell: string): void {
    this.updateCurrentTerminal(tabId, (tab) => {
      tab.status = 'running'
      tab.shell = shell
      tab.error = null
    })
    this.logger.info(`workbench-layout: workspace terminal ${JSON.stringify(tabId)} is ready`)
  }

  terminalExited(tabId: string, exitCode: number, signal?: number): void {
    this.updateCurrentTerminal(tabId, (tab) => {
      tab.status = 'exited'
      tab.exitCode = exitCode
      if (signal === undefined) delete tab.signal
      else tab.signal = signal
      tab.error = null
    })
    this.logger.info(`workbench-layout: workspace terminal ${JSON.stringify(tabId)} exited with code ${exitCode}`)
  }

  terminalFailed(tabId: string, message: string): void {
    this.updateCurrentTerminal(tabId, (tab) => {
      tab.status = 'error'
      tab.error = message
    })
    this.logger.warn(`workbench-layout: workspace terminal ${JSON.stringify(tabId)} failed`)
  }

  selectTab(tabId: string): void {
    const state = this.store.getSnapshot()
    const tab = state.tabs.find(candidate => candidate.id === tabId)
    if (tab === undefined) return
    this.revealEditor()
    this.store.update((draft) => { draft.activeTabId = tabId })
    this.logger.info(`workbench-layout: selected ${tab.kind} tab ${JSON.stringify(tabIdentity(tab))}`)
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
    this.logger.info(`workbench-layout: closed ${tab.kind} tab ${JSON.stringify(tabIdentity(tab))}`)
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

  async openComparisonDiff(workspaceId: string, commit: GitCommit, path: string): Promise<void> {
    await this.openDiffTab(
      workspaceId,
      { id: diffTabId('comparison', path, commit.hash), path, diffKind: 'comparison', revision: commit.hash },
      () => this.api.gitComparisonFileDiff(workspaceId, commit.hash, path),
      `Git workspace comparison ${commit.shortHash} ${JSON.stringify(path)}`,
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
      const retained = state.tabs.filter(tab => tab.kind !== 'diff')
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

  /** Clear file and Diff tabs after Git changes one Workspace; live terminals remain attached. */
  resetWorkspaceView(workspaceId = this.store.getSnapshot().workspaceId): void {
    if (workspaceId === undefined) return
    this.updateWorkspaceState(workspaceId, (state) => {
      const retained = state.tabs.filter(tab => tab.kind === 'terminal')
      state.tabs = retained
      if (!retained.some(tab => tab.id === state.activeTabId)) {
        const next = retained.at(-1)
        if (next === undefined) delete state.activeTabId
        else state.activeTabId = next.id
      }
    })
    this.logger.info(`workbench-layout: cleared editor tabs after Git changed workspace ${JSON.stringify(workspaceId)}`)
  }

  /** Close tabs whose backing file is one entry or a descendant of one renamed/deleted directory. */
  closeWorkspaceEntries(workspaceId: string, path: string): void {
    const removedIds: string[] = []
    this.updateWorkspaceState(workspaceId, (state) => {
      const activeIndex = state.tabs.findIndex(tab => tab.id === state.activeTabId)
      const retained = state.tabs.filter((tab) => {
        if (tab.kind === 'terminal' || !isSameOrDescendantPath(tab.path, path)) return true
        removedIds.push(tab.id)
        return false
      })
      state.tabs = retained
      if (!retained.some(tab => tab.id === state.activeTabId)) {
        const next = retained[Math.min(Math.max(0, activeIndex), retained.length - 1)]
        if (next === undefined) delete state.activeTabId
        else state.activeTabId = next.id
      }
    })
    for (const id of removedIds) {
      const key = tabRequestKey(workspaceId, id)
      this.fileRequests.delete(key)
      this.diffRequests.delete(key)
    }
    if (removedIds.length > 0) {
      this.logger.info(
        `workbench-layout: closed ${removedIds.length} tabs for changed workspace entry ${JSON.stringify(path)}`,
      )
    }
  }

  private async openDiffTab(
    workspaceId: string,
    descriptor: Pick<WorkbenchDiffTab, 'id' | 'path' | 'diffKind' | 'revision'>,
    load: () => Promise<GitFileDiff>,
    logLabel: string,
  ): Promise<void> {
    this.setWorkspace(workspaceId)
    this.revealEditor()
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
    if (existing?.kind === 'diff' && existing.loading) return

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

  private updateTerminalTabState(workspaceId: string, tabId: string, update: (tab: WorkbenchTerminalTab) => void): void {
    this.updateWorkspaceState(workspaceId, (state) => {
      const tab = state.tabs.find(candidate => candidate.id === tabId)
      if (tab?.kind === 'terminal') update(tab)
    })
  }

  private updateCurrentTerminal(tabId: string, update: (tab: WorkbenchTerminalTab) => void): void {
    const workspaceId = this.store.getSnapshot().workspaceId
    if (workspaceId !== undefined) this.updateTerminalTabState(workspaceId, tabId, update)
  }

  private setEditorExpanded(expanded: boolean, source: string): void {
    const current = this.store.getSnapshot().editorExpanded
    if (current !== expanded) {
      this.store.update((state) => { state.editorExpanded = expanded })
      this.logger.info(`workbench-layout: ${expanded ? 'expanded' : 'collapsed'} middle editor from ${source}`)
    }
    if (expanded) this.editorLayout?.openDetails()
    else this.editorLayout?.closeDetails()
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
    tabs: state.tabs.map((tab) => {
      if (tab.kind === 'file') return { ...tab, file: tab.file === null ? null : { ...tab.file } }
      if (tab.kind === 'diff') return { ...tab, diff: tab.diff === null ? null : { ...tab.diff } }
      return { ...tab }
    }),
  }
}

/** Terminal processes are page-live resources and never survive a Workspace switch. */
function stripTerminalTabs(state: WorkbenchState): WorkbenchState {
  const cloned = cloneState(state)
  cloned.tabs = cloned.tabs.filter(tab => tab.kind !== 'terminal')
  if (!cloned.tabs.some(tab => tab.id === cloned.activeTabId)) {
    const next = cloned.tabs.at(-1)
    if (next === undefined) delete cloned.activeTabId
    else cloned.activeTabId = next.id
  }
  return cloned
}

/** Rail requests and terminal processes are page-live and never enter a Workspace snapshot. */
function stripWorkspaceEphemera(state: WorkbenchState): WorkbenchState {
  const stripped = stripTerminalTabs(state)
  delete stripped.sidebarAction
  return stripped
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

function tabIdentity(tab: WorkbenchTab): string {
  return tab.kind === 'terminal' ? `terminal-${tab.sequence}` : tab.path
}

function isSameOrDescendantPath(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
