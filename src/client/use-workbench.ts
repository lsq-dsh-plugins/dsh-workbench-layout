import { useSyncExternalStore } from 'react'
import type { WorkbenchController, WorkbenchState } from './controller.ts'

/** Subscribe one component to the shared workbench snapshot. */
export function useWorkbench(controller: WorkbenchController): WorkbenchState {
  return useSyncExternalStore(
    callback => controller.store.subscribe(callback),
    () => controller.store.getSnapshot(),
    () => controller.store.getSnapshot(),
  )
}
