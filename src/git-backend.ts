/** 面向单文件审阅的 Git 操作；所有命令均使用固定 argv，不经过 shell。 */

import { execFile } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {
  GitBranch,
  GitBranches,
  GitCommit,
  GitCommitFile,
  GitCommitFiles,
  GitCommitResult,
  GitFileDiff,
  GitFileStatus,
  GitHistory,
  GitReference,
  GitRemoteOperation,
  GitRemoteResult,
  GitStatus,
} from './contracts.ts'
import { WorkbenchHttpError } from './http.ts'
import type { WorkspaceBackend, WorkspaceGitText } from './workspace-backend.ts'

const execFileAsync = promisify(execFile)
const REVISION_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u
const REMOTE_OPERATIONS = new Set<GitRemoteOperation>(['fetch', 'pull', 'push', 'sync'])

export interface GitLimits {
  timeoutMs: number
  maxOutputBytes: number
}

interface GitRunResult {
  stdout: string
  stderr: string
  exitCode: number
}

interface GitBytesResult {
  stdout: Buffer
  stderr: Buffer
}

interface GitText {
  text: string
  binary: boolean
}

export interface GitNumstat {
  path: string
  originalPath?: string
  additions?: number
  deletions?: number
  binary: boolean
}

/** 将 `--decorate=full` 的引用转换成可直接渲染的分支/标签标志。 */
export function parseGitReferences(value: string): GitReference[] {
  if (value === '') return []
  const references: GitReference[] = []
  for (const raw of value.split(', ')) {
    if (raw.startsWith('HEAD -> refs/heads/')) {
      references.push({ name: raw.slice('HEAD -> refs/heads/'.length), kind: 'head' })
    } else if (raw === 'HEAD') {
      references.push({ name: 'HEAD', kind: 'head' })
    } else if (raw.startsWith('refs/heads/')) {
      references.push({ name: raw.slice('refs/heads/'.length), kind: 'local' })
    } else if (raw.startsWith('refs/remotes/')) {
      const name = raw.slice('refs/remotes/'.length)
      if (!name.endsWith('/HEAD')) references.push({ name, kind: 'remote' })
    } else if (raw.startsWith('tag: refs/tags/')) {
      references.push({ name: raw.slice('tag: refs/tags/'.length), kind: 'tag' })
    }
  }
  return references
}

/** 解析 `git status --porcelain=v1 -z`，保留重命名前后的路径。 */
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

/** 解析每行使用 NUL 字段的 Git log 记录。 */
export function parseGitHistory(output: string): GitCommit[] {
  if (output.trim() === '') return []
  return output.trimEnd().split('\n').map((record) => {
    const [hash, shortHash, author, authoredAt, subject, decorations, ...extra] = record.split('\0')
    if (hash === undefined || shortHash === undefined || author === undefined
      || authoredAt === undefined || subject === undefined || decorations === undefined || extra.length > 0
      || !REVISION_PATTERN.test(hash)) {
      throw new WorkbenchHttpError(502, 'GIT_HISTORY_INVALID', 'Git 返回了无法识别的提交历史。')
    }
    return { hash, shortHash, author, authoredAt, subject, references: parseGitReferences(decorations) }
  })
}

/** 解析本地与远程分支；符号引用（例如 origin/HEAD）不会成为可切换项。 */
export function parseGitBranches(output: string): GitBranch[] {
  if (output.trim() === '') return []
  const branches: GitBranch[] = []
  for (const record of output.trimEnd().split('\n')) {
    const [ref, name, head, upstream, symref, ...extra] = record.split('\0')
    if (ref === undefined || name === undefined || head === undefined || upstream === undefined
      || symref === undefined || extra.length > 0 || (head !== ' ' && head !== '*')) {
      throw new WorkbenchHttpError(502, 'GIT_BRANCHES_INVALID', 'Git 返回了无法识别的分支列表。')
    }
    if (symref !== '') continue
    const kind = ref.startsWith('refs/heads/') ? 'local' : ref.startsWith('refs/remotes/') ? 'remote' : undefined
    if (kind === undefined || name === '') {
      throw new WorkbenchHttpError(502, 'GIT_BRANCHES_INVALID', 'Git 返回了无法识别的分支列表。')
    }
    branches.push({
      ref,
      name,
      kind,
      current: head === '*',
      ...(upstream === '' ? {} : { upstream }),
    })
  }
  return branches.sort((left, right) => Number(right.current) - Number(left.current)
    || Number(left.kind === 'remote') - Number(right.kind === 'remote')
    || left.name.localeCompare(right.name))
}

/** 解析 `--name-status -z`，一个历史条目只代表一个文件。 */
export function parseGitNameStatus(output: string): GitCommitFile[] {
  const fields = output.split('\0')
  const files: GitCommitFile[] = []
  for (let index = 0; index < fields.length;) {
    const token = fields[index++]
    if (token === undefined || token === '') continue
    if (!/^[A-Z][0-9]*$/u.test(token)) {
      throw new WorkbenchHttpError(502, 'GIT_COMMIT_FILES_INVALID', 'Git 返回了无法识别的提交文件。')
    }
    const status = token[0] as string
    if (status === 'R' || status === 'C') {
      const originalPath = fields[index++]
      const path = fields[index++]
      if (originalPath === undefined || originalPath === '' || path === undefined || path === '') {
        throw new WorkbenchHttpError(502, 'GIT_COMMIT_FILES_INVALID', 'Git 返回了不完整的重命名记录。')
      }
      files.push({ path, originalPath, status })
      continue
    }
    const path = fields[index++]
    if (path === undefined || path === '') {
      throw new WorkbenchHttpError(502, 'GIT_COMMIT_FILES_INVALID', 'Git 返回了不完整的提交文件记录。')
    }
    files.push({ path, status })
  }
  return files
}

/** 解析 `--numstat -z`，兼容普通路径与重命名路径。 */
export function parseGitNumstat(output: string): GitNumstat[] {
  const fields = output.split('\0')
  const stats: GitNumstat[] = []
  for (let index = 0; index < fields.length;) {
    const record = fields[index++]
    if (record === undefined || record === '') continue
    const firstTab = record.indexOf('\t')
    const secondTab = firstTab < 0 ? -1 : record.indexOf('\t', firstTab + 1)
    if (firstTab < 1 || secondTab < firstTab + 2) {
      throw new WorkbenchHttpError(502, 'GIT_NUMSTAT_INVALID', 'Git 返回了无法识别的变更统计。')
    }
    const added = record.slice(0, firstTab)
    const deleted = record.slice(firstTab + 1, secondTab)
    const embeddedPath = record.slice(secondTab + 1)
    let path = embeddedPath
    let originalPath: string | undefined
    if (embeddedPath === '') {
      originalPath = fields[index++]
      path = fields[index++] ?? ''
    }
    if (path === '' || (added !== '-' && !/^\d+$/u.test(added)) || (deleted !== '-' && !/^\d+$/u.test(deleted))) {
      throw new WorkbenchHttpError(502, 'GIT_NUMSTAT_INVALID', 'Git 返回了不完整的变更统计。')
    }
    const binary = added === '-' || deleted === '-'
    stats.push({
      path,
      ...(originalPath === undefined || originalPath === '' ? {} : { originalPath }),
      ...(binary ? {} : { additions: Number(added), deletions: Number(deleted) }),
      binary,
    })
  }
  return stats
}

/** Git 状态、单文件版本、索引和提交操作。 */
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
    const [status, branch, remotes] = await Promise.all([
      this.run(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      this.run(cwd, ['branch', '--show-current']),
      this.run(cwd, ['remote']),
    ])
    const branchName = branch.stdout.trim()
    const remoteNames = remotes.stdout.split(/\r?\n/u).map(name => name.trim()).filter(name => name !== '')
    const hasHead = await this.hasHead(cwd)
    const upstreamResult = hasHead && branchName !== ''
      ? await this.run(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], [0, 128])
      : undefined
    const upstream = upstreamResult?.exitCode === 0 ? upstreamResult.stdout.trim() : ''
    const sync = upstream === ''
      ? undefined
      : parseAheadBehind((await this.run(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).stdout)
    return {
      available: true,
      files: parsePorcelainStatus(status.stdout),
      ...(branchName === '' ? {} : { branch: branchName }),
      detached: hasHead && branchName === '',
      hasRemote: remoteNames.length > 0,
      remotes: remoteNames,
      ...(upstream === '' ? {} : { upstream }),
      ...(sync === undefined ? {} : sync),
    }
  }

  async diff(sessionId: unknown, pathValue: unknown, stagedValue: unknown): Promise<GitFileDiff> {
    const path = await this.workspace.assertGitPath(sessionId, pathValue)
    const cwd = await this.repositoryRoot(sessionId)
    const status = parsePorcelainStatus((await this.run(cwd, [
      'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', path,
    ])).stdout).find(file => file.path === path)
    if (status === undefined) throw new WorkbenchHttpError(404, 'GIT_CHANGE_NOT_FOUND', '找不到该文件的 Git 变更。')

    const staged = stagedValue === true
    if (staged && !isStaged(status)) throw new WorkbenchHttpError(409, 'GIT_CHANGE_NOT_STAGED', '该文件没有已暂存变更。')
    if (!staged && !hasWorktreeChange(status)) throw new WorkbenchHttpError(409, 'GIT_CHANGE_NOT_WORKTREE', '该文件没有工作区变更。')

    const [original, modified] = staged
      ? await this.stagedSides(cwd, status)
      : await this.worktreeSides(sessionId, cwd, status)
    const stat = await this.changeStat(cwd, path, staged, status, modified)
    const binary = original.binary || modified.binary || stat?.binary === true
    this.ctx.logger.info(`workbench-layout: opened ${staged ? 'staged' : 'worktree'} Git diff for ${JSON.stringify(path)}`)
    return {
      kind: staged ? 'staged' : 'worktree',
      path,
      ...(status.originalPath === undefined ? {} : { originalPath: status.originalPath }),
      status: normalizeStatus(staged ? status.index : status.worktree),
      original: binary ? '' : original.text,
      modified: binary ? '' : modified.text,
      binary,
      ...(stat?.additions === undefined ? {} : { additions: stat.additions }),
      ...(stat?.deletions === undefined ? {} : { deletions: stat.deletions }),
    }
  }

  async history(sessionId: unknown): Promise<GitHistory> {
    const cwd = await this.repositoryRoot(sessionId)
    if (!await this.hasHead(cwd)) return { commits: [], truncated: false }
    const limit = 40
    const result = await this.run(cwd, [
      'log', '-n', String(limit + 1), '--date=iso-strict', '--decorate=full',
      '--format=%H%x00%h%x00%an%x00%aI%x00%s%x00%D',
    ])
    const commits = parseGitHistory(result.stdout)
    return { commits: commits.slice(0, limit), truncated: commits.length > limit }
  }

  async branches(sessionId: unknown): Promise<GitBranches> {
    const cwd = await this.repositoryRoot(sessionId)
    const result = await this.run(cwd, [
      'for-each-ref',
      '--format=%(refname)%00%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(symref)',
      'refs/heads', 'refs/remotes',
    ])
    const branches = parseGitBranches(result.stdout)
    const current = branches.find(branch => branch.current)?.name
    return {
      ...(current === undefined ? {} : { current }),
      detached: current === undefined && await this.hasHead(cwd),
      branches,
    }
  }

  async switchBranch(sessionId: unknown, refValue: unknown): Promise<GitStatus> {
    if (typeof refValue !== 'string' || refValue === '') {
      throw new WorkbenchHttpError(400, 'GIT_BRANCH_REQUIRED', '请选择要切换的分支。')
    }
    const cwd = await this.repositoryRoot(sessionId)
    const available = await this.branches(sessionId)
    const target = available.branches.find(branch => branch.ref === refValue)
    if (target === undefined) throw new WorkbenchHttpError(404, 'GIT_BRANCH_NOT_FOUND', '找不到所选分支。')
    if (target.current) return this.status(sessionId)

    if (target.kind === 'local') {
      await this.run(cwd, ['switch', '--', target.name])
    } else {
      const remoteNames = (await this.run(cwd, ['remote'])).stdout.split(/\r?\n/u)
        .map(name => name.trim()).filter(name => name !== '').sort((left, right) => right.length - left.length)
      const remote = remoteNames.find(name => target.ref.startsWith(`refs/remotes/${name}/`))
      if (remote === undefined) throw new WorkbenchHttpError(409, 'GIT_REMOTE_UNAVAILABLE', '所选远程分支的远程地址已不存在。')
      const localName = target.ref.slice(`refs/remotes/${remote}/`.length)
      const local = available.branches.find(branch => branch.kind === 'local' && branch.name === localName)
      if (local === undefined) await this.run(cwd, ['switch', '--track', '--', target.name])
      else await this.run(cwd, ['switch', '--', local.name])
    }
    this.ctx.logger.info(`workbench-layout: switched Git branch to ${JSON.stringify(target.name)}`)
    return this.status(sessionId)
  }

  async remoteOperation(sessionId: unknown, operationValue: unknown): Promise<GitRemoteResult> {
    if (typeof operationValue !== 'string' || !REMOTE_OPERATIONS.has(operationValue as GitRemoteOperation)) {
      throw new WorkbenchHttpError(400, 'GIT_REMOTE_OPERATION_INVALID', '不支持该远程 Git 操作。')
    }
    const operation = operationValue as GitRemoteOperation
    const cwd = await this.repositoryRoot(sessionId)
    const status = await this.status(sessionId)
    if (status.hasRemote !== true) throw new WorkbenchHttpError(409, 'GIT_REMOTE_UNAVAILABLE', '当前仓库没有配置远程地址。')
    if ((operation === 'pull' || operation === 'sync') && status.upstream === undefined) {
      throw new WorkbenchHttpError(409, 'GIT_UPSTREAM_UNAVAILABLE', '当前分支没有配置上游分支。')
    }

    if (operation === 'fetch') await this.run(cwd, ['fetch', '--all', '--prune'])
    if (operation === 'pull' || operation === 'sync') await this.run(cwd, ['pull', '--ff-only'])
    if (operation === 'push' && status.upstream === undefined) {
      if (status.branch === undefined || status.remotes?.length !== 1) {
        throw new WorkbenchHttpError(409, 'GIT_UPSTREAM_UNAVAILABLE', '当前分支没有上游；存在多个远程时不会自动选择推送目标。')
      }
      await this.run(cwd, ['push', '--set-upstream', '--', status.remotes[0]!, status.branch])
    } else if (operation === 'push' || operation === 'sync') {
      await this.run(cwd, ['push'])
    }
    this.ctx.logger.info(`workbench-layout: completed explicit Git remote operation ${operation}`)
    return { operation }
  }

  async commitFiles(sessionId: unknown, revisionValue: unknown): Promise<GitCommitFiles> {
    const cwd = await this.repositoryRoot(sessionId)
    const details = await this.loadCommitFiles(cwd, revisionValue)
    this.ctx.logger.info(`workbench-layout: listed files for Git commit ${details.commit.shortHash}`)
    return details
  }

  async commitFileDiff(sessionId: unknown, revisionValue: unknown, pathValue: unknown): Promise<GitFileDiff> {
    const path = await this.workspace.assertGitPath(sessionId, pathValue)
    const cwd = await this.repositoryRoot(sessionId)
    const details = await this.loadCommitFiles(cwd, revisionValue)
    const file = details.files.find(candidate => candidate.path === path)
    if (file === undefined) throw new WorkbenchHttpError(404, 'GIT_COMMIT_FILE_NOT_FOUND', '该提交中找不到所选文件。')
    if (file.originalPath !== undefined) await this.workspace.assertGitPath(sessionId, file.originalPath)

    const original = details.parentRevision === undefined || file.status === 'A'
      ? emptyGitText()
      : await this.readGitBlob(cwd, `${details.parentRevision}:${file.originalPath ?? file.path}`)
    const modified = file.status === 'D'
      ? emptyGitText()
      : await this.readGitBlob(cwd, `${details.commit.hash}:${file.path}`)
    const stat = await this.commitStat(cwd, details, file)
    const binary = original.binary || modified.binary || stat?.binary === true
    this.ctx.logger.info(`workbench-layout: opened Git commit file diff ${details.commit.shortHash} ${JSON.stringify(path)}`)
    return {
      kind: 'commit',
      path: file.path,
      ...(file.originalPath === undefined ? {} : { originalPath: file.originalPath }),
      status: normalizeStatus(file.status),
      revision: details.commit.hash,
      ...(details.parentRevision === undefined ? {} : { parentRevision: details.parentRevision }),
      commit: details.commit,
      original: binary ? '' : original.text,
      modified: binary ? '' : modified.text,
      binary,
      ...(stat?.additions === undefined ? {} : { additions: stat.additions }),
      ...(stat?.deletions === undefined ? {} : { deletions: stat.deletions }),
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

  private async stagedSides(cwd: string, file: GitFileStatus): Promise<[GitText, GitText]> {
    const original = !await this.hasHead(cwd) || file.index === 'A'
      ? emptyGitText()
      : await this.readGitBlobMaybe(cwd, `HEAD:${file.originalPath ?? file.path}`)
    const modified = file.index === 'D'
      ? emptyGitText()
      : await this.readGitBlob(cwd, `:${file.path}`)
    return [original, modified]
  }

  private async worktreeSides(sessionId: unknown, cwd: string, file: GitFileStatus): Promise<[GitText, WorkspaceGitText]> {
    const conflict = isConflict(file)
    const original = file.index === '?'
      ? emptyGitText()
      : conflict
        ? await this.readGitBlobMaybe(cwd, `HEAD:${file.originalPath ?? file.path}`)
        : await this.readGitBlob(cwd, `:${file.originalPath ?? file.path}`)
    const modified = file.worktree === 'D'
      ? emptyGitText()
      : await this.workspace.readGitText(sessionId, file.path)
    return [original, modified]
  }

  private async changeStat(
    cwd: string,
    path: string,
    staged: boolean,
    file: GitFileStatus,
    modified: WorkspaceGitText,
  ): Promise<GitNumstat | undefined> {
    if (!staged && file.index === '?') {
      return modified.binary
        ? { path, binary: true }
        : { path, additions: contentLineCount(modified.text), deletions: 0, binary: false }
    }
    const args = staged
      ? ['diff', '--cached', '--numstat', '-z', '--no-ext-diff', '--', path]
      : ['diff', '--numstat', '-z', '--no-ext-diff', '--', path]
    return parseGitNumstat((await this.run(cwd, args)).stdout)[0]
  }

  private async loadCommitFiles(cwd: string, revisionValue: unknown): Promise<GitCommitFiles> {
    const revision = requireRevision(revisionValue)
    const metadata = await this.run(cwd, [
      'show', '-s', '--date=iso-strict', '--decorate=full',
      '--format=%H%x00%h%x00%an%x00%aI%x00%s%x00%D', revision,
    ])
    const commit = parseGitHistory(metadata.stdout)[0]
    if (commit === undefined) throw new WorkbenchHttpError(404, 'GIT_COMMIT_NOT_FOUND', '找不到该提交。')
    const parentLine = (await this.run(cwd, ['rev-list', '--parents', '-n', '1', commit.hash])).stdout.trim()
    const [, parentRevision] = parentLine.split(' ')
    const result = parentRevision === undefined
      ? await this.run(cwd, [
          'diff-tree', '--root', '--no-commit-id', '--name-status', '-z', '-r',
          '--find-renames', '--find-copies', commit.hash, '--',
        ])
      : await this.run(cwd, [
          'diff', '--name-status', '-z', '--find-renames', '--find-copies',
          parentRevision, commit.hash, '--',
        ])
    return {
      commit,
      ...(parentRevision === undefined ? {} : { parentRevision }),
      files: parseGitNameStatus(result.stdout),
    }
  }

  private async commitStat(cwd: string, details: GitCommitFiles, file: GitCommitFile): Promise<GitNumstat | undefined> {
    const paths = file.originalPath === undefined ? [file.path] : [file.originalPath, file.path]
    const result = details.parentRevision === undefined
      ? await this.run(cwd, [
          'show', '--format=', '--numstat', '-z', '--find-renames', '--find-copies',
          details.commit.hash, '--', ...paths,
        ])
      : await this.run(cwd, [
          'diff', '--numstat', '-z', '--find-renames', '--find-copies',
          details.parentRevision, details.commit.hash, '--', ...paths,
        ])
    return parseGitNumstat(result.stdout)[0]
  }

  private async readGitBlobMaybe(cwd: string, spec: string): Promise<GitText> {
    const exists = await this.run(cwd, ['cat-file', '-e', spec], [0, 1, 128])
    return exists.exitCode === 0 ? this.readGitBlob(cwd, spec) : emptyGitText()
  }

  private async readGitBlob(cwd: string, spec: string): Promise<GitText> {
    const sizeText = (await this.run(cwd, ['cat-file', '-s', spec])).stdout.trim()
    const size = Number(sizeText)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new WorkbenchHttpError(502, 'GIT_BLOB_SIZE_INVALID', 'Git 返回了无效的文件大小。')
    }
    if (size > this.limits.maxOutputBytes) {
      throw new WorkbenchHttpError(413, 'GIT_DIFF_TOO_LARGE', '文件超过 Diff 视图允许的大小。')
    }
    const bytes = (await this.runBytes(cwd, ['cat-file', 'blob', spec])).stdout
    if (bytes.includes(0)) return { text: '', binary: true }
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false }
    } catch {
      return { text: '', binary: true }
    }
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
    return result.exitCode === 0 && result.stdout.trim() !== ''
  }

  private async run(cwd: string, args: string[], acceptedExitCodes: readonly number[] = [0]): Promise<GitRunResult> {
    try {
      const result = await execFileAsync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        env: nonInteractiveGitEnvironment(),
        maxBuffer: this.limits.maxOutputBytes,
        timeout: this.limits.timeoutMs,
        windowsHide: true,
      })
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
    } catch (error: unknown) {
      const failure = failureFields(error)
      if (failure.exitCode !== undefined && acceptedExitCodes.includes(failure.exitCode)) {
        return { stdout: failure.stdout, stderr: failure.stderr, exitCode: failure.exitCode }
      }
      throw this.gitFailure(error, args, failure.stderr)
    }
  }

  private runBytes(cwd: string, args: string[]): Promise<GitBytesResult> {
    return new Promise((resolveRun, rejectRun) => {
      execFile('git', ['-C', cwd, ...args], {
        encoding: null,
        env: nonInteractiveGitEnvironment(),
        maxBuffer: this.limits.maxOutputBytes,
        timeout: this.limits.timeoutMs,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error === null) {
          resolveRun({ stdout, stderr })
          return
        }
        rejectRun(this.gitFailure(error, args, stderr.toString('utf8')))
      })
    })
  }

  private gitFailure(error: unknown, args: string[], stderr: string): WorkbenchHttpError {
    this.ctx.logger.warn(`workbench-layout: Git command failed (${args[0] ?? 'unknown'})`)
    const code = error !== null && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
    if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return new WorkbenchHttpError(413, 'GIT_DIFF_TOO_LARGE', 'Git 输出超过 Diff 视图允许的大小。')
    }
    const detail = stderr.trim().split(/\r?\n/u)[0]
    return new WorkbenchHttpError(400, 'GIT_COMMAND_FAILED', detail === undefined || detail === '' ? 'Git 操作失败。' : detail)
  }
}

function failureFields(error: unknown): { exitCode?: number; stdout: string; stderr: string } {
  const failure = error !== null && typeof error === 'object'
    ? error as { code?: unknown; stdout?: unknown; stderr?: unknown }
    : undefined
  return {
    ...(typeof failure?.code === 'number' ? { exitCode: failure.code } : {}),
    stdout: typeof failure?.stdout === 'string' ? failure.stdout : '',
    stderr: typeof failure?.stderr === 'string' ? failure.stderr : '',
  }
}

function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [aheadText, behindText, ...extra] = output.trim().split(/\s+/u)
  const ahead = Number(aheadText)
  const behind = Number(behindText)
  if (extra.length > 0 || !Number.isSafeInteger(ahead) || ahead < 0 || !Number.isSafeInteger(behind) || behind < 0) {
    throw new WorkbenchHttpError(502, 'GIT_SYNC_STATUS_INVALID', 'Git 返回了无法识别的同步状态。')
  }
  return { ahead, behind }
}

function nonInteractiveGitEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  }
}

function requireRevision(value: unknown): string {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new WorkbenchHttpError(400, 'GIT_REVISION_INVALID', '提交版本无效。')
  }
  return value
}

function emptyGitText(): GitText {
  return { text: '', binary: false }
}

function isStaged(file: GitFileStatus): boolean {
  return file.index !== ' ' && file.index !== '?'
}

function hasWorktreeChange(file: GitFileStatus): boolean {
  return file.worktree !== ' ' || file.index === '?'
}

function isConflict(file: GitFileStatus): boolean {
  return file.index === 'U' || file.worktree === 'U'
    || (file.index === 'A' && file.worktree === 'A')
    || (file.index === 'D' && file.worktree === 'D')
}

function normalizeStatus(status: string): string {
  return status === '?' ? 'U' : status === ' ' ? 'M' : status
}

function contentLineCount(text: string): number {
  if (text === '') return 0
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').length
}
