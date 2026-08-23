import { describe, expect, it } from 'vitest'
import { resolveWorkbenchWorkspace, resolveWorkbenchWorkspaceId } from '../src/client/workspace-binding.ts'

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

  it('returns the complete official Workspace projection for display metadata', () => {
    const projections = [
      { workspaceId: 'workspace-a', path: '/workspace/alpha', title: 'alpha', sessionIds: ['session-a1'] },
      { workspaceId: 'workspace-b', path: '/workspace/beta', title: 'beta', sessionIds: [] },
    ]
    expect(resolveWorkbenchWorkspace(projections, 'session-a1', 'workspace-b')).toBe(projections[0])
    expect(resolveWorkbenchWorkspace(projections, undefined, 'workspace-b')?.path).toBe('/workspace/beta')
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
