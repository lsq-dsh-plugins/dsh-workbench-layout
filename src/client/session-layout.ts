/** 将当前工作台会话绑定到 DSH 原生详情列状态。 */

export interface WorkbenchSessionController {
  setSession(sessionId: string): void
}

export interface WorkbenchDetailsLayout {
  openDetails(): void
}

export interface WorkbenchSessionLogger {
  info(message: string): void
}

/** 创建供编辑器会话副作用复用的稳定回调。 */
export function createWorkbenchSessionActivator(
  controller: WorkbenchSessionController,
  layout: WorkbenchDetailsLayout,
  logger: WorkbenchSessionLogger,
): (sessionId: string) => void {
  return (sessionId): void => {
    controller.setSession(sessionId)
    layout.openDetails()
    logger.info(`workbench-layout: activated native AppFrame details track for session ${JSON.stringify(sessionId)}`)
  }
}
