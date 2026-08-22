/** Same-origin browser client for the workbench Host route. */

import type {
  DirectoryListing,
  GitCommitResult,
  GitDiff,
  GitStatus,
  SavedWorkspaceFile,
  WorkbenchErrorBody,
  WorkspaceFile,
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
  async listDirectory(sessionId: string, path: string): Promise<DirectoryListing> {
    return this.post('/tree', { sessionId, path })
  }

  async readFile(sessionId: string, path: string): Promise<WorkspaceFile> {
    return this.post('/file/read', { sessionId, path })
  }

  async saveFile(sessionId: string, path: string, content: string, version: string): Promise<SavedWorkspaceFile> {
    return this.post('/file/save', { sessionId, path, content, version })
  }

  async gitStatus(sessionId: string): Promise<GitStatus> {
    return this.post('/git/status', { sessionId })
  }

  async gitDiff(sessionId: string, path: string, staged: boolean): Promise<GitDiff> {
    return this.post('/git/diff', { sessionId, path, staged })
  }

  async gitStage(sessionId: string, path: string): Promise<GitStatus> {
    return this.post('/git/stage', { sessionId, path })
  }

  async gitUnstage(sessionId: string, path: string): Promise<GitStatus> {
    return this.post('/git/unstage', { sessionId, path })
  }

  async gitCommit(sessionId: string, message: string): Promise<GitCommitResult> {
    return this.post('/git/commit', { sessionId, message })
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
