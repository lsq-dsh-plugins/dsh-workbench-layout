/** Resolve the official Workspace that owns the current DSH Session. */

export interface WorkspaceMembership {
  workspaceId: string
  sessionIds: readonly string[]
}

/** Return the stable Workspace id for a Session, never a path-derived alias. */
export function workspaceIdForSession(
  workspaces: readonly WorkspaceMembership[],
  sessionId: string | undefined,
): string | undefined {
  if (sessionId === undefined) return undefined
  return workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
}
