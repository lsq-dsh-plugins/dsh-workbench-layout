import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceBackend } from '../src/workspace-backend.ts'

function harness(overrides: Record<string, unknown> = {}) {
  const writeText = vi.fn(() => Promise.resolve({
    operation: 'update', version: 'next-version', before: 'old', after: 'new',
  }))
  const fs = {
    resolve: vi.fn((path: string, options?: { cwd?: string }) => Promise.resolve({
      targetKey: path === '/workspace' ? '/workspace' : `${options?.cwd ?? ''}/${path}`,
      displayPath: path,
    })),
    contains: vi.fn((_root, target: { targetKey: string }) => target.targetKey.startsWith('/workspace')),
    lstat: vi.fn(() => Promise.resolve({ type: 'file', version: 'v1', size: 3 })),
    stat: vi.fn(() => Promise.resolve({ type: 'file', version: 'v1', size: 3 })),
    readText: vi.fn(() => Promise.resolve('old')),
    listDir: vi.fn(() => Promise.resolve([])),
    writeText,
    processPath: vi.fn(() => '/workspace'),
    ...overrides,
  }
  const ctx = {
    fs,
    sessions: { get: vi.fn(() => ({ header: { cwd: '/workspace' } })) },
    logger: { info: vi.fn(), warn: vi.fn() },
  } as unknown as Context
  return { backend: new WorkspaceBackend(ctx, { maxFileBytes: 1024, maxDirectoryEntries: 100 }), fs, writeText }
}

describe('WorkspaceBackend', () => {
  it('uses DSH version guards and workspace-write policy for saves', async () => {
    const { backend, writeText } = harness()
    await expect(backend.save('session-1', 'src/a.ts', 'new', 'v1')).resolves.toEqual({
      path: 'src/a.ts', version: 'next-version', size: 3,
    })
    expect(writeText).toHaveBeenCalledWith(
      expect.objectContaining({ targetKey: '/workspace/src/a.ts' }),
      'new',
      { kind: 'replaceIfVersion', version: 'v1' },
      undefined,
      { mode: 'workspace-write', workspaceRoot: '/workspace', sessionId: 'session-1' },
    )
  })

  it('rejects a resolved target outside the Session workspace', async () => {
    const { backend } = harness({
      resolve: vi.fn((path: string) => Promise.resolve({
        targetKey: path === '/workspace' ? '/workspace' : '/outside/file',
        displayPath: path,
      })),
    })
    await expect(backend.read('session-1', 'escape.txt')).rejects.toMatchObject({ code: 'WORKSPACE_ESCAPE' })
  })

  it('rejects symbolic-link files even when their resolved target is contained', async () => {
    const { backend } = harness({
      lstat: vi.fn(() => Promise.resolve({ type: 'symlink', version: 'v1' })),
    })
    await expect(backend.read('session-1', 'linked.txt')).rejects.toMatchObject({ code: 'SYMLINK_UNSUPPORTED' })
  })
})
