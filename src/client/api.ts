/** Same-origin browser client for the workbench Host route. */

import type {
  CreatedWorkspaceEntry,
  DeletedWorkspaceEntry,
  DirectoryListing,
  GitBranches,
  GitCommitFiles,
  GitCommitAction,
  GitCommitActionResult,
  GitCommitResult,
  GitFileDiff,
  GitGraph,
  GitRemoteOperation,
  GitRemote,
  GitRemoteResult,
  GitRemotes,
  GitStatus,
  GitTargetRemoteOperation,
  GitTargetRemoteResult,
  SavedWorkspaceFile,
  RenamedWorkspaceEntry,
  WorkbenchErrorBody,
  WorkspaceFile,
  WorkspaceFileObservation,
  WorkspaceFilesRefresh,
  WorkspaceAbsolutePath,
  WorkspaceRelativePath,
} from '../contracts.ts'
import { WORKBENCH_API_PREFIX } from '../contracts.ts'

export class WorkbenchApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'WorkbenchApiError'
  }
}

/** Typed fetch facade; all mutations stay explicit methods. */
export class WorkbenchApi {
  async listDirectory(workspaceId: string, path: string): Promise<DirectoryListing> {
    return this.post('/tree', { workspaceId, path })
  }

  async readFile(workspaceId: string, path: string): Promise<WorkspaceFile> {
    return this.post('/file/read', { workspaceId, path })
  }

  async refreshFiles(workspaceId: string, files: WorkspaceFileObservation[]): Promise<WorkspaceFilesRefresh> {
    return this.post('/files/refresh', { workspaceId, files })
  }

  async saveFile(workspaceId: string, path: string, content: string, version: string): Promise<SavedWorkspaceFile> {
    return this.post('/file/save', { workspaceId, path, content, version })
  }

  async createFile(workspaceId: string, path: string): Promise<CreatedWorkspaceEntry> {
    return this.post('/file/create', { workspaceId, path })
  }

  async createDirectory(workspaceId: string, path: string): Promise<CreatedWorkspaceEntry> {
    return this.post('/directory/create', { workspaceId, path })
  }

  async renameEntry(workspaceId: string, path: string, name: string): Promise<RenamedWorkspaceEntry> {
    return this.post('/entry/rename', { workspaceId, path, name })
  }

  async deleteEntry(workspaceId: string, path: string): Promise<DeletedWorkspaceEntry> {
    return this.post('/entry/delete', { workspaceId, path })
  }

  async absolutePath(workspaceId: string, path: string): Promise<WorkspaceAbsolutePath> {
    return this.post('/path/absolute', { workspaceId, path })
  }

  async relativePath(workspaceId: string, path: string): Promise<WorkspaceRelativePath> {
    return this.post('/path/relative', { workspaceId, path })
  }

  async gitStatus(workspaceId: string): Promise<GitStatus> {
    return this.post('/git/status', { workspaceId })
  }

  async gitDiff(workspaceId: string, path: string, staged: boolean): Promise<GitFileDiff> {
    return this.post('/git/diff', { workspaceId, path, staged })
  }

  async gitGraph(workspaceId: string): Promise<GitGraph> {
    return this.post('/git/graph', { workspaceId })
  }

  async gitBranches(workspaceId: string): Promise<GitBranches> {
    return this.post('/git/branches', { workspaceId })
  }

  async gitSwitchBranch(workspaceId: string, ref: string): Promise<GitStatus> {
    return this.post('/git/branch/switch', { workspaceId, ref })
  }

  async gitCreateBranch(workspaceId: string, name: string, source?: string): Promise<GitStatus> {
    return this.post('/git/branch/create', { workspaceId, name, source })
  }

  async gitRenameBranch(workspaceId: string, name: string): Promise<GitStatus> {
    return this.post('/git/branch/rename', { workspaceId, name })
  }

  async gitDeleteBranch(workspaceId: string, ref: string): Promise<GitStatus> {
    return this.post('/git/branch/delete', { workspaceId, ref })
  }

  async gitRemoteOperation(workspaceId: string, operation: GitRemoteOperation): Promise<GitRemoteResult> {
    return this.post('/git/remote', { workspaceId, operation })
  }

  async gitRemotes(workspaceId: string): Promise<GitRemotes> {
    return this.post('/git/remotes', { workspaceId })
  }

  async gitAddRemote(workspaceId: string, remote: Omit<GitRemote, 'separatePushUrl'>): Promise<GitRemotes> {
    return this.post('/git/remote/add', { workspaceId, ...remote })
  }

  async gitUpdateRemote(workspaceId: string, currentName: string, remote: Omit<GitRemote, 'separatePushUrl'>): Promise<GitRemotes> {
    return this.post('/git/remote/update', { workspaceId, currentName, ...remote })
  }

  async gitDeleteRemote(workspaceId: string, name: string): Promise<GitRemotes> {
    return this.post('/git/remote/delete', { workspaceId, name })
  }

  async gitTargetRemoteOperation(
    workspaceId: string,
    operation: GitTargetRemoteOperation,
    remote: string,
    branch?: string,
  ): Promise<GitTargetRemoteResult> {
    return this.post('/git/remote/target', { workspaceId, operation, remote, branch })
  }

  async gitCommitFiles(workspaceId: string, revision: string): Promise<GitCommitFiles> {
    return this.post('/git/commit/files', { workspaceId, revision })
  }

  async gitCommitFileDiff(workspaceId: string, revision: string, path: string): Promise<GitFileDiff> {
    return this.post('/git/commit/file', { workspaceId, revision, path })
  }

  async gitComparisonFiles(workspaceId: string, revision: string): Promise<GitCommitFiles> {
    return this.post('/git/comparison/files', { workspaceId, revision })
  }

  async gitComparisonFileDiff(workspaceId: string, revision: string, path: string): Promise<GitFileDiff> {
    return this.post('/git/comparison/file', { workspaceId, revision, path })
  }

  async gitCommitAction(workspaceId: string, operation: GitCommitAction, revision: string): Promise<GitCommitActionResult> {
    return this.post('/git/commit/action', { workspaceId, operation, revision })
  }

  async gitStage(workspaceId: string, path: string): Promise<GitStatus> {
    return this.post('/git/stage', { workspaceId, path })
  }

  async gitStageAll(workspaceId: string): Promise<GitStatus> {
    return this.post('/git/stage-all', { workspaceId })
  }

  async gitUnstage(workspaceId: string, path: string): Promise<GitStatus> {
    return this.post('/git/unstage', { workspaceId, path })
  }

  async gitUnstageAll(workspaceId: string): Promise<GitStatus> {
    return this.post('/git/unstage-all', { workspaceId })
  }

  async gitDiscard(workspaceId: string, path: string): Promise<GitStatus> {
    return this.post('/git/discard', { workspaceId, path })
  }

  async gitDiscardAll(workspaceId: string): Promise<GitStatus> {
    return this.post('/git/discard-all', { workspaceId })
  }

  async gitCommit(workspaceId: string, message: string): Promise<GitCommitResult> {
    return this.post('/git/commit', { workspaceId, message })
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${WORKBENCH_API_PREFIX}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const value: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const error = value as WorkbenchErrorBody | undefined
      throw new WorkbenchApiError(
        error?.error.code ?? `HTTP_${response.status}`,
        error?.error.message ?? `Workbench request failed with HTTP ${response.status}`,
      )
    }
    return value as T
  }
}
