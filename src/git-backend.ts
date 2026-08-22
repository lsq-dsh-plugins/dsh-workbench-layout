/** Explicit, argv-only Git operations for one Session workspace. */

import { execFile } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { GitCommit, GitCommitResult, GitDiff, GitFileStatus, GitHistory, GitStatus } from './contracts.ts'
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

/** Parse the NUL-delimited fields on each newline-delimited Git log record. */
export function parseGitHistory(output: string): GitCommit[] {
  if (output.trim() === '') return []
  return output.trimEnd().split('\n').map((record) => {
    const [hash, shortHash, author, authoredAt, subject, ...extra] = record.split('\0')
    if (hash === undefined || shortHash === undefined || author === undefined
      || authoredAt === undefined || subject === undefined || extra.length > 0
      || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(hash)) {
      throw new WorkbenchHttpError(502, 'GIT_HISTORY_INVALID', 'Git 返回了无法识别的提交历史。')
    }
    return { hash, shortHash, author, authoredAt, subject }
  })
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
    let result = await this.run(cwd, args)
    if (!staged && result.stdout === '') {
      const untracked = await this.run(cwd, ['ls-files', '--others', '--exclude-standard', '--', path])
      if (untracked.stdout.trim() !== '') {
        result = await this.run(cwd, ['diff', '--no-index', '--no-ext-diff', '--', '/dev/null', path], [0, 1])
      }
    }
    return {
      kind: staged ? 'staged' : 'worktree',
      title: path,
      path,
      text: result.stdout,
    }
  }

  async history(sessionId: unknown): Promise<GitHistory> {
    const cwd = await this.repositoryRoot(sessionId)
    if (!await this.hasHead(cwd)) return { commits: [], truncated: false }
    const limit = 40
    const result = await this.run(cwd, [
      'log', '-n', String(limit + 1), '--date=iso-strict',
      '--format=%H%x00%h%x00%an%x00%aI%x00%s',
    ])
    const commits = parseGitHistory(result.stdout)
    return { commits: commits.slice(0, limit), truncated: commits.length > limit }
  }

  async commitDiff(sessionId: unknown, revisionValue: unknown): Promise<GitDiff> {
    if (typeof revisionValue !== 'string' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(revisionValue)) {
      throw new WorkbenchHttpError(400, 'GIT_REVISION_INVALID', '提交版本无效。')
    }
    const cwd = await this.repositoryRoot(sessionId)
    const metadata = await this.run(cwd, [
      'show', '-s', '--date=iso-strict', '--format=%H%x00%h%x00%an%x00%aI%x00%s', revisionValue,
    ])
    const commit = parseGitHistory(metadata.stdout)[0]
    if (commit === undefined) throw new WorkbenchHttpError(404, 'GIT_COMMIT_NOT_FOUND', '找不到该提交。')
    const patch = await this.run(cwd, [
      'show', '--format=', '--stat', '--patch', '--no-ext-diff', '--no-color', '--find-renames', revisionValue, '--',
    ])
    this.ctx.logger.info(`workbench-layout: opened Git commit diff ${commit.shortHash}`)
    return {
      kind: 'commit',
      title: commit.subject,
      subtitle: `${commit.shortHash} · ${commit.author} · ${commit.authoredAt}`,
      revision: commit.hash,
      text: patch.stdout,
    }
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
    if (await this.hasHead(cwd)) {
      await this.run(cwd, ['restore', '--staged', '--', path])
    } else {
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

  private async hasHead(cwd: string): Promise<boolean> {
    const result = await this.run(cwd, ['rev-parse', '--verify', 'HEAD'], [0, 1, 128])
    return result.stdout.trim() !== ''
  }

  private async run(cwd: string, args: string[], acceptedExitCodes: readonly number[] = [0]): Promise<GitRunResult> {
    try {
      const result = await execFileAsync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        maxBuffer: this.limits.maxOutputBytes,
        timeout: this.limits.timeoutMs,
        windowsHide: true,
      })
      return { stdout: result.stdout, stderr: result.stderr }
    } catch (error: unknown) {
      const failure = error !== null && typeof error === 'object'
        ? error as { code?: unknown; stdout?: unknown; stderr?: unknown }
        : undefined
      const exitCode = typeof failure?.code === 'number'
        ? failure.code
        : undefined
      if (exitCode !== undefined && acceptedExitCodes.includes(exitCode)) {
        return {
          stdout: typeof failure?.stdout === 'string' ? failure.stdout : '',
          stderr: typeof failure?.stderr === 'string' ? failure.stderr : '',
        }
      }
      const detail = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim().split(/\r?\n/u)[0]
        : undefined
      this.ctx.logger.warn(`workbench-layout: Git command failed (${args[0] ?? 'unknown'})`)
      throw new WorkbenchHttpError(400, 'GIT_COMMAND_FAILED', detail === undefined || detail === '' ? 'Git 操作失败。' : detail)
    }
  }
}
