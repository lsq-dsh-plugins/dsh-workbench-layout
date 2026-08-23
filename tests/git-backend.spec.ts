import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  GitBackend,
  parseGitBranches,
  parseGitHistory,
  parseGitNameStatus,
  parseGitNumstat,
  parsePorcelainStatus,
} from '../src/git-backend.ts'
import type { WorkspaceBackend } from '../src/workspace-backend.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Git output parsers', () => {
  it('parses status, history, renamed files, and binary statistics', () => {
    expect(parsePorcelainStatus(' M src/a.ts\0?? new.md\0R  dst.ts\0src.ts\0')).toEqual([
      { path: 'src/a.ts', index: ' ', worktree: 'M' },
      { path: 'new.md', index: '?', worktree: '?' },
      { path: 'dst.ts', originalPath: 'src.ts', index: 'R', worktree: ' ' },
    ])

    const hash = 'a'.repeat(40)
    const record = [
      hash, 'abc1234', 'Tester', '2026-08-23T10:00:00+08:00', 'Refine UI',
      'HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1',
    ].join('\0')
    expect(parseGitHistory(`${record}\n`)).toEqual([{
      hash, shortHash: 'abc1234', author: 'Tester', authoredAt: '2026-08-23T10:00:00+08:00', subject: 'Refine UI',
      references: [
        { name: 'main', kind: 'head' },
        { name: 'origin/main', kind: 'remote' },
        { name: 'v1', kind: 'tag' },
      ],
    }])
    expect(() => parseGitHistory('malformed')).toThrow(/提交历史/u)

    expect(parseGitNameStatus('R100\0old.ts\0new.ts\0M\0same.ts\0')).toEqual([
      { path: 'new.ts', originalPath: 'old.ts', status: 'R' },
      { path: 'same.ts', status: 'M' },
    ])
    const numstat = ['3\t2\tsame.ts', '-\t-\tasset.bin', '1\t0\t', 'old.ts', 'new.ts', ''].join('\0')
    expect(parseGitNumstat(numstat)).toEqual([
      { path: 'same.ts', additions: 3, deletions: 2, binary: false },
      { path: 'asset.bin', binary: true },
      { path: 'new.ts', originalPath: 'old.ts', additions: 1, deletions: 0, binary: false },
    ])

    const branches = [
      ['refs/heads/main', 'main', '*', 'origin/main', ''].join('\0'),
      ['refs/heads/topic', 'topic', ' ', '', ''].join('\0'),
      ['refs/remotes/origin/HEAD', 'origin/HEAD', ' ', '', 'refs/remotes/origin/main'].join('\0'),
      ['refs/remotes/origin/main', 'origin/main', ' ', '', ''].join('\0'),
    ].join('\n')
    expect(parseGitBranches(`${branches}\n`)).toEqual([
      { ref: 'refs/heads/main', name: 'main', kind: 'local', current: true, upstream: 'origin/main' },
      { ref: 'refs/heads/topic', name: 'topic', kind: 'local', current: false },
      { ref: 'refs/remotes/origin/main', name: 'origin/main', kind: 'remote', current: false },
    ])
  })
})

describe('GitBackend single-file diffs', () => {
  it('stages, commits, and reads one root-commit file as before/after content', async () => {
    const fixture = await createRepository()
    await writeFile(join(fixture.root, 'note.txt'), 'one\n')

    expect((await fixture.backend.status('session-1')).files[0]).toMatchObject({ path: 'note.txt', index: '?', worktree: '?' })
    const untracked = await fixture.backend.diff('session-1', 'note.txt', false)
    expect(untracked).toMatchObject({
      kind: 'worktree', path: 'note.txt', status: 'U', original: '', modified: 'one\n',
      additions: 1, deletions: 0, binary: false,
    })

    const staged = await fixture.backend.stage('session-1', 'note.txt')
    expect(staged.files[0]).toMatchObject({ path: 'note.txt', index: 'A', worktree: ' ' })
    const stagedDiff = await fixture.backend.diff('session-1', 'note.txt', true)
    expect(stagedDiff).toMatchObject({ original: '', modified: 'one\n', status: 'A' })

    const unstaged = await fixture.backend.unstage('session-1', 'note.txt')
    expect(unstaged.files[0]).toMatchObject({ path: 'note.txt', index: '?', worktree: '?' })
    await fixture.backend.stage('session-1', 'note.txt')
    const committed = await fixture.backend.commit('session-1', '添加说明')
    expect(committed.summary).toContain('添加说明')
    expect((await fixture.backend.status('session-1')).files).toEqual([])

    const history = await fixture.backend.history('session-1')
    const revision = history.commits[0]?.hash
    expect(history).toMatchObject({ truncated: false, commits: [{ subject: '添加说明', author: 'Workbench Test' }] })
    const files = await fixture.backend.commitFiles('session-1', revision)
    expect(files).toMatchObject({ files: [{ path: 'note.txt', status: 'A' }] })
    const historical = await fixture.backend.commitFileDiff('session-1', revision, 'note.txt')
    expect(historical).toMatchObject({
      kind: 'commit', path: 'note.txt', status: 'A', original: '', modified: 'one\n', binary: false,
    })
    expect(fixture.logger.info).toHaveBeenCalledWith('workbench-layout: Git commit created from explicit user action')
  })

  it('returns index/worktree sides and handles historical rename plus staged deletion', async () => {
    const fixture = await createRepository()
    await writeFile(join(fixture.root, 'alpha.txt'), 'before\n')
    await writeFile(join(fixture.root, 'old-name.txt'), 'legacy\n')
    git(fixture.root, ['add', '.'])
    git(fixture.root, ['commit', '--quiet', '-m', 'baseline'])

    await writeFile(join(fixture.root, 'alpha.txt'), 'before\nafter\n')
    const worktree = await fixture.backend.diff('session-1', 'alpha.txt', false)
    expect(worktree).toMatchObject({
      kind: 'worktree', original: 'before\n', modified: 'before\nafter\n', additions: 1, deletions: 0,
    })
    await fixture.backend.stage('session-1', 'alpha.txt')
    const staged = await fixture.backend.diff('session-1', 'alpha.txt', true)
    expect(staged).toMatchObject({
      kind: 'staged', original: 'before\n', modified: 'before\nafter\n', additions: 1, deletions: 0,
    })
    await fixture.backend.commit('session-1', 'modify alpha')

    await rename(join(fixture.root, 'old-name.txt'), join(fixture.root, 'new-name.txt'))
    git(fixture.root, ['add', '-A'])
    await fixture.backend.commit('session-1', 'rename file')
    const renameCommit = (await fixture.backend.history('session-1')).commits[0]
    const renameFiles = await fixture.backend.commitFiles('session-1', renameCommit?.hash)
    expect(renameFiles.files).toEqual([{ path: 'new-name.txt', originalPath: 'old-name.txt', status: 'R' }])
    const renamed = await fixture.backend.commitFileDiff('session-1', renameCommit?.hash, 'new-name.txt')
    expect(renamed).toMatchObject({
      path: 'new-name.txt', originalPath: 'old-name.txt', status: 'R', original: 'legacy\n', modified: 'legacy\n',
    })

    await unlink(join(fixture.root, 'new-name.txt'))
    git(fixture.root, ['add', '-A'])
    const deleted = await fixture.backend.diff('session-1', 'new-name.txt', true)
    expect(deleted).toMatchObject({ status: 'D', original: 'legacy\n', modified: '', deletions: 1 })
  })

  it('marks binary files without returning their bytes', async () => {
    const fixture = await createRepository()
    await writeFile(join(fixture.root, 'asset.bin'), Buffer.from([0, 1, 2, 3]))
    const diff = await fixture.backend.diff('session-1', 'asset.bin', false)
    expect(diff).toMatchObject({ path: 'asset.bin', binary: true, original: '', modified: '' })
  })

  it('lists and switches local and remote branches without accepting arbitrary refs', async () => {
    const fixture = await createRepository()
    await writeFile(join(fixture.root, 'base.txt'), 'base\n')
    git(fixture.root, ['add', '.'])
    git(fixture.root, ['commit', '--quiet', '-m', 'baseline'])
    git(fixture.root, ['branch', 'topic'])

    const local = await fixture.backend.branches('session-1')
    expect(local).toMatchObject({ current: 'main', detached: false })
    expect(local.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'refs/heads/main', current: true }),
      expect.objectContaining({ ref: 'refs/heads/topic', current: false }),
    ]))
    await expect(fixture.backend.switchBranch('session-1', 'refs/heads/missing')).rejects.toMatchObject({
      code: 'GIT_BRANCH_NOT_FOUND',
    })
    await expect(fixture.backend.switchBranch('session-1', 'refs/heads/topic')).resolves.toMatchObject({ branch: 'topic' })

    const remote = await createBareRepository()
    git(fixture.root, ['remote', 'add', 'origin', remote])
    await expect(fixture.backend.remoteOperation('session-1', 'push')).resolves.toEqual({ operation: 'push' })
    await expect(fixture.backend.status('session-1')).resolves.toMatchObject({ upstream: 'origin/topic' })
    git(fixture.root, ['push', '--quiet', 'origin', 'main:main'])
    git(fixture.root, ['branch', '-D', 'main'])
    git(fixture.root, ['fetch', '--quiet', 'origin'])
    const remoteBranch = (await fixture.backend.branches('session-1')).branches
      .find(branch => branch.ref === 'refs/remotes/origin/main')
    expect(remoteBranch).toMatchObject({ name: 'origin/main', kind: 'remote' })
    await expect(fixture.backend.switchBranch('session-1', remoteBranch?.ref)).resolves.toMatchObject({ branch: 'main' })
  })

  it('fetches, pulls, pushes, and syncs against an isolated local remote', async () => {
    const fixture = await createRepository()
    await writeFile(join(fixture.root, 'shared.txt'), 'base\n')
    git(fixture.root, ['add', '.'])
    git(fixture.root, ['commit', '--quiet', '-m', 'baseline'])
    const remote = await createBareRepository()
    git(fixture.root, ['remote', 'add', 'origin', remote])
    git(fixture.root, ['push', '--quiet', '--set-upstream', 'origin', 'main'])

    const peer = await mkdtemp(join(tmpdir(), 'dsh-workbench-peer-'))
    temporaryDirectories.push(peer)
    git(peer, ['clone', '--quiet', remote, '.'])
    configureIdentity(peer)
    await writeFile(join(peer, 'shared.txt'), 'from peer\n')
    git(peer, ['add', '.'])
    git(peer, ['commit', '--quiet', '-m', 'peer update'])
    git(peer, ['push', '--quiet'])

    await expect(fixture.backend.remoteOperation('session-1', 'fetch')).resolves.toEqual({ operation: 'fetch' })
    await expect(fixture.backend.status('session-1')).resolves.toMatchObject({
      branch: 'main', upstream: 'origin/main', ahead: 0, behind: 1, hasRemote: true,
    })
    await expect(fixture.backend.remoteOperation('session-1', 'pull')).resolves.toEqual({ operation: 'pull' })
    await expect(readFile(join(fixture.root, 'shared.txt'), 'utf8')).resolves.toBe('from peer\n')

    await writeFile(join(fixture.root, 'local.txt'), 'local\n')
    git(fixture.root, ['add', '.'])
    await fixture.backend.commit('session-1', 'local update')
    await expect(fixture.backend.remoteOperation('session-1', 'push')).resolves.toEqual({ operation: 'push' })
    await expect(fixture.backend.status('session-1')).resolves.toMatchObject({ ahead: 0, behind: 0 })

    git(peer, ['pull', '--quiet', '--ff-only'])
    await writeFile(join(peer, 'sync.txt'), 'sync\n')
    git(peer, ['add', '.'])
    git(peer, ['commit', '--quiet', '-m', 'sync update'])
    git(peer, ['push', '--quiet'])
    await expect(fixture.backend.remoteOperation('session-1', 'sync')).resolves.toEqual({ operation: 'sync' })
    await expect(readFile(join(fixture.root, 'sync.txt'), 'utf8')).resolves.toBe('sync\n')
    expect(fixture.logger.info).toHaveBeenCalledWith('workbench-layout: completed explicit Git remote operation sync')
  })
})

async function createRepository(): Promise<{
  root: string
  backend: GitBackend
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workbench-test-'))
  temporaryDirectories.push(root)
  git(root, ['init', '--quiet', '--initial-branch=main'])
  configureIdentity(root)
  const logger = { info: vi.fn(), warn: vi.fn() }
  const workspace = {
    rootProcessPath: vi.fn(() => Promise.resolve({ cwd: root, sessionId: 'session-1' })),
    assertGitPath: vi.fn((_sessionId, path) => Promise.resolve(String(path))),
    readGitText: vi.fn(async (_sessionId, pathValue) => {
      const bytes = await readFile(join(root, String(pathValue)))
      if (bytes.includes(0)) return { text: '', binary: true }
      try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false }
      } catch {
        return { text: '', binary: true }
      }
    }),
  } as unknown as WorkspaceBackend
  const backend = new GitBackend({ logger } as unknown as Context, workspace, {
    timeoutMs: 10_000,
    maxOutputBytes: 1024 * 1024,
  })
  return { root, backend, logger }
}

async function createBareRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workbench-remote-'))
  temporaryDirectories.push(root)
  git(root, ['init', '--bare', '--quiet', '--initial-branch=main'])
  return root
}

function configureIdentity(root: string): void {
  git(root, ['config', 'user.email', 'workbench@example.invalid'])
  git(root, ['config', 'user.name', 'Workbench Test'])
}

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root })
}
