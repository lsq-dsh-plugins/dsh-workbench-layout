import type { WorkbenchController } from './controller.ts'

export const GIT_DECORATION_REFRESH_INTERVAL_MS = 2_000

type RefreshWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
type RefreshDocument = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>

/** Poll lightweight porcelain status while visible and refresh immediately when focus returns. */
export function installGitDecorationRefresh(
  controller: Pick<WorkbenchController, 'refreshGitDecorations'>,
  windowObject: RefreshWindow = window,
  documentObject: RefreshDocument = document,
): () => void {
  const refresh = (): void => {
    if (documentObject.visibilityState === 'hidden') return
    void controller.refreshGitDecorations()
  }
  const timer = windowObject.setInterval(refresh, GIT_DECORATION_REFRESH_INTERVAL_MS)
  windowObject.addEventListener('focus', refresh)
  documentObject.addEventListener('visibilitychange', refresh)
  refresh()
  return () => {
    windowObject.clearInterval(timer)
    windowObject.removeEventListener('focus', refresh)
    documentObject.removeEventListener('visibilitychange', refresh)
  }
}
