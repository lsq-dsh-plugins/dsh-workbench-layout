/** Bind the workbench's Workspace state to DSH's native details column. */

export interface WorkbenchWorkspaceController {
  setWorkspace(workspaceId: string | undefined): void
}

export interface WorkbenchDetailsLayout {
  openDetails(): void
}

export interface WorkbenchWorkspaceLogger {
  info(message: string): void
}

/** Create the stable callback used by the editor's Workspace binding effect. */
export function createWorkbenchWorkspaceActivator(
  controller: WorkbenchWorkspaceController,
  layout: WorkbenchDetailsLayout,
  logger: WorkbenchWorkspaceLogger,
): (workspaceId: string | undefined) => void {
  return (workspaceId): void => {
    controller.setWorkspace(workspaceId)
    layout.openDetails()
    logger.info(workspaceId === undefined
      ? 'workbench-layout: activated native AppFrame details track without an available registered workspace'
      : `workbench-layout: activated native AppFrame details track for workspace ${JSON.stringify(workspaceId)}`)
  }
}
