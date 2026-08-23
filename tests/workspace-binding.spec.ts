import { describe, expect, it } from 'vitest'
import { resolveWorkbenchWorkspaceId } from '../src/client/workspace-binding.ts'

describe('Workspace membership binding', () => {
  const workspaces = [
    { workspaceId: 'workspace-a', sessionIds: ['session-a1', 'session-a2'] },
    { workspaceId: 'workspace-b', sessionIds: ['session-b1'] },
  ]

  it('maps multiple Sessions in one Workspace to the same stable id', () => {
    expect(resolveWorkbenchWorkspaceId(workspaces, 'session-a1', 'workspace-b')).toBe('workspace-a')
    expect(resolveWorkbenchWorkspaceId(workspaces, 'session-a2', 'workspace-b')).toBe('workspace-a')
  })

  it('uses the official recent Workspace when there is no current Session', () => {
    expect(resolveWorkbenchWorkspaceId(workspaces, undefined, 'workspace-b')).toBe('workspace-b')
  })

  it('keeps a Workspace with no Session usable before its first message', () => {
    const emptyWorkspace = [{ workspaceId: 'workspace-empty', sessionIds: [] }]
    expect(resolveWorkbenchWorkspaceId(emptyWorkspace, undefined, 'workspace-empty')).toBe('workspace-empty')
    expect(resolveWorkbenchWorkspaceId(emptyWorkspace, 'blank-session', 'workspace-empty')).toBe('workspace-empty')
  })

  it('falls back for an unaccounted Session without accepting an unknown Workspace id', () => {
    expect(resolveWorkbenchWorkspaceId(workspaces, 'session-missing', 'workspace-b')).toBe('workspace-b')
    expect(resolveWorkbenchWorkspaceId(workspaces, undefined, 'workspace-missing')).toBeUndefined()
  })
})
