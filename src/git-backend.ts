/** Explicit, argv-only Git operations for one Session workspace. */

import { execFile } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { GitCommitResult, GitDiff, GitFileStatus, GitStatus } from './contracts.ts'
import { WorkbenchHttpError } from './http.ts'
import type { WorkspaceBackend } from './workspace-backend.ts'

const execFileAsync = promisify(execFile)

export interface GitLimits {
  timeoutMs: number
  maxOutputBytes: number
}

interface GitRunResult {
  stdout: string
  stderr: string
}

/** Parse `git status --porcelain=v1 -z` without shell quoting or line splitting. */
export function parsePorcelainStatus(output: string): GitFileStatus[] {
  const fields = output.split('\0')
  const files: GitFileStatus[] = []
  for (let index = 0; index < fields.length;) {
    const record = fields[index++]
    if (record === undefined || record === '') continue
    if (record.length < 4 || record[2] !== ' ') {
      throw new WorkbenchHttpError(502, 'GIT_STATUS_INVALID', 'Git 返回了无法识别的状态。')
    }
    const indexStatus = record[0] ?? ' '
    const worktreeStatus = record[1] ?? ' '
    const path = record.slice(3)
    const renamed = indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C'
    const originalPath = renamed ? fields[index++] : undefined
    files.push({
      path,
      ...(originalPath === undefined || originalPath === '' ? {} : { originalPath }),
      index: indexStatus,
      worktree: worktreeStatus,
    })
  }
  return files
}

/** Git status/diff/index/commit actions; every argv path is workspace-validated first. */
export class GitBackend {
  constructor(
    private readonly ctx: Context,
    private readonly workspace: WorkspaceBackend,
    private readonly limits: GitLimits,
  ) {}

  async status(sessionId: unknown): Promise<GitStatus> {
    let cwd: string
    try {
      cwd = await this.repositoryRoot(sessionId)
    } catch (error) {
      if (error instanceof WorkbenchHttpError && error.code === 'GIT_UNAVAILABLE') {
        return { available: false, files: [], message: error.message }
      }
      throw error
    }
    const [status, branch] = await Promise.all([
      this.run(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      this.run(cwd, ['branch', '--show-current']),
    ])
    return {
      available: true,
      files: parsePorcelainStatus(status.stdout),
      ...(branch.stdout.trim() === '' ? {} : { branch: branch.stdout.trim() }),
    }
  }

  async diff(sessionId: unknown, pathValue: unknown, stagedValue: unknown): Promise<GitDiff> {
    const path = await this.workspace.assertGitPath(sessionId, pathValue)
    const cwd = await this.repositoryRoot(sessionId)
    const staged = stagedValue === true
    const args = staged
      ? ['diff', '--cached', '--no-ext-diff', '--', path]
      : ['diff', '--no-ext-diff', '--', path]
    const result = await this.run(cwd, args)
    return { path, staged, text: result.stdout }
  }

  async stage(sessionId: unknown, pathValue: unknown): Promise<GitStatus> {
    const path = await this.workspace.assertGitPath(sessionId, pathValue)
    const cwd = await this.repositoryRoot(sessionId)
    await this.run(cwd, ['add', '--', path])
    this.ctx.logger.info(`workbench-layout: staged Git path ${JSON.stringify(path)}`)
    return this.status(sessionId)
  }

  async unstage(sessionId: unknown, pathValue: unknown): Promise<GitStatus> {
    const path = await this.workspace.assertGitPath(sessionId, pathValue)
    const cwd = await this.repositoryRoot(sessionId)
    try {
      await this.run(cwd, ['restore', '--staged', '--', path])
    } catch (error) {
      if (!(error instanceof WorkbenchHttpError) || error.code !== 'GIT_COMMAND_FAILED') throw error
      await this.run(cwd, ['rm', '--cached', '--ignore-unmatch', '--', path])
    }
    this.ctx.logger.info(`workbench-layout: unstaged Git path ${JSON.stringify(path)}`)
    return this.status(sessionId)
  }

  async commit(sessionId: unknown, messageValue: unknown): Promise<GitCommitResult> {
    if (typeof messageValue !== 'string' || messageValue.trim() === '') {
      throw new WorkbenchHttpError(400, 'COMMIT_MESSAGE_REQUIRED', '请输入提交说明。')
    }
    const message = messageValue.trim()
    if (message.length > 5000) throw new WorkbenchHttpError(400, 'COMMIT_MESSAGE_TOO_LONG', '提交说明过长。')
    const cwd = await this.repositoryRoot(sessionId)
    const result = await this.run(cwd, ['commit', '-m', message])
    const summary = result.stdout.trim().split(/\r?\n/u)[0] ?? 'Git 提交完成。'
    this.ctx.logger.info('workbench-layout: Git commit created from explicit user action')
    return { summary }
  }

  private async repositoryRoot(sessionId: unknown): Promise<string> {
    const workspace = await this.workspace.rootProcessPath(sessionId)
    let top: GitRunResult
    try {
      top = await this.run(workspace.cwd, ['rev-parse', '--show-toplevel'])
    } catch {
      throw new WorkbenchHttpError(409, 'GIT_UNAVAILABLE', '当前工作区不是 Git 仓库。')
    }
    const repo = resolve(top.stdout.trim())
    const root = resolve(workspace.cwd)
    if (relative(root, repo) !== '') {
      throw new WorkbenchHttpError(409, 'GIT_UNAVAILABLE', '请从 Git 仓库根目录打开工作区。')
    }
    return repo
  }

  private async run(cwd: string, args: string[]): Promise<GitRunResult> {
    try {
      const result = await execFileAsync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        maxBuffer: this.limits.maxOutputBytes,
        timeout: this.limits.timeoutMs,
        windowsHide: true,
      })
      return { stdout: result.stdout, stderr: result.stderr }
    } catch (error: unknown) {
      const detail = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim().split(/\r?\n/u)[0]
        : undefined
      this.ctx.logger.warn(`workbench-layout: Git command failed (${args[0] ?? 'unknown'})`)
      throw new WorkbenchHttpError(400, 'GIT_COMMAND_FAILED', detail === undefined || detail === '' ? 'Git 操作失败。' : detail)
    }
  }
}
