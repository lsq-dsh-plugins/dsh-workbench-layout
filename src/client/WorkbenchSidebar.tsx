import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { FileTree } from './FileTree.tsx'
import { GitPanel } from './GitPanel.tsx'
import { useWorkbench } from './use-workbench.ts'
import css from './Workbench.module.css'

export type WorkbenchSidebarProps = PropsRuntime<'sidebar.workspaces'> & PropsLocale<'workbench'> & {
  controller: WorkbenchController
}

/** Sidebar replacement body; the official shell, brand, controls, and settings stay mounted. */
export function WorkbenchSidebar({ wide, useSessions, controller, t }: WorkbenchSidebarProps) {
  const state = useWorkbench(controller)
  const sessionId = useSessions(snapshot => snapshot.current)
  if (!wide) return <div className={css.collapsedBody} aria-hidden />
  return (
    <div className={css.sidebarBody}>
      {state.sidebarMode === 'git'
        ? <GitPanel controller={controller} sessionId={sessionId} t={t} />
        : <FileTree controller={controller} sessionId={sessionId} t={t} />}
    </div>
  )
}
