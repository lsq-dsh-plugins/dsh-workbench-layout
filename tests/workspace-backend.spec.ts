import { describe, expect, it, vi } from 'vitest'
import { lstat as inspectPath, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceBackend } from '../src/workspace-backend.ts'

function harness(overrides: Record<string, unknown> = {}, workspaceRoot = '/workspace') {
  const writeText = vi.fn(() => Promise.resolve({
    operation: 'update', version: 'next-version', before: 'old', after: 'new',
  }))
  const fs = {
    resolve: vi.fn((path: string, options?: { cwd?: string }) => Promise.resolve({
      targetKey: path === workspaceRoot ? workspaceRoot : `${options?.cwd ?? ''}/${path}`,
      displayPath: path,
    })),
    contains: vi.fn((_root, target: { targetKey: string }) => target.targetKey.startsWith(workspaceRoot)),
    lstat: vi.fn(() => Promise.resolve({ type: 'file', version: 'v1', size: 3 })),
    stat: vi.fn(() => Promise.resolve({ type: 'file', version: 'v1', size: 3 })),
    readText: vi.fn(() => Promise.resolve('old')),
    listDir: vi.fn(() => Promise.resolve([])),
    writeText,
    processPath: vi.fn(() => workspaceRoot),
    ...overrides,
  }
  const ctx = {
    fs,
    workspaceRegistry: {
      get: vi.fn((workspaceId: string) => workspaceId === 'workspace-1'
        ? { id: workspaceId, path: workspaceRoot, sessionIds: [] }
        : undefined),
    },
    logger: { info: vi.fn(), warn: vi.fn() },
  } as unknown as Context
  return {
    backend: new WorkspaceBackend(ctx, { maxFileBytes: 1024, maxDirectoryEntries: 100 }),
    fs,
    writeText,
    logger: (ctx as unknown as { logger: { info: ReturnType<typeof vi.fn> } }).logger,
  }
}

describe('WorkspaceBackend', () => {
  it('uses DSH version guards and workspace-write policy for saves', async () => {
    const { backend, writeText } = harness()
    await expect(backend.save('workspace-1', 'src/a.ts', 'new', 'v1')).resolves.toEqual({
      path: 'src/a.ts', version: 'next-version', size: 3,
    })
    expect(writeText).toHaveBeenCalledWith(
      expect.objectContaining({ targetKey: '/workspace/src/a.ts' }),
      'new',
      { kind: 'replaceIfVersion', version: 'v1' },
      undefined,
      { mode: 'workspace-write', workspaceRoot: '/workspace' },
    )
  })

  it('creates an empty file through DSH createIfAbsent and logs only its relative path', async () => {
    const { backend, writeText, logger } = harness({
      lstat: vi.fn((path: string) => Promise.resolve(path === 'src/new.ts' ? undefined : { type: 'directory' })),
      stat: vi.fn((target: { targetKey: string }) => Promise.resolve({
        type: target.targetKey === '/workspace/src' ? 'directory' : 'file',
      })),
    })

    await expect(backend.createFile('workspace-1', 'src/new.ts')).resolves.toEqual({
      name: 'new.ts', path: 'src/new.ts', kind: 'file', size: 0,
    })
    expect(writeText).toHaveBeenCalledWith(
      expect.objectContaining({ targetKey: '/workspace/src/new.ts' }),
      '',
      { kind: 'createIfAbsent' },
      undefined,
      { mode: 'workspace-write', workspaceRoot: '/workspace' },
    )
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('src/new.ts'))
  })

  it('creates one directory level only after validating its Workspace parent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-workbench-create-'))
    try {
      const { backend, logger } = harness({
        lstat: vi.fn((path: string) => Promise.resolve(path === 'docs' ? undefined : { type: 'directory' })),
        stat: vi.fn(() => Promise.resolve({ type: 'directory' })),
        processPath: vi.fn((target: { targetKey: string }) => join(directory, target.targetKey.slice('/workspace/'.length))),
      })

      await expect(backend.createDirectory('workspace-1', 'docs')).resolves.toEqual({
        name: 'docs', path: 'docs', kind: 'directory',
      })
      await expect(stat(join(directory, 'docs'))).resolves.toMatchObject({})
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('docs'))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not replace an existing entry during creation', async () => {
    const { backend, writeText } = harness()
    await expect(backend.createFile('workspace-1', 'existing.txt')).rejects.toMatchObject({
      status: 409,
      code: 'FS_ALREADY_EXISTS',
    })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('renames, resolves and recursively deletes validated entries without logging absolute paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-workbench-mutate-'))
    try {
      await mkdir(join(directory, 'docs', 'nested'), { recursive: true })
      await writeFile(join(directory, 'docs', 'nested', 'old.txt'), 'content')
      const info = async (absolutePath: string) => {
        try {
          const value = await inspectPath(absolutePath)
          return { type: value.isDirectory() ? 'directory' : 'file', size: value.size, version: 'v1' }
        } catch (error: unknown) {
          if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
          throw error
        }
      }
      const { backend, logger } = harness({
        resolve: vi.fn((path: string, options?: { cwd?: string }) => Promise.resolve({
          targetKey: path === directory ? directory : join(options?.cwd ?? directory, path),
          displayPath: path,
        })),
        contains: vi.fn((root: { targetKey: string }, target: { targetKey: string }) => (
          target.targetKey === root.targetKey || target.targetKey.startsWith(`${root.targetKey}${sep}`)
        )),
        lstat: vi.fn((path: string, options?: { cwd?: string }) => info(join(options?.cwd ?? directory, path))),
        stat: vi.fn((target: { targetKey: string }) => info(target.targetKey)),
        processPath: vi.fn((target: { targetKey: string }) => target.targetKey),
      }, directory)

      await expect(backend.renameEntry('workspace-1', 'docs/nested/old.txt', 'new.txt')).resolves.toEqual({
        from: 'docs/nested/old.txt', path: 'docs/nested/new.txt', name: 'new.txt', kind: 'file',
      })
      await expect(stat(join(directory, 'docs', 'nested', 'new.txt'))).resolves.toMatchObject({})
      await expect(backend.absolutePath('workspace-1', 'docs/nested/new.txt')).resolves.toEqual({
        path: 'docs/nested/new.txt', absolutePath: join(directory, 'docs', 'nested', 'new.txt'),
      })
      await expect(backend.deleteEntry('workspace-1', 'docs')).resolves.toEqual({ path: 'docs', kind: 'directory' })
      await expect(stat(join(directory, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' })
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain(directory)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('protects the Workspace root and Git metadata from file-menu mutations', async () => {
    const { backend } = harness({
      lstat: vi.fn(() => Promise.resolve({ type: 'directory' })),
      stat: vi.fn(() => Promise.resolve({ type: 'directory' })),
    })
    await expect(backend.deleteEntry('workspace-1', '')).rejects.toMatchObject({ code: 'WORKSPACE_ROOT_PROTECTED' })
    await expect(backend.renameEntry('workspace-1', '.git/config', 'other')).rejects.toMatchObject({ code: 'WORKSPACE_METADATA_PROTECTED' })
  })

  it('rejects a resolved target outside the registered Workspace', async () => {
    const { backend } = harness({
      resolve: vi.fn((path: string) => Promise.resolve({
        targetKey: path === '/workspace' ? '/workspace' : '/outside/file',
        displayPath: path,
      })),
    })
    await expect(backend.read('workspace-1', 'escape.txt')).rejects.toMatchObject({ code: 'WORKSPACE_ESCAPE' })
  })

  it('rejects symbolic-link files even when their resolved target is contained', async () => {
    const { backend } = harness({
      lstat: vi.fn(() => Promise.resolve({ type: 'symlink', version: 'v1' })),
    })
    await expect(backend.read('workspace-1', 'linked.txt')).rejects.toMatchObject({ code: 'SYMLINK_UNSUPPORTED' })
  })

  it('identifies binary Git content without returning its bytes', async () => {
    const { backend } = harness({
      readText: vi.fn(() => Promise.reject(Object.assign(new Error('binary'), { code: 'FS_NOT_TEXT' }))),
    })
    await expect(backend.readGitText('workspace-1', 'image.png')).resolves.toEqual({ text: '', binary: true })
  })

  it('enforces the file limit before reading Git content', async () => {
    const readText = vi.fn(() => Promise.resolve('too large'))
    const { backend } = harness({
      stat: vi.fn(() => Promise.resolve({ type: 'file', version: 'v1', size: 2048 })),
      readText,
    })
    await expect(backend.readGitText('workspace-1', 'large.txt')).rejects.toMatchObject({ code: 'GIT_DIFF_TOO_LARGE' })
    expect(readText).not.toHaveBeenCalled()
  })

  it('rejects an id that is not present in the official Workspace registry', async () => {
    const { backend } = harness()
    await expect(backend.read('missing-workspace', 'a.txt')).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
    })
  })
})
