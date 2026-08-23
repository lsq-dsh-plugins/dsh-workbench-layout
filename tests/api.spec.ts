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
    await api.gitStatus('workspace-1')

    const fileRequest = fetch.mock.calls[0]?.[1] as RequestInit
    const gitRequest = fetch.mock.calls[1]?.[1] as RequestInit
    expect(JSON.parse(String(fileRequest.body))).toEqual({ workspaceId: 'workspace-1', path: 'src' })
    expect(JSON.parse(String(gitRequest.body))).toEqual({ workspaceId: 'workspace-1' })
    expect(`${String(fileRequest.body)}${String(gitRequest.body)}`).not.toContain('sessionId')
  })
})
