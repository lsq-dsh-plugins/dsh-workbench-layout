/** Resolve the official Workspace that should own the workbench surfaces. */

export interface WorkspaceMembership {
  workspaceId: string
  sessionIds: readonly string[]
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
  const sessionWorkspaceId = sessionId === undefined
    ? undefined
    : workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
  if (sessionWorkspaceId !== undefined) return sessionWorkspaceId
  return workspaces.some(workspace => workspace.workspaceId === recentWorkspaceId)
    ? recentWorkspaceId
    : undefined
}
