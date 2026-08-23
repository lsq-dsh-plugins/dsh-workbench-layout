import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchApi } from '../src/client/api.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('Workbench browser API', () => {
  it('addresses file and Git requests by official Workspace id', async () => {
    const fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ path: '', entries: [], truncated: false }),
    }))
    vi.stubGlobal('fetch', fetch)
    const api = new WorkbenchApi()

    await api.listDirectory('workspace-1', 'src')
    await api.createFile('workspace-1', 'src/new.ts')
    await api.createDirectory('workspace-1', 'docs')
    await api.renameEntry('workspace-1', 'docs', 'notes')
    await api.deleteEntry('workspace-1', 'notes')
    await api.absolutePath('workspace-1', 'README.md')
    await api.gitStatus('workspace-1')
    await api.gitGraph('workspace-1')

    const fileRequest = fetch.mock.calls[0]?.[1] as RequestInit
    const createFileRequest = fetch.mock.calls[1]?.[1] as RequestInit
    const createDirectoryRequest = fetch.mock.calls[2]?.[1] as RequestInit
    const renameRequest = fetch.mock.calls[3]?.[1] as RequestInit
    const deleteRequest = fetch.mock.calls[4]?.[1] as RequestInit
    const absoluteRequest = fetch.mock.calls[5]?.[1] as RequestInit
    const gitRequest = fetch.mock.calls[6]?.[1] as RequestInit
    expect(fetch.mock.calls[1]?.[0]).toBe('/dsh-workbench-layout/file/create')
    expect(fetch.mock.calls[2]?.[0]).toBe('/dsh-workbench-layout/directory/create')
    expect(fetch.mock.calls[3]?.[0]).toBe('/dsh-workbench-layout/entry/rename')
    expect(fetch.mock.calls[4]?.[0]).toBe('/dsh-workbench-layout/entry/delete')
    expect(fetch.mock.calls[5]?.[0]).toBe('/dsh-workbench-layout/path/absolute')
    expect(fetch.mock.calls[7]?.[0]).toBe('/dsh-workbench-layout/git/graph')
    expect(JSON.parse(String(fileRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'src' })
    expect(JSON.parse(String(createFileRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'src/new.ts' })
    expect(JSON.parse(String(createDirectoryRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'docs' })
    expect(JSON.parse(String(renameRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'docs', name: 'notes' })
    expect(JSON.parse(String(deleteRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'notes' })
    expect(JSON.parse(String(absoluteRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'README.md' })
    expect(JSON.parse(String(gitRequest.body))).toEqual({ workspaceId: 'workspace-1' })
    expect(`${String(fileRequest.body)}${String(gitRequest.body)}`).not.toContain('sessionId')
  })
})
