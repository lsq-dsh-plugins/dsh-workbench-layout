/** Host-side workspace operations over DSH's filesystem service. */

import type { Context } from '@deepseek-ai/cordis'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
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

export interface WorkspaceGitText {
  text: string
  binary: boolean
}

interface WorkspaceTarget {
  workspaceId: WorkspaceId
  cwd: string
  root: FsTarget
  target: FsTarget
  path: string
}

/** Read and atomically update files under an official DSH Workspace root. */
export class WorkspaceBackend {
  constructor(
    private readonly ctx: Context,
    private readonly limits: WorkspaceLimits,
  ) {}

  async list(workspaceIdValue: unknown, pathValue: unknown): Promise<DirectoryListing> {
    const workspace = await this.resolve(workspaceIdValue, pathValue)
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

  async read(workspaceIdValue: unknown, pathValue: unknown): Promise<WorkspaceFile> {
    const workspace = await this.resolve(workspaceIdValue, pathValue)
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
    workspaceIdValue: unknown,
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
    const workspace = await this.resolve(workspaceIdValue, pathValue)
    if (workspace.path === '') throw new WorkbenchHttpError(400, 'FILE_REQUIRED', '请选择文件。')
    await this.requireType(workspace, 'file')
    const outcome = await this.ctx.fs.writeText(
      workspace.target,
      contentValue,
      { kind: 'replaceIfVersion', version: versionValue as FsVersion },
      undefined,
      { mode: 'workspace-write', workspaceRoot: workspace.cwd },
    )
    this.ctx.logger.info(
      `workbench-layout: saved workspace file ${JSON.stringify(workspace.path)} in ${JSON.stringify(workspace.workspaceId)}`,
    )
    return { path: workspace.path, version: outcome.version, size }
  }

  async rootProcessPath(workspaceIdValue: unknown): Promise<{ cwd: string; workspaceId: WorkspaceId }> {
    const workspace = await this.resolve(workspaceIdValue, '')
    await this.requireType(workspace, 'directory')
    return { cwd: this.ctx.fs.processPath(workspace.root), workspaceId: workspace.workspaceId }
  }

  async assertGitPath(workspaceIdValue: unknown, pathValue: unknown): Promise<string> {
    const workspace = await this.resolve(workspaceIdValue, pathValue, false)
    if (workspace.path === '') throw new WorkbenchHttpError(400, 'FILE_REQUIRED', '请选择 Git 文件。')
    return workspace.path
  }

  /** 安全读取工作区中的 Git 文本；二进制文件只返回类型，不传输原始字节。 */
  async readGitText(workspaceIdValue: unknown, pathValue: unknown): Promise<WorkspaceGitText> {
    const workspace = await this.resolve(workspaceIdValue, pathValue)
    if (workspace.path === '') throw new WorkbenchHttpError(400, 'FILE_REQUIRED', '请选择 Git 文件。')
    const info = await this.requireType(workspace, 'file')
    if (info.size !== undefined && info.size > this.limits.maxFileBytes) {
      throw new WorkbenchHttpError(413, 'GIT_DIFF_TOO_LARGE', '文件超过 Diff 视图允许的大小。')
    }
    try {
      const text = await this.ctx.fs.readText(workspace.target)
      const size = new TextEncoder().encode(text).byteLength
      if (size > this.limits.maxFileBytes) {
        throw new WorkbenchHttpError(413, 'GIT_DIFF_TOO_LARGE', '文件超过 Diff 视图允许的大小。')
      }
      return { text, binary: false }
    } catch (error: unknown) {
      const code = error !== null && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined
      if (code === 'FS_NOT_TEXT') return { text: '', binary: true }
      throw error
    }
  }

  private async resolve(workspaceIdValue: unknown, pathValue: unknown, requireExisting = true): Promise<WorkspaceTarget> {
    if (typeof workspaceIdValue !== 'string' || workspaceIdValue === '') {
      throw new WorkbenchHttpError(400, 'WORKSPACE_REQUIRED', '缺少当前工作区。')
    }
    const workspaceId = workspaceIdValue as WorkspaceId
    const record = this.ctx.workspaceRegistry.get(workspaceId)
    if (record === undefined) throw new WorkbenchHttpError(404, 'WORKSPACE_NOT_FOUND', '当前工作区不存在。')
    const cwd = record.path
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
    return { workspaceId, cwd, root, target, path }
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
