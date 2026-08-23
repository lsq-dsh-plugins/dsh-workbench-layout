/** Bind the workbench's Workspace state to DSH's native details column. */

export interface WorkbenchWorkspaceController {
  setWorkspace(workspaceId: string | undefined): void
  synchronizeEditorLayout(): void
}

export interface WorkbenchWorkspaceLogger {
  info(message: string): void
}

/** Create the stable callback used by the editor's Workspace binding effect. */
export function createWorkbenchWorkspaceActivator(
  controller: WorkbenchWorkspaceController,
  logger: WorkbenchWorkspaceLogger,
): (workspaceId: string | undefined) => void {
  return (workspaceId): void => {
    controller.setWorkspace(workspaceId)
    controller.synchronizeEditorLayout()
    logger.info(workspaceId === undefined
      ? 'workbench-layout: synchronized middle editor without an available registered workspace'
      : `workbench-layout: synchronized middle editor for workspace ${JSON.stringify(workspaceId)}`)
  }
}
