/** Host-side workspace operations over DSH's filesystem service. */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  DirectoryListing,
  SavedWorkspaceFile,
  WorkspaceEntry,
  WorkspaceFile,
} from './contracts.ts'
import { WorkbenchHttpError } from './http.ts'
import { childWorkspacePath, normalizeWorkspacePath, WorkbenchInputError } from './path-policy.ts'

export interface WorkspaceLimits {
  maxFileBytes: number
  maxDirectoryEntries: number
}

interface WorkspaceTarget {
  cwd: string
  root: FsTarget
  target: FsTarget
  path: string
  sessionId: SessionId
}

/** Read and atomically update files under the current Session's workspace root. */
export class WorkspaceBackend {
  constructor(
    private readonly ctx: Context,
    private readonly limits: WorkspaceLimits,
  ) {}

  async list(sessionIdValue: unknown, pathValue: unknown): Promise<DirectoryListing> {
    const workspace = await this.resolve(sessionIdValue, pathValue)
    await this.requireType(workspace, 'directory')
    const source = await this.ctx.fs.listDir(workspace.target)
    const entries: WorkspaceEntry[] = []
    let skippedUnsafe = false
    for (const entry of source) {
      if (entries.length >= this.limits.maxDirectoryEntries) break
      let path: string
      try {
        path = childWorkspacePath(workspace.path, entry.name)
      } catch (error) {
        if (!(error instanceof WorkbenchInputError)) throw error
        skippedUnsafe = true
        continue
      }
      const link = await this.ctx.fs.lstat(path, { cwd: workspace.cwd })
      entries.push({
        name: entry.name,
        path,
        kind: link?.type ?? entry.type,
        ...(entry.size === undefined ? {} : { size: entry.size }),
      })
    }
    entries.sort((left, right) => {
      const leftDirectory = left.kind === 'directory' ? 0 : 1
      const rightDirectory = right.kind === 'directory' ? 0 : 1
      return leftDirectory - rightDirectory || left.name.localeCompare(right.name)
    })
    return {
      path: workspace.path,
      entries,
      truncated: skippedUnsafe || source.length > this.limits.maxDirectoryEntries,
    }
  }

  async read(sessionIdValue: unknown, pathValue: unknown): Promise<WorkspaceFile> {
    const workspace = await this.resolve(sessionIdValue, pathValue)
    if (workspace.path === '') throw new WorkbenchHttpError(400, 'FILE_REQUIRED', '请选择文件。')
    const info = await this.requireType(workspace, 'file')
    if (info.size !== undefined && info.size > this.limits.maxFileBytes) {
      throw new WorkbenchHttpError(413, 'FS_TOO_LARGE', '文件超过工作台允许的大小。')
    }
    const content = await this.ctx.fs.readText(workspace.target)
    const size = new TextEncoder().encode(content).byteLength
    if (size > this.limits.maxFileBytes) {
      throw new WorkbenchHttpError(413, 'FS_TOO_LARGE', '文件超过工作台允许的大小。')
    }
    return {
      path: workspace.path,
      content,
      version: info.version,
      size,
      markdown: /\.(?:md|markdown)$/iu.test(workspace.path),
    }
  }

  async save(
    sessionIdValue: unknown,
    pathValue: unknown,
    contentValue: unknown,
    versionValue: unknown,
  ): Promise<SavedWorkspaceFile> {
    if (typeof contentValue !== 'string') {
      throw new WorkbenchHttpError(400, 'CONTENT_REQUIRED', '文件内容必须是字符串。')
    }
    if (typeof versionValue !== 'string' || versionValue === '') {
      throw new WorkbenchHttpError(400, 'VERSION_REQUIRED', '缺少文件版本，请重新加载。')
    }
    const size = new TextEncoder().encode(contentValue).byteLength
    if (size > this.limits.maxFileBytes) {
      throw new WorkbenchHttpError(413, 'FS_TOO_LARGE', '文件超过工作台允许的大小。')
    }
    const workspace = await this.resolve(sessionIdValue, pathValue)
    if (workspace.path === '') throw new WorkbenchHttpError(400, 'FILE_REQUIRED', '请选择文件。')
    await this.requireType(workspace, 'file')
    const outcome = await this.ctx.fs.writeText(
      workspace.target,
      contentValue,
      { kind: 'replaceIfVersion', version: versionValue as FsVersion },
      undefined,
      { mode: 'workspace-write', workspaceRoot: workspace.cwd, sessionId: workspace.sessionId },
    )
    this.ctx.logger.info(`workbench-layout: saved workspace file ${JSON.stringify(workspace.path)}`)
    return { path: workspace.path, version: outcome.version, size }
  }

  async rootProcessPath(sessionIdValue: unknown): Promise<{ cwd: string; sessionId: SessionId }> {
    const workspace = await this.resolve(sessionIdValue, '')
    await this.requireType(workspace, 'directory')
    return { cwd: this.ctx.fs.processPath(workspace.root), sessionId: workspace.sessionId }
  }

  async assertGitPath(sessionIdValue: unknown, pathValue: unknown): Promise<string> {
    const workspace = await this.resolve(sessionIdValue, pathValue, false)
    if (workspace.path === '') throw new WorkbenchHttpError(400, 'FILE_REQUIRED', '请选择 Git 文件。')
    return workspace.path
  }

  private async resolve(sessionIdValue: unknown, pathValue: unknown, requireExisting = true): Promise<WorkspaceTarget> {
    if (typeof sessionIdValue !== 'string' || sessionIdValue === '') {
      throw new WorkbenchHttpError(400, 'SESSION_REQUIRED', '缺少当前会话。')
    }
    const sessionId = sessionIdValue as SessionId
    const session = this.ctx.sessions.get(sessionId)
    if (session === undefined) throw new WorkbenchHttpError(404, 'SESSION_NOT_FOUND', '当前会话不存在。')
    const cwd = session.header.cwd
    if (cwd === undefined) throw new WorkbenchHttpError(409, 'WORKSPACE_UNAVAILABLE', '当前会话没有工作区。')
    const path = normalizeWorkspacePath(pathValue)
    const root = await this.ctx.fs.resolve(cwd)
    const target = path === '' ? root : await this.ctx.fs.resolve(path, { cwd })
    if (!this.ctx.fs.contains(root, target)) {
      throw new WorkbenchHttpError(403, 'WORKSPACE_ESCAPE', '不能访问工作区外的路径。')
    }
    if (path !== '') {
      const link = await this.ctx.fs.lstat(path, { cwd })
      if (link?.type === 'symlink') {
        throw new WorkbenchHttpError(403, 'SYMLINK_UNSUPPORTED', '工作台不打开符号链接。')
      }
      if (requireExisting && link === undefined) {
        throw new WorkbenchHttpError(404, 'FS_NOT_FOUND', '文件或目录不存在。')
      }
    }
    return { cwd, root, target, path, sessionId }
  }

  private async requireType(workspace: WorkspaceTarget, expected: 'file' | 'directory') {
    const info = await this.ctx.fs.stat(workspace.target)
    if (info === undefined) throw new WorkbenchHttpError(404, 'FS_NOT_FOUND', '文件或目录不存在。')
    if (info.type !== expected) {
      throw new WorkbenchHttpError(400, expected === 'file' ? 'FS_NOT_REGULAR_FILE' : 'FS_NOT_DIRECTORY',
        expected === 'file' ? '所选项目不是普通文件。' : '所选项目不是目录。')
    }
    return info
  }
}
