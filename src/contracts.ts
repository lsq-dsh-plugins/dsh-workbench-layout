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

export interface GitDiff {
  path: string
  staged: boolean
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
