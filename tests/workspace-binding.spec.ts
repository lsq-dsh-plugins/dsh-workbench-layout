import { describe, expect, it } from 'vitest'
import { workspaceIdForSession } from '../src/client/workspace-binding.ts'

describe('Workspace membership binding', () => {
  const workspaces = [
    { workspaceId: 'workspace-a', sessionIds: ['session-a1', 'session-a2'] },
    { workspaceId: 'workspace-b', sessionIds: ['session-b1'] },
  ]

  it('maps multiple Sessions in one Workspace to the same stable id', () => {
    expect(workspaceIdForSession(workspaces, 'session-a1')).toBe('workspace-a')
    expect(workspaceIdForSession(workspaces, 'session-a2')).toBe('workspace-a')
  })

  it('does not invent a path or Workspace id for an unaccounted Session', () => {
    expect(workspaceIdForSession(workspaces, 'session-missing')).toBeUndefined()
    expect(workspaceIdForSession(workspaces, undefined)).toBeUndefined()
  })
})
