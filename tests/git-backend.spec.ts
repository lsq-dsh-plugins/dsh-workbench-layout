import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { GitBackend, parseGitHistory, parsePorcelainStatus } from '../src/git-backend.ts'
import type { WorkspaceBackend } from '../src/workspace-backend.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Git status parser', () => {
  it('parses ordinary, untracked, and renamed NUL records', () => {
    expect(parsePorcelainStatus(' M src/a.ts\0?? new.md\0R  dst.ts\0src.ts\0')).toEqual([
      { path: 'src/a.ts', index: ' ', worktree: 'M' },
      { path: 'new.md', index: '?', worktree: '?' },
      { path: 'dst.ts', originalPath: 'src.ts', index: 'R', worktree: ' ' },
    ])
  })

  it('parses stable Git log fields and rejects malformed records', () => {
    const hash = 'a'.repeat(40)
    const record = [hash, 'abc1234', 'Tester', '2026-08-23T10:00:00+08:00', 'Refine UI'].join('\0')
    expect(parseGitHistory(`${record}\n`)).toEqual([{
      hash, shortHash: 'abc1234', author: 'Tester', authoredAt: '2026-08-23T10:00:00+08:00', subject: 'Refine UI',
    }])
    expect(() => parseGitHistory('malformed')).toThrow(/提交历史/u)
  })
})

describe('GitBackend', () => {
  it('stages and commits only after explicit calls', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workbench-test-'))
    temporaryDirectories.push(root)
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'workbench@example.invalid'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'Workbench Test'], { cwd: root })
    await writeFile(join(root, 'note.txt'), 'one\n')

    const logger = { info: vi.fn(), warn: vi.fn() }
    const workspace = {
      rootProcessPath: vi.fn(() => Promise.resolve({ cwd: root, sessionId: 'session-1' })),
      assertGitPath: vi.fn((_sessionId, path) => Promise.resolve(String(path))),
    } as unknown as WorkspaceBackend
    const backend = new GitBackend({ logger } as unknown as Context, workspace, {
      timeoutMs: 10_000,
      maxOutputBytes: 1024 * 1024,
    })

    expect((await backend.status('session-1')).files[0]).toMatchObject({ path: 'note.txt', index: '?', worktree: '?' })
    const untrackedDiff = await backend.diff('session-1', 'note.txt', false)
    expect(untrackedDiff).toMatchObject({ kind: 'worktree', path: 'note.txt' })
    expect(untrackedDiff.text).toContain('+one')

    const staged = await backend.stage('session-1', 'note.txt')
    expect(staged.files[0]).toMatchObject({ path: 'note.txt', index: 'A', worktree: ' ' })
    const unstaged = await backend.unstage('session-1', 'note.txt')
    expect(unstaged.files[0]).toMatchObject({ path: 'note.txt', index: '?', worktree: '?' })
    await backend.stage('session-1', 'note.txt')
    const committed = await backend.commit('session-1', '添加说明')
    expect(committed.summary).toContain('添加说明')
    expect((await backend.status('session-1')).files).toEqual([])
    const history = await backend.history('session-1')
    expect(history).toMatchObject({ truncated: false, commits: [{ subject: '添加说明', author: 'Workbench Test' }] })
    const historicalDiff = await backend.commitDiff('session-1', history.commits[0]?.hash)
    expect(historicalDiff).toMatchObject({ kind: 'commit', title: '添加说明' })
    expect(historicalDiff.text).toContain('+one')
    expect(logger.info).toHaveBeenCalledWith('workbench-layout: Git commit created from explicit user action')
  })
})
