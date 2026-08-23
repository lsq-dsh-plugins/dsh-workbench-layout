/** Resolve the official Workspace that should own the workbench surfaces. */

export interface WorkspaceMembership {
  workspaceId: string
  sessionIds: readonly string[]
}

/** Resolve the complete official Workspace projection for display metadata. */
export function resolveWorkbenchWorkspace<T extends WorkspaceMembership>(
  workspaces: readonly T[],
  sessionId: string | undefined,
  recentWorkspaceId: string | undefined,
): T | undefined {
  const sessionWorkspace = sessionId === undefined
    ? undefined
    : workspaces.find(workspace => workspace.sessionIds.includes(sessionId))
  if (sessionWorkspace !== undefined) return sessionWorkspace
  return workspaces.find(workspace => workspace.workspaceId === recentWorkspaceId)
}

/**
 * Follow the current Session's Workspace when it has one, then use DSH's
 * official recent-Workspace projection for the no-Session and blank-Session
 * surfaces. Never derive an identity from a filesystem path.
 */
export function resolveWorkbenchWorkspaceId(
  workspaces: readonly WorkspaceMembership[],
  sessionId: string | undefined,
  recentWorkspaceId: string | undefined,
): string | undefined {
  return resolveWorkbenchWorkspace(workspaces, sessionId, recentWorkspaceId)?.workspaceId
}
