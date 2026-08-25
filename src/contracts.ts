/** JSON vocabulary shared by the workbench Host and browser halves. */

export const WORKBENCH_API_PREFIX = '/dsh-workbench-layout'

export type WorkspaceEntryKind = 'file' | 'directory' | 'symlink' | 'other'

export interface WorkspaceEntry {
  name: string
  path: string
  kind: WorkspaceEntryKind
  size?: number
}

export interface DirectoryListing {
  path: string
  entries: WorkspaceEntry[]
  truncated: boolean
}

export interface WorkspaceFile {
  path: string
  content: string
  version: string
  size: number
  markdown: boolean
}

export interface WorkspaceFileObservation {
  path: string
  version: string
}

export type WorkspaceFileRefresh =
  | { path: string; status: 'unchanged' }
  | { path: string; status: 'changed'; file: WorkspaceFile }
  | { path: string; status: 'deleted' }

export interface WorkspaceFilesRefresh {
  files: WorkspaceFileRefresh[]
}

export interface SavedWorkspaceFile {
  path: string
  version: string
  size: number
}

export interface CreatedWorkspaceEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  size?: number
}

export interface RenamedWorkspaceEntry {
  from: string
  path: string
  name: string
  kind: 'file' | 'directory'
}

export interface DeletedWorkspaceEntry {
  path: string
  kind: 'file' | 'directory'
}

export interface WorkspaceAbsolutePath {
  path: string
  absolutePath: string
}

export interface WorkspaceRelativePath {
  path: string
}

export interface GitFileStatus {
  path: string
  originalPath?: string
  index: string
  worktree: string
}

export interface GitStatus {
  available: boolean
  branch?: string
  detached?: boolean
  upstream?: string
  ahead?: number
  behind?: number
  hasRemote?: boolean
  remotes?: string[]
  files: GitFileStatus[]
  message?: string
}

export type GitReferenceKind = 'head' | 'local' | 'remote' | 'tag'

export interface GitReference {
  name: string
  kind: GitReferenceKind
}

export interface GitCommitStats {
  filesChanged: number
  additions: number
  deletions: number
}

export interface GitCommit {
  hash: string
  shortHash: string
  parents: string[]
  subject: string
  author: string
  authoredAt: string
  references: GitReference[]
  stats?: GitCommitStats
}

export interface GitGraph {
  commits: GitCommit[]
  truncated: boolean
}

export type GitDiffKind = 'worktree' | 'staged' | 'commit' | 'comparison'

export interface GitCommitFile {
  path: string
  originalPath?: string
  status: string
}

export interface GitCommitFiles {
  commit: GitCommit
  parentRevision?: string
  files: GitCommitFile[]
}

export interface GitFileDiff {
  kind: GitDiffKind
  path: string
  originalPath?: string
  status: string
  revision?: string
  parentRevision?: string
  commit?: GitCommit
  original: string
  modified: string
  binary: boolean
  additions?: number
  deletions?: number
}

export interface GitCommitResult {
  summary: string
}

export type GitCommitAction = 'cherry-pick' | 'revert'

export interface GitCommitActionResult {
  operation: GitCommitAction
  summary: string
}

export type GitBranchKind = 'local' | 'remote'

export interface GitBranch {
  ref: string
  name: string
  kind: GitBranchKind
  current: boolean
  upstream?: string
}

export interface GitBranches {
  current?: string
  detached: boolean
  branches: GitBranch[]
}

export type GitRemoteOperation = 'fetch' | 'pull' | 'push' | 'sync'

export interface GitRemoteResult {
  operation: GitRemoteOperation
}

export interface GitRemote {
  name: string
  fetchUrl: string
  pushUrl: string
  separatePushUrl: boolean
}

export interface GitRemotes {
  remotes: GitRemote[]
}

export type GitTargetRemoteOperation = 'fetch' | 'pull' | 'push'

export interface GitTargetRemoteResult {
  operation: GitTargetRemoteOperation
  remote: string
  branch?: string
}

export interface WorkbenchErrorBody {
  error: {
    code: string
    message: string
  }
}
