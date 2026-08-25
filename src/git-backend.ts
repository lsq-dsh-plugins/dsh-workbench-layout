/** 面向单文件审阅的 Git 操作；所有命令均使用固定 argv，不经过 shell。 */

import { execFile } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {
  GitBranch,
  GitBranches,
  GitCommit,
  GitCommitAction,
  GitCommitActionResult,
  GitCommitFile,
  GitCommitFiles,
  GitCommitResult,
  GitCommitStats,
  GitEditorBaseline,
  GitFileDiff,
  GitFileStatus,
  GitGraph,
  GitReference,
  GitRemote,
  GitRemoteOperation,
  GitRemoteResult,
  GitRemotes,
  GitStatus,
  GitTargetRemoteOperation,
  GitTargetRemoteResult,
} from './contracts.ts'
import { GIT_GRAPH_PAGE_SIZE } from './contracts.ts'
import { WorkbenchHttpError } from './http.ts'
import type { WorkspaceBackend, WorkspaceGitText } from './workspace-backend.ts'

const execFileAsync = promisify(execFile)
const REVISION_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u
const REMOTE_OPERATIONS = new Set<GitRemoteOperation>(['fetch', 'pull', 'push', 'sync'])
const TARGET_REMOTE_OPERATIONS = new Set<GitTargetRemoteOperation>(['fetch', 'pull', 'push'])
const COMMIT_ACTIONS = new Set<GitCommitAction>(['cherry-pick', 'revert'])

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

/** 解析每行使用 NUL 字段的 Git Graph 记录，并校验全部父提交。 */
export function parseGitGraph(output: string): GitCommit[] {
  if (output.trim() === '') return []
  return output.trimEnd().split('\n').map(parseGitGraphRecord)
}

/** 解析带记录边界和 `--shortstat` 的提交图，避免从提交说明中猜测变更量。 */
export function parseGitGraphWithStats(output: string): GitCommit[] {
  if (output.trim() === '') return []
  const [prefix, ...records] = output.split('\x1e')
  if (prefix?.trim() !== '' || records.length === 0) {
    throw new WorkbenchHttpError(502, 'GIT_GRAPH_INVALID', 'Git 返回了无法识别的提交图统计数据。')
  }
  return records.filter(record => record !== '').map((record) => {
    const [hash, shortHash, parentList, author, authoredAt, subject, decorations, shortstat, ...extra] = record.split('\0')
    if (shortstat === undefined || extra.length > 0) {
      throw new WorkbenchHttpError(502, 'GIT_GRAPH_INVALID', 'Git 返回了无法识别的提交图统计数据。')
    }
    const commit = parseGitGraphRecord([
      hash, shortHash, parentList, author, authoredAt, subject, decorations,
    ].join('\0'))
    return { ...commit, stats: parseGitShortstat(shortstat) }
  })
}

/** 解析固定为英文的 `--shortstat` 汇总；没有统计行代表空提交。 */
export function parseGitShortstat(value: string): GitCommitStats {
  const summary = value.trim()
  if (summary === '') return { filesChanged: 0, additions: 0, deletions: 0 }
  const match = /^(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?$/u.exec(summary)
  if (match === null) {
    throw new WorkbenchHttpError(502, 'GIT_GRAPH_INVALID', 'Git 返回了无法识别的提交变更统计。')
  }
  const filesChanged = Number(match[1])
  const additions = Number(match[2] ?? 0)
  const deletions = Number(match[3] ?? 0)
  if (![filesChanged, additions, deletions].every(Number.isSafeInteger)) {
    throw new WorkbenchHttpError(502, 'GIT_GRAPH_INVALID', 'Git 返回了超出范围的提交变更统计。')
  }
  return { filesChanged, additions, deletions }
}

function parseGitGraphRecord(record: string): GitCommit {
  const [hash, shortHash, parentList, author, authoredAt, subject, decorations, ...extra] = record.split('\0')
  if (hash === undefined || shortHash === undefined || author === undefined
    || parentList === undefined || authoredAt === undefined || subject === undefined || decorations === undefined || extra.length > 0
    || !REVISION_PATTERN.test(hash)) {
    throw new WorkbenchHttpError(502, 'GIT_GRAPH_INVALID', 'Git 返回了无法识别的提交图数据。')
  }
  const parents = parentList === '' ? [] : parentList.split(' ')
  if (parents.some(parent => !REVISION_PATTERN.test(parent))) {
    throw new WorkbenchHttpError(502, 'GIT_GRAPH_INVALID', 'Git 返回了无法识别的提交图父节点。')
  }
  return { hash, shortHash, parents, author, authoredAt, subject, references: parseGitReferences(decorations) }
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

/** 解析 `--name-status -z`，一个提交图条目只代表一个文件。 */
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

  async status(workspaceId: unknown): Promise<GitStatus> {
    let cwd: string
    try {
      cwd = await this.repositoryRoot(workspaceId)
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
    const head = await this.headRevision(cwd)
    const hasHead = head !== undefined
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
      ...(head === undefined ? {} : { head }),
      ...(branchName === '' ? {} : { branch: branchName }),
      detached: hasHead && branchName === '',
      hasRemote: remoteNames.length > 0,
      remotes: remoteNames,
      ...(upstream === '' ? {} : { upstream }),
      ...(sync === undefined ? {} : sync),
    }
  }

  async diff(workspaceId: unknown, pathValue: unknown, stagedValue: unknown): Promise<GitFileDiff> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    const cwd = await this.repositoryRoot(workspaceId)
    const status = parsePorcelainStatus((await this.run(cwd, [
      'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', path,
    ])).stdout).find(file => file.path === path)
    if (status === undefined) throw new WorkbenchHttpError(404, 'GIT_CHANGE_NOT_FOUND', '找不到该文件的 Git 变更。')

    const staged = stagedValue === true
    if (staged && !isStaged(status)) throw new WorkbenchHttpError(409, 'GIT_CHANGE_NOT_STAGED', '该文件没有已暂存变更。')
    if (!staged && !hasWorktreeChange(status)) throw new WorkbenchHttpError(409, 'GIT_CHANGE_NOT_WORKTREE', '该文件没有工作区变更。')

    const [original, modified] = staged
      ? await this.stagedSides(cwd, status)
      : await this.worktreeSides(workspaceId, cwd, status)
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

  /** Return the HEAD-side text used by editable source-line Git decorations. */
  async editorBaseline(workspaceId: unknown, pathValue: unknown): Promise<GitEditorBaseline> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    let cwd: string
    try {
      cwd = await this.repositoryRoot(workspaceId)
    } catch (error) {
      if (error instanceof WorkbenchHttpError && error.code === 'GIT_UNAVAILABLE') {
        return { path, available: false, original: '', binary: false }
      }
      throw error
    }
    const head = await this.headRevision(cwd)
    const status = parsePorcelainStatus((await this.run(cwd, [
      'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', path,
    ])).stdout).find(file => file.path === path)
    if (status?.index === '?' || status?.index === 'A' || head === undefined) {
      this.ctx.logger.info(`workbench-layout: loaded empty Git editor baseline for ${JSON.stringify(path)}`)
      return {
        path,
        available: status !== undefined,
        original: '',
        binary: false,
        ...(head === undefined ? {} : { revision: head }),
      }
    }
    if (status === undefined) {
      const tracked = await this.run(cwd, ['ls-files', '--error-unmatch', '--', path], [0, 1])
      if (tracked.exitCode !== 0) {
        this.ctx.logger.info(`workbench-layout: skipped Git editor baseline for untracked ignored path ${JSON.stringify(path)}`)
        return { path, available: false, original: '', binary: false, revision: head }
      }
    }
    const original = await this.readGitBlobMaybe(cwd, `HEAD:${status?.originalPath ?? path}`)
    this.ctx.logger.info(`workbench-layout: loaded Git editor baseline for ${JSON.stringify(path)} from HEAD`)
    return {
      path,
      available: true,
      original: original.binary ? '' : original.text,
      binary: original.binary,
      revision: head,
    }
  }

  async graph(workspaceId: unknown, offsetValue: unknown = 0): Promise<GitGraph> {
    const offset = graphOffset(offsetValue)
    const cwd = await this.repositoryRoot(workspaceId)
    if (!await this.hasHead(cwd)) return { commits: [], truncated: false, nextOffset: offset }
    const result = await this.run(cwd, [
      'log', '--all', '--topo-order', `--skip=${offset}`, '-n', String(GIT_GRAPH_PAGE_SIZE + 1), '--date=iso-strict', '--decorate=full',
      '--shortstat', '--diff-merges=first-parent',
      '--format=%x1e%H%x00%h%x00%P%x00%an%x00%aI%x00%s%x00%D%x00',
    ], [0], { LC_ALL: 'C', LANG: 'C' })
    const commits = parseGitGraphWithStats(result.stdout)
    const visible = commits.slice(0, GIT_GRAPH_PAGE_SIZE)
    const graph = { commits: visible, truncated: commits.length > GIT_GRAPH_PAGE_SIZE, nextOffset: offset + visible.length }
    this.ctx.logger.info(`workbench-layout: loaded Git graph page at offset ${offset} with ${visible.length} commits; older commits ${graph.truncated ? 'remain' : 'exhausted'}`)
    return graph
  }

  async branches(workspaceId: unknown): Promise<GitBranches> {
    const cwd = await this.repositoryRoot(workspaceId)
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

  async switchBranch(workspaceId: unknown, refValue: unknown): Promise<GitStatus> {
    if (typeof refValue !== 'string' || refValue === '') {
      throw new WorkbenchHttpError(400, 'GIT_BRANCH_REQUIRED', '请选择要切换的分支。')
    }
    const cwd = await this.repositoryRoot(workspaceId)
    const available = await this.branches(workspaceId)
    const target = available.branches.find(branch => branch.ref === refValue)
    if (target === undefined) throw new WorkbenchHttpError(404, 'GIT_BRANCH_NOT_FOUND', '找不到所选分支。')
    if (target.current) return this.status(workspaceId)

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
    return this.status(workspaceId)
  }

  async createBranch(workspaceId: unknown, nameValue: unknown, sourceValue?: unknown): Promise<GitStatus> {
    const cwd = await this.repositoryRoot(workspaceId)
    const name = await this.requireBranchName(cwd, nameValue)
    let source: string | undefined
    if (sourceValue !== undefined) {
      if (typeof sourceValue !== 'string' || sourceValue === '') {
        throw new WorkbenchHttpError(400, 'GIT_BRANCH_SOURCE_REQUIRED', '请选择新分支的来源。')
      }
      const available = await this.branches(workspaceId)
      const branch = available.branches.find(candidate => candidate.ref === sourceValue)
      if (branch !== undefined) source = branch.ref
      else if (REVISION_PATTERN.test(sourceValue)) {
        const revision = await this.run(cwd, ['rev-parse', '--verify', `${sourceValue}^{commit}`], [0, 1, 128])
        if (revision.exitCode === 0) source = sourceValue
      }
      if (source === undefined) throw new WorkbenchHttpError(404, 'GIT_BRANCH_SOURCE_NOT_FOUND', '找不到新分支的来源。')
    }
    await this.run(cwd, source === undefined ? ['switch', '-c', name] : ['switch', '-c', name, source])
    this.ctx.logger.info(`workbench-layout: created and switched to Git branch ${JSON.stringify(name)}`)
    return this.status(workspaceId)
  }

  async renameBranch(workspaceId: unknown, nameValue: unknown): Promise<GitStatus> {
    const cwd = await this.repositoryRoot(workspaceId)
    const status = await this.status(workspaceId)
    if (status.branch === undefined) {
      throw new WorkbenchHttpError(409, 'GIT_BRANCH_CURRENT_UNAVAILABLE', '游离 HEAD 状态下不能重命名当前分支。')
    }
    if (typeof nameValue === 'string' && nameValue.trim() === status.branch) return status
    const name = await this.requireBranchName(cwd, nameValue)
    await this.run(cwd, ['branch', '-m', '--', name])
    this.ctx.logger.info(`workbench-layout: renamed current Git branch to ${JSON.stringify(name)}`)
    return this.status(workspaceId)
  }

  async deleteBranch(workspaceId: unknown, refValue: unknown): Promise<GitStatus> {
    if (typeof refValue !== 'string' || refValue === '') {
      throw new WorkbenchHttpError(400, 'GIT_BRANCH_REQUIRED', '请选择要删除的本地分支。')
    }
    const cwd = await this.repositoryRoot(workspaceId)
    const available = await this.branches(workspaceId)
    const target = available.branches.find(branch => branch.ref === refValue && branch.kind === 'local')
    if (target === undefined) throw new WorkbenchHttpError(404, 'GIT_BRANCH_NOT_FOUND', '找不到要删除的本地分支。')
    if (target.current) throw new WorkbenchHttpError(409, 'GIT_BRANCH_CURRENT_DELETE', '不能删除当前分支。')
    await this.run(cwd, ['branch', '-d', '--', target.name])
    this.ctx.logger.info(`workbench-layout: safely deleted Git branch ${JSON.stringify(target.name)}`)
    return this.status(workspaceId)
  }

  async remoteOperation(workspaceId: unknown, operationValue: unknown): Promise<GitRemoteResult> {
    if (typeof operationValue !== 'string' || !REMOTE_OPERATIONS.has(operationValue as GitRemoteOperation)) {
      throw new WorkbenchHttpError(400, 'GIT_REMOTE_OPERATION_INVALID', '不支持该远程 Git 操作。')
    }
    const operation = operationValue as GitRemoteOperation
    const cwd = await this.repositoryRoot(workspaceId)
    const status = await this.status(workspaceId)
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

  async remotes(workspaceId: unknown): Promise<GitRemotes> {
    const cwd = await this.repositoryRoot(workspaceId)
    const names = await this.remoteNames(cwd)
    const remotes: GitRemote[] = []
    for (const name of names) {
      const fetchUrl = (await this.run(cwd, ['config', '--get', `remote.${name}.url`], [0, 1])).stdout.trim()
      const pushConfig = (await this.run(cwd, ['config', '--get', `remote.${name}.pushurl`], [0, 1])).stdout.trim()
      remotes.push({
        name,
        fetchUrl,
        pushUrl: pushConfig === '' ? fetchUrl : pushConfig,
        separatePushUrl: pushConfig !== '',
      })
    }
    return { remotes }
  }

  async addRemote(workspaceId: unknown, nameValue: unknown, fetchUrlValue: unknown, pushUrlValue?: unknown): Promise<GitRemotes> {
    const cwd = await this.repositoryRoot(workspaceId)
    const name = await this.requireRemoteName(cwd, nameValue)
    const fetchUrl = requireRemoteUrl(fetchUrlValue)
    const pushUrl = requireOptionalRemoteUrl(pushUrlValue)
    await this.run(cwd, ['remote', 'add', '--', name, fetchUrl])
    try {
      if (pushUrl !== undefined && pushUrl !== fetchUrl) await this.run(cwd, ['remote', 'set-url', '--push', name, pushUrl])
    } catch (error: unknown) {
      await this.run(cwd, ['remote', 'remove', name], [0, 2, 128])
      throw error
    }
    this.ctx.logger.info(`workbench-layout: added Git remote ${JSON.stringify(name)}`)
    return this.remotes(workspaceId)
  }

  async updateRemote(
    workspaceId: unknown,
    currentNameValue: unknown,
    nameValue: unknown,
    fetchUrlValue: unknown,
    pushUrlValue?: unknown,
  ): Promise<GitRemotes> {
    const cwd = await this.repositoryRoot(workspaceId)
    const currentName = await this.requireRemote(cwd, currentNameValue)
    const name = typeof nameValue === 'string' && nameValue.trim() === currentName
      ? currentName
      : await this.requireRemoteName(cwd, nameValue)
    const fetchUrl = requireRemoteUrl(fetchUrlValue)
    const pushUrl = requireOptionalRemoteUrl(pushUrlValue)
    await this.run(cwd, ['remote', 'set-url', currentName, fetchUrl])
    if (pushUrl === undefined || pushUrl === fetchUrl) {
      await this.run(cwd, ['config', '--unset-all', `remote.${currentName}.pushurl`], [0, 5])
    } else {
      await this.run(cwd, ['remote', 'set-url', '--push', currentName, pushUrl])
    }
    if (name !== currentName) await this.run(cwd, ['remote', 'rename', currentName, name])
    this.ctx.logger.info(`workbench-layout: updated Git remote ${JSON.stringify(currentName)} as ${JSON.stringify(name)}`)
    return this.remotes(workspaceId)
  }

  async deleteRemote(workspaceId: unknown, nameValue: unknown): Promise<GitRemotes> {
    const cwd = await this.repositoryRoot(workspaceId)
    const name = await this.requireRemote(cwd, nameValue)
    await this.run(cwd, ['remote', 'remove', name])
    this.ctx.logger.info(`workbench-layout: removed Git remote ${JSON.stringify(name)}`)
    return this.remotes(workspaceId)
  }

  async targetRemoteOperation(
    workspaceId: unknown,
    operationValue: unknown,
    remoteValue: unknown,
    branchValue?: unknown,
  ): Promise<GitTargetRemoteResult> {
    if (typeof operationValue !== 'string' || !TARGET_REMOTE_OPERATIONS.has(operationValue as GitTargetRemoteOperation)) {
      throw new WorkbenchHttpError(400, 'GIT_REMOTE_OPERATION_INVALID', '不支持该指定远端 Git 操作。')
    }
    const operation = operationValue as GitTargetRemoteOperation
    const cwd = await this.repositoryRoot(workspaceId)
    const remote = await this.requireRemote(cwd, remoteValue)
    if (operation === 'fetch') {
      await this.run(cwd, ['fetch', '--prune', '--', remote])
      this.ctx.logger.info(`workbench-layout: fetched explicit Git remote ${JSON.stringify(remote)}`)
      return { operation, remote }
    }
    const status = await this.status(workspaceId)
    if (status.branch === undefined) {
      throw new WorkbenchHttpError(409, 'GIT_BRANCH_CURRENT_UNAVAILABLE', '游离 HEAD 状态下不能拉取或推送当前分支。')
    }
    const branch = await this.requireRefName(cwd, branchValue ?? status.branch)
    if (operation === 'pull') await this.run(cwd, ['pull', '--ff-only', '--', remote, branch])
    else await this.run(cwd, ['push', '--set-upstream', '--', remote, `${status.branch}:${branch}`])
    this.ctx.logger.info(`workbench-layout: completed explicit Git ${operation} with remote ${JSON.stringify(remote)} branch ${JSON.stringify(branch)}`)
    return { operation, remote, branch }
  }

  async commitFiles(workspaceId: unknown, revisionValue: unknown): Promise<GitCommitFiles> {
    const cwd = await this.repositoryRoot(workspaceId)
    const details = await this.loadCommitFiles(cwd, revisionValue)
    this.ctx.logger.info(`workbench-layout: listed files for Git commit ${details.commit.shortHash}`)
    return details
  }

  async commitFileDiff(workspaceId: unknown, revisionValue: unknown, pathValue: unknown): Promise<GitFileDiff> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    const cwd = await this.repositoryRoot(workspaceId)
    const details = await this.loadCommitFiles(cwd, revisionValue)
    const file = details.files.find(candidate => candidate.path === path)
    if (file === undefined) throw new WorkbenchHttpError(404, 'GIT_COMMIT_FILE_NOT_FOUND', '该提交中找不到所选文件。')
    if (file.originalPath !== undefined) await this.workspace.assertGitPath(workspaceId, file.originalPath)

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

  async comparisonFiles(workspaceId: unknown, revisionValue: unknown): Promise<GitCommitFiles> {
    const cwd = await this.repositoryRoot(workspaceId)
    const revision = requireRevision(revisionValue)
    const commit = await this.loadCommit(cwd, revision)
    const files = parseGitNameStatus((await this.run(cwd, [
      'diff', '--name-status', '-z', '--find-renames', '--find-copies', revision, '--',
    ])).stdout)
    const listed = new Set(files.map(file => file.path))
    const untracked = (await this.status(workspaceId)).files
      .filter(file => file.index === '?' && !listed.has(file.path))
      .map(file => ({ path: file.path, status: 'A' }))
    this.ctx.logger.info(`workbench-layout: compared Git commit ${commit.shortHash} with the current workspace`)
    return { commit, files: [...files, ...untracked] }
  }

  async comparisonFileDiff(workspaceId: unknown, revisionValue: unknown, pathValue: unknown): Promise<GitFileDiff> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    const cwd = await this.repositoryRoot(workspaceId)
    const details = await this.comparisonFiles(workspaceId, revisionValue)
    const file = details.files.find(candidate => candidate.path === path)
    if (file === undefined) throw new WorkbenchHttpError(404, 'GIT_CHANGE_NOT_FOUND', '该文件不在提交与当前工作区的比较中。')
    const original = await this.readGitBlobMaybe(cwd, `${details.commit.hash}:${file.originalPath ?? file.path}`)
    const modified = file.status === 'D' ? emptyGitText() : await this.workspace.readGitText(workspaceId, file.path)
    const stat = original.text === '' && !original.binary && file.status === 'A'
      ? modified.binary ? { path, binary: true } : { path, additions: contentLineCount(modified.text), deletions: 0, binary: false }
      : parseGitNumstat((await this.run(cwd, [
          'diff', '--numstat', '-z', '--find-renames', '--find-copies', details.commit.hash, '--',
          ...file.originalPath === undefined ? [file.path] : [file.originalPath, file.path],
        ])).stdout)[0]
    const binary = original.binary || modified.binary || stat?.binary === true
    this.ctx.logger.info(`workbench-layout: opened workspace comparison for ${details.commit.shortHash} ${JSON.stringify(path)}`)
    return {
      kind: 'comparison',
      path,
      ...(file.originalPath === undefined ? {} : { originalPath: file.originalPath }),
      status: normalizeStatus(file.status),
      revision: details.commit.hash,
      commit: details.commit,
      original: binary ? '' : original.text,
      modified: binary ? '' : modified.text,
      binary,
      ...(stat?.additions === undefined ? {} : { additions: stat.additions }),
      ...(stat?.deletions === undefined ? {} : { deletions: stat.deletions }),
    }
  }

  async commitAction(workspaceId: unknown, operationValue: unknown, revisionValue: unknown): Promise<GitCommitActionResult> {
    if (typeof operationValue !== 'string' || !COMMIT_ACTIONS.has(operationValue as GitCommitAction)) {
      throw new WorkbenchHttpError(400, 'GIT_COMMIT_ACTION_INVALID', '不支持该提交操作。')
    }
    const operation = operationValue as GitCommitAction
    const revision = requireRevision(revisionValue)
    const cwd = await this.repositoryRoot(workspaceId)
    const commit = await this.loadCommit(cwd, revision)
    if ((await this.status(workspaceId)).files.length > 0) {
      throw new WorkbenchHttpError(409, 'GIT_WORKTREE_NOT_CLEAN', '请先提交、暂存或放弃当前更改，再执行提交操作。')
    }
    try {
      const result = await this.run(cwd, operation === 'cherry-pick'
        ? ['cherry-pick', revision]
        : ['revert', '--no-edit', revision])
      const summary = result.stdout.trim().split(/\r?\n/u)[0] ?? `${operation} completed`
      this.ctx.logger.info(`workbench-layout: completed explicit Git ${operation} for ${commit.shortHash}`)
      return { operation, summary }
    } catch (error: unknown) {
      await this.run(cwd, [operation, '--abort'], [0, 128])
      this.ctx.logger.info(`workbench-layout: aborted conflicted Git ${operation} for ${commit.shortHash}`)
      throw error
    }
  }

  async stage(workspaceId: unknown, pathValue: unknown): Promise<GitStatus> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    const cwd = await this.repositoryRoot(workspaceId)
    await this.run(cwd, ['add', '--', path])
    this.ctx.logger.info(`workbench-layout: staged Git path ${JSON.stringify(path)}`)
    return this.status(workspaceId)
  }

  async stageAll(workspaceId: unknown): Promise<GitStatus> {
    const cwd = await this.repositoryRoot(workspaceId)
    await this.run(cwd, ['add', '-A', '--', '.'])
    this.ctx.logger.info('workbench-layout: staged all Git changes')
    return this.status(workspaceId)
  }

  async unstage(workspaceId: unknown, pathValue: unknown): Promise<GitStatus> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    const cwd = await this.repositoryRoot(workspaceId)
    if (await this.hasHead(cwd)) {
      await this.run(cwd, ['restore', '--staged', '--', path])
    } else {
      await this.run(cwd, ['rm', '--cached', '--ignore-unmatch', '--', path])
    }
    this.ctx.logger.info(`workbench-layout: unstaged Git path ${JSON.stringify(path)}`)
    return this.status(workspaceId)
  }

  async unstageAll(workspaceId: unknown): Promise<GitStatus> {
    const cwd = await this.repositoryRoot(workspaceId)
    if (await this.hasHead(cwd)) {
      await this.run(cwd, ['restore', '--staged', '--', '.'])
    } else {
      await this.run(cwd, ['rm', '--cached', '-r', '--ignore-unmatch', '--', '.'])
    }
    this.ctx.logger.info('workbench-layout: unstaged all Git changes')
    return this.status(workspaceId)
  }

  async discard(workspaceId: unknown, pathValue: unknown): Promise<GitStatus> {
    const path = await this.workspace.assertGitPath(workspaceId, pathValue)
    const cwd = await this.repositoryRoot(workspaceId)
    const file = (await this.status(workspaceId)).files.find(candidate => candidate.path === path)
    if (file === undefined || !hasWorktreeChange(file)) {
      throw new WorkbenchHttpError(404, 'GIT_CHANGE_NOT_WORKTREE', '该文件没有可放弃的工作区更改。')
    }
    if (file.index === '?') await this.run(cwd, ['clean', '-f', '--', path])
    else await this.run(cwd, ['restore', '--worktree', '--', path])
    this.ctx.logger.info(`workbench-layout: discarded Git worktree change for ${JSON.stringify(path)}`)
    return this.status(workspaceId)
  }

  async discardAll(workspaceId: unknown): Promise<GitStatus> {
    const cwd = await this.repositoryRoot(workspaceId)
    await this.run(cwd, ['restore', '--worktree', '--', '.'])
    await this.run(cwd, ['clean', '-fd', '--', '.'])
    this.ctx.logger.info('workbench-layout: discarded all Git worktree changes and untracked files')
    return this.status(workspaceId)
  }

  async commit(workspaceId: unknown, messageValue: unknown): Promise<GitCommitResult> {
    if (typeof messageValue !== 'string' || messageValue.trim() === '') {
      throw new WorkbenchHttpError(400, 'COMMIT_MESSAGE_REQUIRED', '请输入提交说明。')
    }
    const message = messageValue.trim()
    if (message.length > 5000) throw new WorkbenchHttpError(400, 'COMMIT_MESSAGE_TOO_LONG', '提交说明过长。')
    const cwd = await this.repositoryRoot(workspaceId)
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

  private async worktreeSides(workspaceId: unknown, cwd: string, file: GitFileStatus): Promise<[GitText, WorkspaceGitText]> {
    const conflict = isConflict(file)
    const original = file.index === '?'
      ? emptyGitText()
      : conflict
        ? await this.readGitBlobMaybe(cwd, `HEAD:${file.originalPath ?? file.path}`)
        : await this.readGitBlob(cwd, `:${file.originalPath ?? file.path}`)
    const modified = file.worktree === 'D'
      ? emptyGitText()
      : await this.workspace.readGitText(workspaceId, file.path)
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
    const commit = await this.loadCommit(cwd, revision)
    const parentRevision = commit.parents[0]
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

  private async loadCommit(cwd: string, revision: string): Promise<GitCommit> {
    const metadata = await this.run(cwd, [
      'show', '-s', '--date=iso-strict', '--decorate=full',
      '--format=%H%x00%h%x00%P%x00%an%x00%aI%x00%s%x00%D', revision,
    ])
    const commit = parseGitGraph(metadata.stdout)[0]
    if (commit === undefined) throw new WorkbenchHttpError(404, 'GIT_COMMIT_NOT_FOUND', '找不到该提交。')
    return commit
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

  private async repositoryRoot(workspaceId: unknown): Promise<string> {
    const workspace = await this.workspace.rootProcessPath(workspaceId)
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
    return await this.headRevision(cwd) !== undefined
  }

  private async headRevision(cwd: string): Promise<string | undefined> {
    const result = await this.run(cwd, ['rev-parse', '--verify', 'HEAD'], [0, 1, 128])
    const revision = result.stdout.trim()
    return result.exitCode === 0 && revision !== '' ? revision : undefined
  }

  private async requireBranchName(cwd: string, value: unknown): Promise<string> {
    if (typeof value !== 'string' || value.trim() === '' || value.length > 255) {
      throw new WorkbenchHttpError(400, 'GIT_BRANCH_NAME_INVALID', '请输入有效的分支名称。')
    }
    const name = value.trim()
    const valid = await this.run(cwd, ['check-ref-format', '--branch', name], [0, 1, 128])
    if (valid.exitCode !== 0) throw new WorkbenchHttpError(400, 'GIT_BRANCH_NAME_INVALID', '分支名称不符合 Git 规则。')
    const exists = await this.run(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], [0, 1, 128])
    if (exists.exitCode === 0) throw new WorkbenchHttpError(409, 'GIT_BRANCH_EXISTS', '同名本地分支已经存在。')
    return name
  }

  private async remoteNames(cwd: string): Promise<string[]> {
    return (await this.run(cwd, ['remote'])).stdout.split(/\r?\n/u).map(name => name.trim()).filter(name => name !== '')
  }

  private async requireRemote(cwd: string, value: unknown): Promise<string> {
    if (typeof value !== 'string' || value === '') {
      throw new WorkbenchHttpError(400, 'GIT_REMOTE_REQUIRED', '请选择远端。')
    }
    const name = (await this.remoteNames(cwd)).find(candidate => candidate === value)
    if (name === undefined) throw new WorkbenchHttpError(404, 'GIT_REMOTE_UNAVAILABLE', '找不到所选远端。')
    return name
  }

  private async requireRemoteName(cwd: string, value: unknown): Promise<string> {
    if (typeof value !== 'string' || value.trim() === '' || value.length > 255) {
      throw new WorkbenchHttpError(400, 'GIT_REMOTE_NAME_INVALID', '请输入有效的远端名称。')
    }
    const name = value.trim()
    const valid = await this.run(cwd, ['check-ref-format', `refs/remotes/${name}/probe`], [0, 1, 128])
    if (valid.exitCode !== 0) throw new WorkbenchHttpError(400, 'GIT_REMOTE_NAME_INVALID', '远端名称不符合 Git 规则。')
    if ((await this.remoteNames(cwd)).includes(name)) {
      throw new WorkbenchHttpError(409, 'GIT_REMOTE_EXISTS', '同名远端已经存在。')
    }
    return name
  }

  private async requireRefName(cwd: string, value: unknown): Promise<string> {
    if (typeof value !== 'string' || value.trim() === '' || value.length > 255) {
      throw new WorkbenchHttpError(400, 'GIT_BRANCH_NAME_INVALID', '请输入有效的远端分支名称。')
    }
    const name = value.trim()
    const valid = await this.run(cwd, ['check-ref-format', '--branch', name], [0, 1, 128])
    if (valid.exitCode !== 0) throw new WorkbenchHttpError(400, 'GIT_BRANCH_NAME_INVALID', '远端分支名称不符合 Git 规则。')
    return name
  }

  private async run(
    cwd: string,
    args: string[],
    acceptedExitCodes: readonly number[] = [0],
    environment: NodeJS.ProcessEnv = {},
  ): Promise<GitRunResult> {
    try {
      const result = await execFileAsync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        env: { ...nonInteractiveGitEnvironment(), ...environment },
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

function graphOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new WorkbenchHttpError(400, 'GIT_GRAPH_OFFSET_INVALID', '提交图分页位置无效。')
  }
  return value
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

function requireRemoteUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 4096 || /[\0\r\n]/u.test(value)) {
    throw new WorkbenchHttpError(400, 'GIT_REMOTE_URL_INVALID', '请输入有效的远端地址。')
  }
  return value.trim()
}

function requireOptionalRemoteUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireRemoteUrl(value)
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
