import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchController } from './controller.ts'
import type { WorkbenchKey } from './locales.ts'
import { FileTree } from './FileTree.tsx'
import { GitPanel } from './GitPanel.tsx'
import { useWorkbench } from './use-workbench.ts'
import { resolveWorkbenchWorkspaceId } from './workspace-binding.ts'
import css from './Workbench.module.css'

export type WorkbenchSidebarProps = PropsRuntime<'sidebar.workspaces'> & PropsLocale<'workbench'> & {
  controller: WorkbenchController
}

/** Sidebar replacement body; the official shell, brand, controls, and settings stay mounted. */
export function WorkbenchSidebar({ wide, useSessions, useWorkspaces, controller, t }: WorkbenchSidebarProps) {
  const state = useWorkbench(controller)
  const sessionId = useSessions(snapshot => snapshot.current)
  const workspaceId = useWorkspaces(snapshot => resolveWorkbenchWorkspaceId(
    snapshot.items,
    sessionId,
    snapshot.recentWorkspaceId,
  ))
  useEffect(() => { controller.setWorkspace(workspaceId) }, [controller, workspaceId])
  if (!wide) return <div className={css.collapsedBody} aria-hidden />
  return (
    <div className={css.sidebarBody}>
      {state.sidebarMode === 'git'
        ? <GitPanel controller={controller} workspaceId={workspaceId} t={t} />
        : <FileTree controller={controller} workspaceId={workspaceId} t={t} />}
    </div>
  )
}
