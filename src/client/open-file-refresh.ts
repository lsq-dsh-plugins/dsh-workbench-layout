import type { WorkbenchController } from './controller.ts'

export const OPEN_FILE_REFRESH_INTERVAL_MS = 1_000

type RefreshWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
type RefreshDocument = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>

/** Keep open Workspace files current while the page is visible, with immediate focus recovery. */
export function installOpenFileRefresh(
  controller: Pick<WorkbenchController, 'refreshOpenFiles'>,
  windowObject: RefreshWindow = window,
  documentObject: RefreshDocument = document,
): () => void {
  const refresh = (): void => {
    if (documentObject.visibilityState === 'hidden') return
    void controller.refreshOpenFiles()
  }
  const timer = windowObject.setInterval(refresh, OPEN_FILE_REFRESH_INTERVAL_MS)
  windowObject.addEventListener('focus', refresh)
  documentObject.addEventListener('visibilitychange', refresh)
  refresh()
  return () => {
    windowObject.clearInterval(timer)
    windowObject.removeEventListener('focus', refresh)
    documentObject.removeEventListener('visibilitychange', refresh)
  }
}
