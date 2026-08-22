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

export interface SavedWorkspaceFile {
  path: string
  version: string
  size: number
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
  files: GitFileStatus[]
  message?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  author: string
  authoredAt: string
}

export interface GitHistory {
  commits: GitCommit[]
  truncated: boolean
}

export type GitDiffKind = 'worktree' | 'staged' | 'commit'

export interface GitDiff {
  kind: GitDiffKind
  title: string
  subtitle?: string
  path?: string
  revision?: string
  text: string
}

export interface GitCommitResult {
  summary: string
}

export interface WorkbenchErrorBody {
  error: {
    code: string
    message: string
  }
}
